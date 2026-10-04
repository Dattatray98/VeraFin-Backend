import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request } from "express";

// ─── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const UPLOAD_DIR = path.resolve("uploads");

// Ensure uploads directory exists (gitignored — never committed)
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ─── Shared internal file type (subset of Express.Multer.File) ────────────────

interface UploadedFile {
    originalname: string;
    mimetype: string;
}

// ─── Storage ───────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
    destination: (
        _req: Request,
        _file: UploadedFile,
        cb: (error: Error | null, destination: string) => void
    ) => {
        cb(null, UPLOAD_DIR);
    },

    filename: (
        _req: Request,
        file: UploadedFile,
        cb: (error: Error | null, filename: string) => void
    ) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `verafin-${uniqueSuffix}${ext}`);
    },
});

// ─── File Filter ───────────────────────────────────────────────────────────────

const fileFilter = (
    _req: Request,
    file: UploadedFile,
    cb: (error: Error | null, acceptFile?: boolean) => void
) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(
            new Error(
                `Unsupported file type: ${file.mimetype}. Allowed: JPG, JPEG, PNG, WEBP`
            )
        );
    }
};

// ─── Export Middleware ─────────────────────────────────────────────────────────

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
    },
});

// ─── Audio Upload (Voice submissions) ─────────────────────────────────────────

const ALLOWED_AUDIO_MIME_TYPES = [
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/webm",
    "audio/ogg",
    "audio/x-m4a",
];

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

const audioFilter = (
    _req: Request,
    file: UploadedFile,
    cb: (error: Error | null, acceptFile?: boolean) => void
) => {
    if (ALLOWED_AUDIO_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(
            new Error(
                `Unsupported audio type: ${file.mimetype}. Allowed: MP3, M4A, WAV, WEBM, OGG`
            )
        );
    }
};

export const uploadAudio = multer({
    storage,
    fileFilter: audioFilter,
    limits: { fileSize: MAX_AUDIO_SIZE_BYTES },
});

export { UPLOAD_DIR, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES };
