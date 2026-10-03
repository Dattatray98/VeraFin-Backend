import type {
    ClaimAssessment,
    EvidenceAnalysis,
    EvidenceRetrieval,
    VerificationPlannerInput
} from "../../types/verification.js";

export const analyzeEvidence = (
    input: VerificationPlannerInput,
    retrieval: EvidenceRetrieval
): EvidenceAnalysis => {
    const assessments: ClaimAssessment[] = input.claims.map((claim) => {
        const relatedResults = retrieval.results.filter(
            (result) => result.target.type === "claim" && result.target.value === claim.claim
        );
        const retrievalFailed = relatedResults.some(
            (result) => result.outcome === "retrieval_failed"
        );
        const evidenceIds = relatedResults.flatMap((result) =>
            result.evidence.map((evidence) => evidence.id)
        );
        const status = relatedResults.length === 0 || retrievalFailed
            ? "unable_to_verify"
            : "unverified";
        const hasEvidence = relatedResults.some((result) => result.evidence.length > 0);

        return {
            claim: claim.claim,
            claimType: claim.claim_type,
            status,
            relatedQueryIds: relatedResults.map((result) => result.queryId),
            evidenceIds,
            explanation: status === "unable_to_verify"
                ? "At least one relevant source failed or no planned retrieval result was available. This is a retrieval limitation, not evidence against the claim."
                : hasEvidence
                    ? "Related passages were retrieved, but this analyzer does not yet determine whether they support or contradict the claim."
                    : "No matching passages were retrieved from the completed sources. This does not establish that the claim is false."
        };
    });

    return { mode: "preliminary", assessments };
};
