import { searchEvidenceByVector } from "../evidence/lanceEvidenceStore.js";
import type {
    EvidenceItem,
    EvidenceRetrieval,
    QueryRetrievalResult,
    VerificationPlan
} from "../../types/verification.js";

export const retrieveEvidence = async (
    plan: VerificationPlan,
    queryVectors: Record<string, number[]>
): Promise<EvidenceRetrieval> => {
    const results: QueryRetrievalResult[] = [];

    for (const query of plan.queries) {
        if (query.source !== "vector_db") {
            results.push({
                queryId: query.id,
                source: query.source,
                target: query.target,
                outcome: "retrieval_failed",
                evidence: [],
                error: `No real retriever is configured for ${query.source}`
            });
            continue;
        }

        const vector = queryVectors[query.id];
        if (!vector) {
            results.push({
                queryId: query.id,
                source: query.source,
                target: query.target,
                outcome: "retrieval_failed",
                evidence: [],
                error: "A query embedding was not provided"
            });
            continue;
        }

        try {
            const hits = await searchEvidenceByVector(vector);
            const evidence: EvidenceItem[] = hits.map((hit) => ({
                id: hit.id,
                title: hit.title,
                sourceName: hit.sourceOrganization,
                sourceUrl: hit.sourceUrl,
                publishedAt: hit.publishedAt,
                retrievedAt: new Date().toISOString(),
                content: hit.content,
                isMock: hit.isMock,
                documentId: hit.documentId,
                documentType: hit.documentType,
                sourceOrganization: hit.sourceOrganization,
                authorityLevel: hit.authorityLevel,
                chunkIndex: hit.chunkIndex,
                pageNumber: hit.pageNumber
            }));

            results.push({
                queryId: query.id,
                source: query.source,
                target: query.target,
                outcome: evidence.length > 0 ? "evidence_found" : "no_evidence_found",
                evidence
            });
        } catch (error) {
            results.push({
                queryId: query.id,
                source: query.source,
                target: query.target,
                outcome: "retrieval_failed",
                evidence: [],
                error: error instanceof Error ? error.message : "LanceDB retrieval failed"
            });
        }
    }

    return { mode: "lancedb", results };
};
