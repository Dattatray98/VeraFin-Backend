import type {
    EvidenceAnalysis,
    RiskAssessment,
    RiskFactor,
    RiskSignal
} from "../../types/verification.js";

const signalPoints: Record<RiskSignal["severity"], number> = {
    low: 1,
    medium: 2,
    high: 3
};

const getRiskLevel = (score: number): RiskAssessment["level"] => {
    if (score >= 8) return "high";
    if (score >= 4) return "moderate";
    return "low";
};

export const assessRisk = (
    riskSignals: RiskSignal[],
    verification: EvidenceAnalysis
): RiskAssessment => {
    const factors: RiskFactor[] = riskSignals.map((signal) => ({
        source: "message_signal",
        name: signal.indicator,
        description: signal.evidence,
        points: signalPoints[signal.severity]
    }));

    for (const assessment of verification.assessments) {
        if (assessment.status === "contradicted") {
            factors.push({
                source: "verification",
                name: "claim_contradicted",
                description: `Retrieved evidence contradicts this claim: ${assessment.claim}`,
                points: 3
            });
        }
    }

    const score = factors.reduce((total, factor) => total + factor.points, 0);
    const limitations = verification.assessments
        .filter((assessment) =>
            assessment.status === "unverified" || assessment.status === "unable_to_verify"
        )
        .map((assessment) =>
            assessment.status === "unable_to_verify"
                ? `Retrieval failed or was incomplete for this claim: ${assessment.claim}`
                : `No usable evidence verified this claim: ${assessment.claim}`
        );

    return {
        mode: "mock",
        score,
        level: getRiskLevel(score),
        factors,
        limitations,
        interpretation: "This mock risk level summarizes reported signals. It does not establish that a message or claim is fraudulent."
    };
};
