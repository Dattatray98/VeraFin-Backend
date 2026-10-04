import type {
    EvidenceAnalysis,
    EvidenceRetrieval,
    RiskAssessment,
    RiskFactor,
    RiskSignal
} from "../../types/verification.js";

const signalPoints: Record<RiskSignal["severity"], number> = {
    low: 1,
    medium: 2,
    high: 8
};

const getRiskLevel = (score: number): RiskAssessment["level"] => {
    if (score >= 8) return "high";
    if (score >= 4) return "moderate";
    return "low";
};

export const assessRisk = (
    riskSignals: RiskSignal[],
    verification: EvidenceAnalysis,
    retrieval: EvidenceRetrieval
): RiskAssessment => {
    const allEvidence = retrieval.results.flatMap((result) => result.evidence);
    const evidenceById = new Map(allEvidence.map((item) => [item.id, item]));
    const factors: RiskFactor[] = riskSignals.map((signal) => ({
        source: "message_signal",
        name: signal.indicator,
        description: signal.evidence,
        points: signalPoints[signal.severity]
    }));

    // Only strong risk-evidence matches selected by the analyzer add this factor.
    // A retrieved risk document by itself is not enough to increase the score.
    const strongRiskEvidenceIds = new Set(verification.riskEvidenceMatches
        .map((match) => match.evidenceId)
        .filter((id) => evidenceById.get(id)?.evidenceClass === "risk_evidence"));
    const trustedContradictions = new Map<string, string>();

    for (const assessment of verification.assessments) {
        if (assessment.status !== "contradicted") continue;
        for (const evidenceId of assessment.evidenceIds) {
            const evidence = evidenceById.get(evidenceId);
            if (!evidence) continue;
            if (evidence.evidenceClass === "risk_evidence") strongRiskEvidenceIds.add(evidenceId);
            if (evidence.evidenceClass === "trust_reference") {
                trustedContradictions.set(evidenceId, assessment.claim);
            }
        }
    }

    for (const evidenceId of strongRiskEvidenceIds) {
        const match = verification.riskEvidenceMatches.find((item) => item.evidenceId === evidenceId);
        factors.push({
            source: "risk_evidence",
            name: "strong_risk_evidence_match",
            description: match?.explanation ?? `Risk evidence directly contradicts a claim (${evidenceId})`,
            points: 8
        });
    }
    for (const [evidenceId, claim] of trustedContradictions) {
        factors.push({
            source: "verification",
            name: "trusted_reference_contradiction",
            description: `Trusted reference evidence contradicts this claim: ${claim} (${evidenceId})`,
            points: 8
        });
    }

    const score = factors.reduce((total, factor) => total + factor.points, 0);
    const level = getRiskLevel(score);
    const retrievalUnavailable = retrieval.results.some((result) => result.outcome === "retrieval_failed");
    const riskEvidenceFound = allEvidence.some((item) => item.evidenceClass === "risk_evidence");
    const trustEvidenceFound = allEvidence.some((item) => item.evidenceClass === "trust_reference");
    const verifiedClaims = verification.assessments
        .filter((assessment) => assessment.status === "supported" &&
            assessment.evidenceIds.some((id) => evidenceById.get(id)?.evidenceClass === "trust_reference"))
        .map((assessment) => assessment.claim);
    const contradictedClaims = verification.assessments
        .filter((assessment) => assessment.status === "contradicted" &&
            assessment.evidenceIds.some((id) => evidenceById.has(id)))
        .map((assessment) => assessment.claim);
    const assessedClaimNames = new Set([...verifiedClaims, ...contradictedClaims]);
    const unverifiedClaims = verification.assessments
        .filter((assessment) => !assessedClaimNames.has(assessment.claim))
        .map((assessment) => assessment.claim);
    const noMeaningfulMessageRiskSignals = !riskSignals.some((signal) => signal.severity !== "low");
    const allClaimsSupported = verification.assessments.length > 0 &&
        verifiedClaims.length === verification.assessments.length;
    const verifiedSafe = level === "low" && noMeaningfulMessageRiskSignals && !strongRiskEvidenceIds.size &&
        !contradictedClaims.length && trustEvidenceFound && allClaimsSupported && !retrievalUnavailable;

    const verificationStatus: RiskAssessment["verificationStatus"] = strongRiskEvidenceIds.size ||
        contradictedClaims.length
        ? "RISK_SUPPORTED"
        : retrievalUnavailable
            ? "UNAVAILABLE"
            : verifiedSafe
                ? "VERIFIED"
                : "UNVERIFIED";
    const decision: RiskAssessment["decision"] = level === "high"
        ? "HIGH_RISK"
        : level === "moderate"
            ? "MEDIUM_RISK"
            : verifiedSafe
                ? "VERIFIED_SAFE"
                : "LOW_RISK_UNVERIFIED";
    const limitations = verification.assessments
        .filter((assessment) => assessment.status === "unverified" || assessment.status === "unable_to_verify")
        .map((assessment) => assessment.status === "unable_to_verify"
            ? `Evidence retrieval was unavailable or incomplete for this claim: ${assessment.claim}`
            : `No sufficient reference evidence verified this claim: ${assessment.claim}`);

    if (retrievalUnavailable) limitations.push("One or more evidence searches failed; missing results do not indicate safety or risk.");
    if (!riskEvidenceFound) limitations.push("No matching risk evidence was found; this does not prove the message is safe.");
    if (!trustEvidenceFound) limitations.push("No matching trust/reference evidence was found; relevant claims remain unverified.");

    // This is a coarse decision-support heuristic, not a calibrated probability.
    const confidence = retrievalUnavailable
        ? 0.2
        : verifiedSafe
            ? 0.9
            : verificationStatus === "RISK_SUPPORTED"
                ? 0.85
                : level === "moderate" || level === "high"
                    ? 0.7
                    : 0.4;
    const verificationScore = verification.assessments.length
        ? Math.round((verifiedClaims.length / verification.assessments.length) * 100)
        : undefined;

    return {
        mode: "deterministic",
        score,
        level,
        decision,
        verificationStatus,
        ...(verificationScore === undefined ? {} : { verificationScore }),
        confidence,
        riskEvidenceFound,
        trustEvidenceFound,
        verifiedClaims,
        unverifiedClaims,
        contradictedClaims,
        factors,
        limitations,
        interpretation: "Risk is based on message indicators and directly matching evidence. Verification and evidence availability are separate; missing evidence does not prove safety or risk."
    };
};
