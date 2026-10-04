import type { EvidenceChunkInput, EvidenceSearchHit } from "../../types/evidence.js";

interface ChromaCollection {
    id: string;
    name: string;
}

interface ChromaResult {
    ids?: string[][];
    documents?: Array<Array<string | null>>;
    metadatas?: Array<Array<Record<string, unknown> | null>>;
    distances?: Array<Array<number | null>>;
}

const BASE_URL = (process.env.CHROMA_URL ?? "http://localhost:8000").replace(/\/$/, "");
const TENANT = process.env.CHROMA_TENANT ?? "default_tenant";
const DATABASE = process.env.CHROMA_DATABASE ?? "default_database";
const COLLECTION = process.env.CHROMA_COLLECTION ?? "verafin_evidence";
const TOKEN = process.env.CHROMA_TOKEN;
const PAGE_SIZE = 100;

const collectionsUrl = `${BASE_URL}/api/v2/tenants/${encodeURIComponent(TENANT)}/databases/${encodeURIComponent(DATABASE)}/collections`;

const requestJson = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    if (TOKEN) headers.set("x-chroma-token", TOKEN);

    let response: Response;
    try {
        response = await fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(10_000) });
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Cannot connect to Chroma at ${BASE_URL}: ${detail}. Start a persistent Chroma server first.`);
    }

    const body = await response.text();
    if (!response.ok) {
        throw new Error(`Chroma request failed (${response.status}) at ${url}: ${body.slice(0, 500)}`);
    }
    if (!body) return undefined as T;
    return JSON.parse(body) as T;
};

const collectionPromises = new Map<string, Promise<ChromaCollection>>();

const createOrLoadCollection = async (collectionName: string): Promise<ChromaCollection> => {
    let offset = 0;
    while (true) {
        const collections = await requestJson<ChromaCollection[]>(`${collectionsUrl}?limit=${PAGE_SIZE}&offset=${offset}`);
        const existing = collections.find((collection) => collection.name === collectionName);
        if (existing) return existing;
        if (collections.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    return requestJson<ChromaCollection>(collectionsUrl, {
        method: "POST",
        body: JSON.stringify({
            name: collectionName,
            metadata: { "hnsw:space": "cosine" }
        })
    });
};

const getCollection = async (collectionName = COLLECTION): Promise<ChromaCollection> => {
    let collectionPromise = collectionPromises.get(collectionName);
    if (!collectionPromise) {
        collectionPromise = createOrLoadCollection(collectionName).catch((error: unknown) => {
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

const toMetadata = (chunk: EvidenceChunkInput): Record<string, string | number | boolean> => ({
    documentId: chunk.documentId,
    title: chunk.title,
    documentType: chunk.documentType,
    sourceOrganization: chunk.sourceOrganization,
    sourceUrl: chunk.sourceUrl,
    authorityLevel: chunk.authorityLevel,
    retrievedAt: chunk.retrievedAt,
    chunkIndex: chunk.chunkIndex,
    isMock: chunk.isMock,
    ...(chunk.publishedAt === null ? {} : { publishedAt: chunk.publishedAt }),
    ...(chunk.pageNumber === null ? {} : { pageNumber: chunk.pageNumber }),
    ...(chunk.pdfUrl === undefined ? {} : { pdfUrl: chunk.pdfUrl }),
    ...(chunk.sourcePage === undefined ? {} : { sourcePage: chunk.sourcePage }),
    ...(chunk.contentHash === undefined ? {} : { contentHash: chunk.contentHash })
});

const getIdsForDocument = async (collectionId: string, documentId: string): Promise<string[]> => {
    const result = await requestJson<{ ids?: string[] }>(`${collectionsUrl}/${encodeURIComponent(collectionId)}/get`, {
        method: "POST",
        body: JSON.stringify({ where: { documentId }, include: ["metadatas"] })
    });
    return result.ids ?? [];
};

export const replaceEvidenceForDocument = async (documentId: string, chunks: EvidenceChunkInput[], collectionName = COLLECTION): Promise<void> => {
    validateChunks(chunks);
    if (chunks.some((chunk) => chunk.documentId !== documentId)) {
        throw new Error("All replacement chunks must use the requested document ID");
    }

    const collection = await getCollection(collectionName);
    const previousIds = await getIdsForDocument(collection.id, documentId);
    await upsertEvidenceChunks(chunks, collectionName);
    const currentIds = new Set(chunks.map((chunk) => chunk.id));
    const obsoleteIds = previousIds.filter((id) => !currentIds.has(id));
    if (obsoleteIds.length) {
        await requestJson(`${collectionsUrl}/${encodeURIComponent(collection.id)}/delete`, {
            method: "POST",
            body: JSON.stringify({ ids: obsoleteIds })
        });
    }
};

export const upsertEvidenceChunks = async (chunks: EvidenceChunkInput[], collectionName = COLLECTION): Promise<void> => {
    validateChunks(chunks);
    const collection = await getCollection(collectionName);
    await requestJson(`${collectionsUrl}/${encodeURIComponent(collection.id)}/upsert`, {
        method: "POST",
        body: JSON.stringify({
            ids: chunks.map((chunk) => chunk.id),
            embeddings: chunks.map((chunk) => chunk.vector),
            metadatas: chunks.map(toMetadata),
            documents: chunks.map((chunk) => chunk.content)
        })
    });
};

export const searchEvidenceByVector = async (vector: number[], limit = 5, collectionName = COLLECTION): Promise<EvidenceSearchHit[]> => {
    if (!vector.length || !vector.every(Number.isFinite)) throw new Error("A non-empty finite query vector is required");
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Search limit must be an integer between 1 and 50");

    const collection = await getCollection(collectionName);
    const result = await requestJson<ChromaResult>(`${collectionsUrl}/${encodeURIComponent(collection.id)}/query`, {
        method: "POST",
        body: JSON.stringify({
            query_embeddings: [vector],
            n_results: limit,
            where: { isMock: false },
            include: ["distances", "metadatas", "documents"]
        })
    });

    const ids = result.ids?.[0] ?? [];
    const documents = result.documents?.[0] ?? [];
    const metadatas = result.metadatas?.[0] ?? [];
    const distances = result.distances?.[0] ?? [];
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
            distance: Number(distances[index] ?? 0),
            ...(metadata.pdfUrl == null ? {} : { pdfUrl: String(metadata.pdfUrl) }),
            ...(metadata.sourcePage == null ? {} : { sourcePage: String(metadata.sourcePage) }),
            ...(metadata.contentHash == null ? {} : { contentHash: String(metadata.contentHash) })
        }];
    });
};

export const countEvidenceChunks = async (collectionName = COLLECTION): Promise<number> => {
    const collection = await getCollection(collectionName);
    const result = await requestJson<number | { count: number }>(`${collectionsUrl}/${encodeURIComponent(collection.id)}/count`);
    return typeof result === "number" ? result : result.count;
};

export const hasEvidenceForDocument = async (documentId: string, collectionName = COLLECTION): Promise<boolean> => {
    const collection = await getCollection(collectionName);
    const ids = await getIdsForDocument(collection.id, documentId);
    return ids.length > 0;
};
