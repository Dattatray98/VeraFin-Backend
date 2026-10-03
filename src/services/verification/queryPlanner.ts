import type {
    EvidenceSource,
    VerificationPlan,
    VerificationPlannerInput,
    VerificationQuery
} from "../../types/verification.js";

const claimSources: EvidenceSource[] = ["vector_db", "browser_api"];

export const createVerificationPlan = (
    input: VerificationPlannerInput
): VerificationPlan => {
    const queries: VerificationQuery[] = [];

    for (const claim of input.claims) {
        for (const source of claimSources) {
            queries.push({
                id: `query-${queries.length + 1}`,
                query: source === "vector_db"
                    ? `Find authoritative evidence relevant to this claim: ${claim.claim}`
                    : `Find current public information related to this claim: ${claim.claim}`,
                source,
                target: { type: "claim", value: claim.claim },
                purpose: source === "vector_db"
                    ? `Compare the claim with trusted stored documents (${claim.claim_type}).`
                    : `Check for recent public information; treat search results as external evidence (${claim.claim_type}).`
            });
        }
    }

    for (const entity of input.entities) {
        queries.push({
            id: `query-${queries.length + 1}`,
            query: `Check whether ${entity.name} is a recognized ${entity.type}.`,
            source: "structured_db",
            target: { type: "entity", value: entity.name },
            purpose: "Verify the entity against structured reference data."
        });
    }

    for (const link of input.links) {
        queries.push({
            id: `query-${queries.length + 1}`,
            query: `Check whether ${link.domain} is an official domain associated with the message's entities.`,
            source: "structured_db",
            target: { type: "domain", value: link.domain },
            purpose: `Compare the supplied domain with known official domains. URL: ${link.url}`
        });
    }

    return { mode: "mock", queries };
};
