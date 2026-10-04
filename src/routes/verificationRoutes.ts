import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

import {
    submitVerification,
    getVerification,
    getVerificationHistory,
    updateVerificationStatus,
    submitVerificationResult,
} from "../controllers/verificationController.js";

import { protect } from "../middleware/authMiddleware.js";
import { upload, uploadAudio } from "../middleware/uploadMiddleware.js";

const router = Router();

// ─── Helper: wrap multer errors into JSON responses ───────────────────────────

/**
 * Accepts either an image (JPG/JPEG/PNG/WEBP) OR an audio file (MP3/M4A/WAV/WEBM/OGG)
 * on the same "image" / "audio" field names.
 * multer.any() is intentionally NOT used — we use a custom wrapper that tries
 * image first, then audio, so that proper MIME errors are returned per type.
 */
function handleUpload(req: Request, res: Response, next: NextFunction): void {
    // Try image field first
    upload.single("image")(req, res, (imgErr: unknown) => {
        if (!imgErr) {
            // Image field parsed (or no file at all)
            return next();
        }

        // Image parse failed — try audio field instead
        uploadAudio.single("audio")(req, res, (audioErr: unknown) => {
            if (audioErr) {
                const message =
                    audioErr instanceof Error
                        ? audioErr.message
                        : typeof audioErr === "string"
                        ? audioErr
                        : imgErr instanceof Error
                        ? imgErr.message
                        : "File upload error";
                res.status(400).json({ message });
                return;
            }
            next();
        });
    });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/verification
 * List all verifications for the authenticated user (History screen).
 *
 * Query params:
 *   type   — "text" | "image" | "voice"   (filter by submission type)
 *   status — "pending" | "processing" | "completed" | "failed"
 *   page   — page number (default: 1)
 *   limit  — records per page (default: 20, max: 50)
 */
router.get("/", protect, getVerificationHistory);

/**
 * POST /api/verification/submit
 * Submit text, image, or voice content for verification.
 *
 * Text (JSON body):
 *   { "language": "en", "source": "whatsapp", "raw_text": "..." }
 *
 * Image (multipart/form-data):
 *   Fields: language, source
 *   File field "image": JPG / JPEG / PNG / WEBP (max 10 MB)
 *
 * Voice (multipart/form-data):
 *   Fields: language, source
 *   File field "audio": MP3 / M4A / WAV / WEBM / OGG (max 25 MB)
 */
router.post("/submit", protect, handleUpload, submitVerification);

/**
 * GET /api/verification/:id
 * Retrieve a single verification record (owner only).
 */
router.get("/:id", protect, getVerification);

/**
 * PATCH /api/verification/:id/status
 * Update verification status. Optionally include result or error.
 */
router.patch("/:id/status", protect, updateVerificationStatus);

/**
 * POST /api/verification/:id/result
 * Store the LLM verification result for a given verification document.
 * Intended for the LLM service to push its structured result back to the backend.
 */
router.post("/:id/result", protect, submitVerificationResult);

export default router;