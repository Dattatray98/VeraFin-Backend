import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { generateEmbedding } from "../AI_Models/embeddingModel.js";
import { countEvidenceChunks, hasEvidenceForDocument, replaceEvidenceForDocument } from "./chromaEvidenceStore.js";
import type { EvidenceChunkInput } from "../../types/evidence.js";

const execFile = promisify(execFileCallback);
const INPUT_DIRECTORY = resolve(process.cwd(), process.env.PDF_INPUT_DIRECTORY ?? "data/inputdata");
const STATE_FILE = resolve(process.cwd(), "data/metadata/input-pdf-ingestion.json");
const PDFTOTEXT_BIN = process.env.PDFTOTEXT_BIN ?? "pdftotext";
const PDFINFO_BIN = process.env.PDFINFO_BIN ?? "pdfinfo";
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;
const STABILITY_CHECK_MS = 500;
const STABILITY_CHECKS = 3;

interface IngestedFileState {
    contentHash: string;
    documentId: string;
    chunkIds: string[];
    status: "complete" | "failed";
    updatedAt: string;
    error?: string;
}

interface IngestionState {
    version: 1;
    files: Record<string, IngestedFileState>;
}

interface ExtractedPage {
    pageNumber: number;
    text: string;
}

const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

const readState = async (): Promise<IngestionState> => {
    try {
        const parsed = JSON.parse(await readFile(STATE_FILE, "utf8")) as IngestionState;
        return parsed?.version === 1 && parsed.files ? parsed : { version: 1, files: {} };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, files: {} };
        throw error;
    }
};

