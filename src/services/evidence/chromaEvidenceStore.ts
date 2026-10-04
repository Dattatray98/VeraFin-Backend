import type { Collection, Metadata } from "chromadb";
import { chromaClient } from "../../config/chroma.js";
import type { EvidenceChunkInput, EvidenceSearchHit } from "../../types/evidence.js";

const COLLECTION = process.env.CHROMA_COLLECTION ?? "verafin_evidence";
const UPSERT_BATCH_SIZE = 500;
const collectionPromises = new Map<string, Promise<Collection>>();

const getCollection = (collectionName = COLLECTION): Promise<Collection> => {
    let collectionPromise = collectionPromises.get(collectionName);
    if (!collectionPromise) {
        collectionPromise = chromaClient.getOrCreateCollection({
            name: collectionName,
            metadata: { "hnsw:space": "cosine" },
            embeddingFunction: null
        }).catch((error: unknown) => {
            collectionPromises.delete(collectionName);
            throw error;
        });
        collectionPromises.set(collectionName, collectionPromise);
    }
    return collectionPromise;
};

const validateChunks = (chunks: EvidenceChunkInput[]): void => {
    if (!chunks.length) throw new Error("At least one evidence chunk is required");
    const dimensions = chunks[0].vector.length;
    const ids = new Set<string>();
    if (!dimensions) throw new Error("Evidence vectors cannot be empty");

    for (const chunk of chunks) {
        if (!chunk.id.trim() || ids.has(chunk.id)) throw new Error(`Invalid or duplicate evidence chunk id: ${chunk.id}`);
        ids.add(chunk.id);
        if (chunk.vector.length !== dimensions || !chunk.vector.every(Number.isFinite)) {
            throw new Error(`Evidence vector has invalid dimensions or values: ${chunk.id}`);
        }
        if (!chunk.content.trim()) throw new Error(`Evidence content cannot be empty: ${chunk.id}`);
    }
};

const toMetadata = (chunk: EvidenceChunkInput): Metadata => ({
    documentId: chunk.documentId,
    title: chunk.title,
    documentType: chunk.documentType,
    sourceOrganization: chunk.sourceOrganization,
    sourceUrl: chunk.sourceUrl,
    authorityLevel: chunk.authorityLevel,
    retrievedAt: chunk.retrievedAt,
    chunkIndex: chunk.chunkIndex,
    isMock: chunk.isMock,
    evidenceClass: chunk.evidenceClass ?? "risk_evidence",
    ...(chunk.publishedAt === null ? {} : { publishedAt: chunk.publishedAt }),
    ...(chunk.pageNumber === null ? {} : { pageNumber: chunk.pageNumber }),
    ...(chunk.pdfUrl === undefined ? {} : { pdfUrl: chunk.pdfUrl }),
    ...(chunk.sourcePage === undefined ? {} : { sourcePage: chunk.sourcePage }),
    ...(chunk.contentHash === undefined ? {} : { contentHash: chunk.contentHash })
});

const getIdsForDocument = async (collection: Collection, documentId: string): Promise<string[]> => {
    const result = await collection.get({ where: { documentId }, include: ["metadatas"] });
    return result.ids;
};

export interface EvidenceReplacementWriter {
    storeChunk(chunk: EvidenceChunkInput): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
}

/** Starts a replacement that stores each chunk as soon as its embedding is ready. */
export const beginEvidenceReplacement = async (
    documentId: string,
    collectionName = COLLECTION
): Promise<EvidenceReplacementWriter> => {
    const collection = await getCollection(collectionName);
    const previousIds = await getIdsForDocument(collection, documentId);
    const previousIdSet = new Set(previousIds);
    const storedIds = new Set<string>();
    let finished = false;

    return {
        async storeChunk(chunk): Promise<void> {
            if (finished) throw new Error("Evidence replacement is already finished");
            if (chunk.documentId !== documentId) throw new Error("Replacement chunk has a different document ID");
            validateChunks([chunk]);
            await collection.upsert({
                ids: [chunk.id],
                embeddings: [chunk.vector],
                metadatas: [toMetadata(chunk)],
                documents: [chunk.content]
            });
            storedIds.add(chunk.id);
        },
        async commit(): Promise<void> {
            if (finished) throw new Error("Evidence replacement is already finished");
            if (!storedIds.size) throw new Error("Cannot commit an empty evidence replacement");
            const obsoleteIds = previousIds.filter((id) => !storedIds.has(id));
            if (obsoleteIds.length) await collection.delete({ ids: obsoleteIds });
            finished = true;
        },
        async rollback(): Promise<void> {
            if (finished) return;
            const newIds = [...storedIds].filter((id) => !previousIdSet.has(id));
            if (newIds.length) await collection.delete({ ids: newIds });
            finished = true;
        }
    };
};

