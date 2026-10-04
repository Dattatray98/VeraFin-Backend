import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import type { NextFunction, Request, Response } from "express";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg", "audio/x-m4a"]);
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;
const UPLOAD_DIR = path.resolve("uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
    filename: (_req, file, callback) => {
        const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        callback(null, `verafin-${suffix}${path.extname(file.originalname).toLowerCase()}`);
    }
});

const multipartUpload = multer({
    storage,
    fileFilter: (_req, file, callback) => {
        const expectedMimeTypes = file.fieldname === "image" ? IMAGE_MIME_TYPES
            : file.fieldname === "audio" ? AUDIO_MIME_TYPES : null;
        if (!expectedMimeTypes || !expectedMimeTypes.has(file.mimetype)) {
            callback(new Error(`Unsupported file type or field: ${file.fieldname} (${file.mimetype})`));
            return;
        }
        callback(null, true);
    },
    limits: { fileSize: MAX_AUDIO_SIZE_BYTES, files: 2 }
});

/** Parse one image or audio upload with one multipart parser (the request stream cannot be parsed twice). */
export const parseContentUpload = (req: Request, res: Response, next: NextFunction): void => {
    multipartUpload.fields([{ name: "image", maxCount: 1 }, { name: "audio", maxCount: 1 }])(req, res, (error: unknown) => {
        if (error) {
            res.status(400).json({ message: error instanceof Error ? error.message : "File upload error" });
            return;
        }

        const uploaded = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
        const files = Object.values(uploaded).flat();
        if (files.length > 1) {
            for (const file of files) fs.rmSync(file.path, { force: true });
            res.status(400).json({ message: "Upload either one image or one audio file, not both" });
            return;
        }

        const file = files[0];
        if (file?.fieldname === "image" && file.size > MAX_IMAGE_SIZE_BYTES) {
            fs.rmSync(file.path, { force: true });
            res.status(400).json({ message: "Image files must be 10 MB or smaller" });
            return;
        }
        if (file) req.file = file;
        next();
    });
};

export { UPLOAD_DIR, MAX_IMAGE_SIZE_BYTES, MAX_AUDIO_SIZE_BYTES };