const writeState = async (state: IngestionState): Promise<void> => {
    await mkdir(dirname(STATE_FILE), { recursive: true });
    const temporaryPath = `${STATE_FILE}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporaryPath, STATE_FILE);
};

const waitUntilFileStable = async (filePath: string): Promise<void> => {
    let lastSize = -1;
    let lastMtime = -1;
    let stableChecks = 0;
    for (let attempt = 0; attempt < 30 && stableChecks < STABILITY_CHECKS; attempt += 1) {
        const fileStats = await stat(filePath);
        if (fileStats.size === lastSize && fileStats.mtimeMs === lastMtime && fileStats.size > 0) {
            stableChecks += 1;
        } else {
            stableChecks = 0;
            lastSize = fileStats.size;
            lastMtime = fileStats.mtimeMs;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, STABILITY_CHECK_MS));
    }
    if (stableChecks < STABILITY_CHECKS) throw new Error("PDF file did not finish writing before timeout");
};

const extractPages = async (pdfPath: string): Promise<ExtractedPage[]> => {
    const { stdout: info } = await execFile(PDFINFO_BIN, [pdfPath], { timeout: 30_000, maxBuffer: 2_000_000 });
    const pageCount = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
    if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("Could not read PDF page count");

    const { stdout } = await execFile(PDFTOTEXT_BIN, ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
        timeout: 60_000,
        maxBuffer: 80_000_000,
        encoding: "utf8"
    });
    const pageTexts = stdout.split("\f");
    while (pageTexts.length > pageCount && !pageTexts[pageTexts.length - 1].trim()) pageTexts.pop();
    return Array.from({ length: pageCount }, (_, index) => ({
        pageNumber: index + 1,
        text: (pageTexts[index] ?? "").replace(/\r/g, "").replace(/[\t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
    }));
};

const splitPageIntoChunks = (page: ExtractedPage): string[] => {
    const text = page.text.replace(/\s+/g, " ").trim();
    if (!text) return [];
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        let end = Math.min(start + CHUNK_SIZE, text.length);
        if (end < text.length) {
            const boundary = Math.max(
                text.lastIndexOf(". ", end),
                text.lastIndexOf("? ", end),
                text.lastIndexOf("! ", end)
            );
            if (boundary > start + CHUNK_SIZE * 0.65) end = boundary + 1;
            else {
                const wordBoundary = text.lastIndexOf(" ", end);
                if (wordBoundary > start + CHUNK_SIZE * 0.65) end = wordBoundary;
            }
        }
        const chunk = text.slice(start, end).trim();
        if (chunk) chunks.push(chunk);
        if (end >= text.length) break;
        start = Math.max(end - CHUNK_OVERLAP, start + 1);
    }
    return chunks;
};

const processPdf = async (filePath: string, state: IngestionState): Promise<void> => {
    const relativePath = relative(INPUT_DIRECTORY, filePath);
    await waitUntilFileStable(filePath);
    const bytes = await readFile(filePath);
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("File does not have a valid PDF signature");

    const contentHash = sha256(bytes);
    const previous = state.files[relativePath];
    if (previous?.status === "complete" && previous.contentHash === contentHash) {
        if (await hasEvidenceForDocument(previous.documentId)) {
            console.log(`[PDF-INGEST] ${relativePath} | unchanged; skipped`);
            return;
        }
    }

    await countEvidenceChunks();
    const documentId = sha256(relativePath).slice(0, 32);
    const title = basename(filePath, extname(filePath));
    const pages = await extractPages(filePath);
    const extractedText = pages.map((page) => page.text).join("\n").trim();
    if (extractedText.length < 120) {
        throw new Error("Extracted text is too short; this PDF may be scanned and require OCR");
    }

    const chunkRows = pages.flatMap((page) => splitPageIntoChunks(page).map((content) => ({ pageNumber: page.pageNumber, content })));
    if (!chunkRows.length) throw new Error("PDF produced no non-empty text chunks");

    console.log(`[PDF-INGEST] ${relativePath} | extracted pages=${pages.length} chars=${extractedText.length} chunks=${chunkRows.length}`);
    const retrievedAt = new Date().toISOString();
    const chunks: EvidenceChunkInput[] = [];
    for (let chunkIndex = 0; chunkIndex < chunkRows.length; chunkIndex += 1) {
        const chunk = chunkRows[chunkIndex];
        const id = sha256(`${documentId}:${contentHash}:${chunkIndex}`).slice(0, 40);
        chunks.push({
            id,
            vector: await generateEmbedding(chunk.content),
            content: chunk.content,
            documentId,
            title,
            documentType: "uploaded_pdf",
            sourceOrganization: "User-provided PDF",
            sourceUrl: pathToFileURL(filePath).toString(),
            authorityLevel: "unverified",
            publishedAt: null,
            retrievedAt,
            chunkIndex,
            pageNumber: chunk.pageNumber,
            isMock: false
        });
    }

    await replaceEvidenceForDocument(documentId, chunks);
    state.files[relativePath] = {
        contentHash,
        documentId,
        chunkIds: chunks.map((chunk) => chunk.id),
        status: "complete",
        updatedAt: new Date().toISOString()
    };
    await writeState(state);
    console.log(`[PDF-INGEST] ${relativePath} | Chroma stored chunks=${chunks.length}`);
};

export const startInputPdfWatcher = async (): Promise<FSWatcher> => {
    await mkdir(INPUT_DIRECTORY, { recursive: true });
    const state = await readState();
    const inFlight = new Set<string>();
    let queue = Promise.resolve();

    const enqueue = (filePath: string): void => {
        if (inFlight.has(filePath) || extname(filePath).toLowerCase() !== ".pdf") return;
        inFlight.add(filePath);
        queue = queue.then(async () => {
            try {
                await processPdf(filePath, state);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`[PDF-INGEST] ${relative(INPUT_DIRECTORY, filePath)} | failed | ${message}`);
            } finally {
                inFlight.delete(filePath);
            }
        });
    };

    const scanInputDirectory = async (): Promise<void> => {
        const entries = await readdir(INPUT_DIRECTORY, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && extname(entry.name).toLowerCase() === ".pdf") enqueue(resolve(INPUT_DIRECTORY, entry.name));
        }
    };

    await scanInputDirectory();
    const watcher = watch(INPUT_DIRECTORY, (_event, filename) => {
        const name = filename?.toString();
        if (name && extname(name).toLowerCase() === ".pdf") enqueue(resolve(INPUT_DIRECTORY, name));
        void scanInputDirectory().catch((error: unknown) => console.error("[PDF-INGEST] folder scan failed", error));
    });
    watcher.on("error", (error) => console.error("[PDF-INGEST] folder watcher error", error));
    console.log(`[PDF-INGEST] watching ${INPUT_DIRECTORY} for PDFs`);
    return watcher;
};
