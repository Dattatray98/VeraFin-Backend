import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { connect } from "@lancedb/lancedb";
import type { Connection, Table } from "@lancedb/lancedb";
import type { EvidenceChunkInput, EvidenceSearchHit } from "../../types/evidence.js";

const TABLE_NAME = "evidence_chunks";
const DATABASE_PATH = resolve(
    process.cwd(),
    process.env.EVIDENCE_DB_PATH ?? "data/evidence/lancedb"
);

let connectionPromise: Promise<Connection> | undefined;

const getConnection = async (): Promise<Connection> => {
    if (!connectionPromise) {
        connectionPromise = (async () => {
            await mkdir(dirname(DATABASE_PATH), { recursive: true });
            return connect(DATABASE_PATH);
        })().catch((error: unknown) => {
            connectionPromise = undefined;
            throw error;
        });
    }

    return connectionPromise;
};

const getExistingTable = async (connection: Connection): Promise<Table | null> => {
    const tableNames = await connection.tableNames();
    if (!tableNames.includes(TABLE_NAME)) return null;
    return connection.openTable(TABLE_NAME);
};

const validateChunks = (chunks: EvidenceChunkInput[]): void => {
    if (chunks.length === 0) {
        throw new Error("At least one evidence chunk is required");
    }

    const vectorSize = chunks[0].vector.length;
    if (vectorSize === 0) {
        throw new Error("Evidence vectors cannot be empty");
    }

    const ids = new Set<string>();
    for (const chunk of chunks) {
        if (!chunk.id.trim()) throw new Error("Evidence chunk id cannot be empty");
        if (ids.has(chunk.id)) throw new Error(`Duplicate evidence chunk id: ${chunk.id}`);
        ids.add(chunk.id);

        if (chunk.vector.length !== vectorSize) {
            throw new Error("All evidence vectors in a batch must have the same dimensions");
        }
        if (!chunk.vector.every(Number.isFinite)) {
            throw new Error(`Evidence vector contains a non-finite value: ${chunk.id}`);
        }
        if (!chunk.content.trim()) throw new Error(`Evidence content cannot be empty: ${chunk.id}`);
    }
};

export const upsertEvidenceChunks = async (
    chunks: EvidenceChunkInput[]
): Promise<void> => {
    validateChunks(chunks);
    const records: Record<string, unknown>[] = chunks.map((chunk) => ({ ...chunk }));
    const connection = await getConnection();
    const existingTable = await getExistingTable(connection);

    if (!existingTable) {
        await connection.createTable(TABLE_NAME, records);
        return;
    }

    await existingTable
        .mergeInsert("id")
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute(records);
};

export const searchEvidenceByVector = async (
    vector: number[],
    limit = 5
): Promise<EvidenceSearchHit[]> => {
    if (vector.length === 0 || !vector.every(Number.isFinite)) {
        throw new Error("A non-empty finite query vector is required");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new Error("Search limit must be an integer between 1 and 50");
    }

    const connection = await getConnection();
    const table = await getExistingTable(connection);
    if (!table) return [];

    const rows = await table
        .vectorSearch(vector)
        .distanceType("cosine")
        .where("isMock = false")
        .limit(limit)
        .toArray();

    return rows.map((row) => {
        const record = row as Record<string, unknown>;
        const resultVector = record.vector;
        const normalizedVector = Array.isArray(resultVector)
            ? resultVector.map(Number)
            : resultVector instanceof Float32Array
                ? Array.from(resultVector)
                : [];

        return {
            id: String(record.id),
            vector: normalizedVector,
            content: String(record.content),
            documentId: String(record.documentId),
            title: String(record.title),
            documentType: String(record.documentType),
            sourceOrganization: String(record.sourceOrganization),
            sourceUrl: String(record.sourceUrl),
            authorityLevel: String(record.authorityLevel),
            publishedAt: record.publishedAt == null ? null : String(record.publishedAt),
            retrievedAt: String(record.retrievedAt),
            chunkIndex: Number(record.chunkIndex),
            pageNumber: record.pageNumber == null ? null : Number(record.pageNumber),
            isMock: Boolean(record.isMock),
            distance: Number(record._distance)
        };
    });
};

export const countEvidenceChunks = async (): Promise<number> => {
    const connection = await getConnection();
    const table = await getExistingTable(connection);
    if (!table) return 0;
    return table.countRows();
};
