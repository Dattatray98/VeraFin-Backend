export interface EvidenceChunkInput {
    id: string;
    vector: number[];
    content: string;
    documentId: string;
    title: string;
    documentType: string;
    sourceOrganization: string;
    sourceUrl: string;
    authorityLevel: string;
    publishedAt: string | null;
    retrievedAt: string;
    chunkIndex: number;
    pageNumber: number | null;
    isMock: boolean;
    pdfUrl?: string;
    sourcePage?: string;
    contentHash?: string;
}

export interface EvidenceChunk extends EvidenceChunkInput {}

export interface EvidenceSearchHit extends EvidenceChunk {
    distance: number;
}
