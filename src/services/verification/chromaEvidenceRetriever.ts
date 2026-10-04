import { searchEvidenceByVector } from "../evidence/chromaEvidenceStore.js";
import { generateEmbedding } from "../AI_Models/embeddingModel.js";
import type {
    EvidenceItem,
    EvidenceRetrieval,
    QueryRetrievalResult,
    VerificationPlan
} from "../../types/verification.js";

// Chroma cosine distance is lower for closer matches. Discard weak matches and
// keep only a small number of the strongest chunks for each planned query.
const MAX_COSINE_DISTANCE = 0.45;
const MAX_EVIDENCE_PER_QUERY = 2;

export const retrieveEvidence = async (
    plan: VerificationPlan
): Promise<EvidenceRetrieval> => {
    const results: QueryRetrievalResult[] = [];

    for (const query of plan.queries) {
        try {
            const vector = await generateEmbedding(query.query);
            const hits = await searchEvidenceByVector(vector, 5);
            const evidence: EvidenceItem[] = hits
                .filter((hit) => hit.distance <= MAX_COSINE_DISTANCE)
                .slice(0, MAX_EVIDENCE_PER_QUERY)
                .map((hit) => ({
                    id: hit.id,
                    title: hit.title,
                    sourceName: hit.sourceOrganization,
                    sourceUrl: hit.sourceUrl,
                    publishedAt: hit.publishedAt,
                    retrievedAt: new Date().toISOString(),
                    content: hit.content,
                    isMock: hit.isMock,
                    evidenceClass: hit.evidenceClass,
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
                error: error instanceof Error ? error.message : "Chroma retrieval failed"
            });
        }
    }

    return { mode: "chroma", results };
};
