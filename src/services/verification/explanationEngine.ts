import type {
    EvidenceAnalysis,
    EvidenceRetrieval,
    ExplanationEvidence,
    RiskAssessment,
    VerificationExplanation
} from "../../types/verification.js";

const getSummary = (level: RiskAssessment["level"]): string => {
    if (level === "high") {
        return "Several risk indicators are present. Pause and independently verify the message before taking action.";
    }
    if (level === "moderate") {
        return "Some risk indicators are present. Check the claims and source details before taking action.";
    }
    return "Few risk indicators were identified. Review the verification results before relying on the claims.";
};

export const createMockExplanation = (
    analysis: EvidenceAnalysis,
    retrieval: EvidenceRetrieval,
    risk: RiskAssessment
): VerificationExplanation => {
    const evidence: ExplanationEvidence[] = retrieval.results.flatMap((result) =>
        result.evidence.map((item) => ({
            id: item.id,
            title: item.title,
            sourceName: item.sourceName,
            sourceUrl: item.sourceUrl,
            source: result.source,
            retrievedAt: item.retrievedAt,
            isMock: item.isMock
        }))
    );

    const hasPaymentRequest = risk.factors.some(
        (factor) => factor.name === "payment_request"
    );

    return {
        mode: "mock",
        risk: { level: risk.level, score: risk.score },
        summary: getSummary(risk.level),
        reasons: risk.factors.map((factor) => factor.description),
        claims: analysis.assessments.map((assessment) => ({
            claim: assessment.claim,
            status: assessment.status,
            explanation: assessment.explanation,
            evidenceIds: assessment.evidenceIds
        })),
        evidence,
        limitations: risk.limitations,
        recommendedActions: [
            ...(hasPaymentRequest
                ? ["Do not pay the requested fee until you verify it independently."]
                : []),
            "Contact the named organization using its official website, app, or a phone number obtained independently.",
            "Avoid using links or contact details supplied in the message while verifying it.",
            "If you already shared financial information or made a payment, contact your bank through an official channel."
        ],
        notice: "This run uses a mock input and mock risk weights. Retrieved database passages may be real; this service does not yet assess whether they support or contradict the claim."
    };
};