export const replaceEvidenceForDocument = async (
    documentId: string,
    chunks: EvidenceChunkInput[],
    collectionName = COLLECTION
): Promise<void> => {
    validateChunks(chunks);
    if (chunks.some((chunk) => chunk.documentId !== documentId)) {
        throw new Error("All replacement chunks must use the requested document ID");
    }

    const collection = await getCollection(collectionName);
    const previousIds = await getIdsForDocument(collection, documentId);
    await upsertEvidenceChunks(chunks, collectionName);
    const currentIds = new Set(chunks.map((chunk) => chunk.id));
    const obsoleteIds = previousIds.filter((id) => !currentIds.has(id));
    if (obsoleteIds.length) await collection.delete({ ids: obsoleteIds });
};

export const upsertEvidenceChunks = async (chunks: EvidenceChunkInput[], collectionName = COLLECTION): Promise<void> => {
    validateChunks(chunks);
    const collection = await getCollection(collectionName);
    for (let offset = 0; offset < chunks.length; offset += UPSERT_BATCH_SIZE) {
        const batch = chunks.slice(offset, offset + UPSERT_BATCH_SIZE);
        await collection.upsert({
            ids: batch.map((chunk) => chunk.id),
            embeddings: batch.map((chunk) => chunk.vector),
            metadatas: batch.map(toMetadata),
            documents: batch.map((chunk) => chunk.content)
        });
    }
};

export const searchEvidenceByVector = async (
    vector: number[],
    limit = 5,
    collectionName = COLLECTION
): Promise<EvidenceSearchHit[]> => {
    if (!vector.length || !vector.every(Number.isFinite)) throw new Error("A non-empty finite query vector is required");
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Search limit must be an integer between 1 and 50");

    const collection = await getCollection(collectionName);
    const result = await collection.query({
        queryEmbeddings: [vector],
        nResults: limit,
        where: { isMock: false },
        include: ["distances", "metadatas", "documents"]
    });

    const ids = result.ids[0] ?? [];
    const documents = result.documents[0] ?? [];
    const metadatas = result.metadatas[0] ?? [];
    const distances = result.distances[0] ?? [];
    return ids.flatMap((id, index) => {
        const metadata = metadatas[index];
        const content = documents[index];
        if (!metadata || content === null || content === undefined) return [];
        return [{
            id,
            vector: [],
            content,
            documentId: String(metadata.documentId ?? ""),
            title: String(metadata.title ?? ""),
            documentType: String(metadata.documentType ?? ""),
            sourceOrganization: String(metadata.sourceOrganization ?? ""),
            sourceUrl: String(metadata.sourceUrl ?? ""),
            authorityLevel: String(metadata.authorityLevel ?? ""),
            publishedAt: metadata.publishedAt == null ? null : String(metadata.publishedAt),
            retrievedAt: String(metadata.retrievedAt ?? ""),
            chunkIndex: Number(metadata.chunkIndex ?? 0),
            pageNumber: metadata.pageNumber == null ? null : Number(metadata.pageNumber),
            isMock: Boolean(metadata.isMock),
            evidenceClass: metadata.evidenceClass === "trust_reference" ? "trust_reference" : "risk_evidence",
            distance: Number(distances[index] ?? 0),
            ...(metadata.pdfUrl == null ? {} : { pdfUrl: String(metadata.pdfUrl) }),
            ...(metadata.sourcePage == null ? {} : { sourcePage: String(metadata.sourcePage) }),
            ...(metadata.contentHash == null ? {} : { contentHash: String(metadata.contentHash) })
        }];
    });
};

export const countEvidenceChunks = async (collectionName = COLLECTION): Promise<number> => {
    const collection = await getCollection(collectionName);
    return collection.count();
};

export const hasEvidenceForDocument = async (documentId: string, collectionName = COLLECTION): Promise<boolean> => {
    const collection = await getCollection(collectionName);
    const ids = await getIdsForDocument(collection, documentId);
    return ids.length > 0;
};
