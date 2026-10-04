import type { Request, Response } from "express";
import mongoose from "mongoose";
import Verification from "../models/verificationModel.js";
import { runVerificationPipeline } from "../services/verificationService.js";
import type { VerificationResult } from "../types/extractType.js";
import fs from "fs";

// ─── Helper ────────────────────────────────────────────────────────────────────

function isValidObjectId(id: string): boolean {
    return mongoose.Types.ObjectId.isValid(id);
}

// ─── POST /api/verification/submit ────────────────────────────────────────────

/**
 * Submit text or image content for verification.
 *
 * Text submission (application/json):
 *   { type: "text", language, source, raw_text }
 *
 * Image submission (multipart/form-data):
 *   Fields: type="image", language, source
 *   File:   image (field name "image")
 *
 * Optional body fields for both:
 *   extractedData — pre-structured data (claims, entities, etc.) if already parsed client-side
 *
 * After creating the document, the pipeline is kicked off asynchronously.
 * The response returns the verification ID immediately so the client can poll.
 */
export const submitVerification = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        if (!req.userId) {
            res.status(401).json({ message: "User authentication required" });
            return;
        }

        const {
            language = "en",
            source,
            raw_text,
            extractedData,
        } = req.body;

        // Determine submission type: image upload takes priority
        const hasImageFile = !!req.file && req.file.mimetype.startsWith("image/");
        const hasAudioFile = !!req.file && req.file.mimetype.startsWith("audio/");
        const submissionType: "text" | "image" | "voice" =
            hasImageFile ? "image" : hasAudioFile ? "voice" : "text";

        // ── Validate: source is always required ───────────────────────────────
        if (!source) {
            // Clean up uploaded file if validation fails
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            res.status(400).json({ message: "source is required" });
            return;
        }

        // ── Text submission validation ─────────────────────────────────────────
        if (submissionType === "text") {
            if (!raw_text || typeof raw_text !== "string" || raw_text.trim() === "") {
                res.status(400).json({
                    message:
                        "raw_text is required for text submissions and must be a non-empty string",
                });
                return;
            }
        }

        // ── Image submission: file was already handled by multer ──────────────
        // If the user specified type="text" but sent a file, we honour the file.

        // ── Build content object ──────────────────────────────────────────────
        const content: {
            raw_text?: string;
            image_metadata?: {
                originalName: string;
                mimeType: string;
                sizeBytes: number;
                uploadedAt: Date;
                storagePath: string;
            };
            audio_metadata?: {
                originalName: string;
                mimeType: string;
                sizeBytes: number;
                uploadedAt: Date;
                storagePath: string;
            };
        } = {};

        if (submissionType === "text") {
            content.raw_text = (raw_text as string).trim();
        } else if (submissionType === "image" && req.file) {
            content.image_metadata = {
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                sizeBytes: req.file.size,
                uploadedAt: new Date(),
                storagePath: req.file.path,
            };
        } else if (submissionType === "voice" && req.file) {
            content.audio_metadata = {
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                sizeBytes: req.file.size,
                uploadedAt: new Date(),
                storagePath: req.file.path,
            };
        }


        // ── Parse pre-structured data if provided ─────────────────────────────
        let parsedExtractedData: Record<string, unknown> | undefined;
        if (extractedData) {
            try {
                parsedExtractedData =
                    typeof extractedData === "string"
                        ? JSON.parse(extractedData)
                        : extractedData;
            } catch {
                parsedExtractedData = undefined;
            }
        }

        // ── Create MongoDB document ───────────────────────────────────────────
        const verification = await Verification.create({
            userId: req.userId,
            input: {
                type: submissionType,
                language: (language as string).trim() || "en",
                source: (source as string).trim(),
            },
            content,
            extractedData: parsedExtractedData,
            status: "pending",
        });

        // ── Fire-and-forget: run pipeline asynchronously ──────────────────────
        // The client can poll GET /api/verification/:id for status updates.
        setImmediate(() => {
            runVerificationPipeline(verification._id.toString()).catch((err) => {
                console.error(
                    "[Controller] Background pipeline error for",
                    verification._id,
                    err
                );
            });
        });

        res.status(201).json({
            message: "Content submitted successfully. Verification is processing.",
            verification: {
                id: verification._id,
                type: submissionType,
                status: verification.status,
                createdAt: verification.createdAt,
            },
        });
    } catch (error) {
        console.error("Verification submission error:", error);
        // Clean up file if DB write failed
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: "Server error" });
    }
};

// ─── GET /api/verification/:id ────────────────────────────────────────────────

/**
 * Retrieve a verification record by ID.
 * Only the owning user can access their own records.
 */
export const getVerification = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        if (!req.userId) {
            res.status(401).json({ message: "User authentication required" });
            return;
        }

        const id = String(req.params.id);

        if (!isValidObjectId(id)) {
            res.status(400).json({ message: "Invalid verification ID" });
            return;
        }

        const verification = await Verification.findOne({
            _id: id,
            userId: req.userId,
        });

        if (!verification) {
            res.status(404).json({ message: "Verification not found" });
            return;
        }

        res.status(200).json({ verification });
    } catch (error) {
        console.error("Get verification error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// ─── PATCH /api/verification/:id/status ──────────────────────────────────────

/**
 * Update the status of a verification record.
 * Only the owning user can update their own records.
 * Optionally accepts result and error fields.
 */
export const updateVerificationStatus = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        if (!req.userId) {
            res.status(401).json({ message: "User authentication required" });
            return;
        }

        const id = String(req.params.id);

        if (!isValidObjectId(id)) {
            res.status(400).json({ message: "Invalid verification ID" });
            return;
        }

        const { status, result, error } = req.body;

        const allowedStatuses = ["pending", "processing", "completed", "failed"];

        if (!status || !allowedStatuses.includes(status as string)) {
            res.status(400).json({
                message: `Invalid verification status. Allowed: ${allowedStatuses.join(", ")}`,
            });
            return;
        }

        const verification = await Verification.findOne({
            _id: id,
            userId: req.userId,
        });

        if (!verification) {
            res.status(404).json({ message: "Verification not found" });
            return;
        }

        verification.status = status as "pending" | "processing" | "completed" | "failed";

        if (result !== undefined) {
            verification.result = result as VerificationResult;
        }

        if (error !== undefined) {
            verification.error = error as string;
        }

        await verification.save();

        res.status(200).json({
            message: "Verification status updated successfully",
            verification: {
                id: verification._id,
                status: verification.status,
                result: verification.result,
                error: verification.error,
            },
        });
    } catch (error) {
        console.error("Update verification status error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// ─── POST /api/verification/:id/result ───────────────────────────────────────

/**
 * Store a structured verification result for a given verification ID.
 *
 * This endpoint is intended for the LLM service to POST its result back to
 * the backend after async processing. The verification is then marked as
 * "completed" (or "failed" if an error is provided).
 *
 * Body:
 * {
 *   result: VerificationResult    — structured LLM output
 *   error?: string                — if the LLM failed, provide the reason
 * }
 *
 * Security: Requires JWT of the owning user. For machine-to-machine scenarios,
 * the LLM team should use the same user's JWT or a dedicated service account.
 */
export const submitVerificationResult = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        if (!req.userId) {
            res.status(401).json({ message: "User authentication required" });
            return;
        }

        const id = String(req.params.id);

        if (!isValidObjectId(id)) {
            res.status(400).json({ message: "Invalid verification ID" });
            return;
        }

        const { result, error } = req.body;

        if (!result && !error) {
            res.status(400).json({
                message: "Either result or error must be provided",
            });
            return;
        }

        const verification = await Verification.findOne({
            _id: id,
            userId: req.userId,
        });

        if (!verification) {
            res.status(404).json({ message: "Verification not found" });
            return;
        }

        if (result) {
            verification.result = result as VerificationResult;
            verification.status = "completed";
        }

        if (error) {
            verification.error = error as string;
            verification.status = "failed";
        }

        await verification.save();

        res.status(200).json({
            message: "Verification result stored successfully",
            verification: {
                id: verification._id,
                status: verification.status,
                result: verification.result,
                error: verification.error,
            },
        });
    } catch (error) {
        console.error("Submit verification result error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// ─── GET /api/verification ────────────────────────────────────────────────────

/**
 * List all verification records for the authenticated user.
 * Powers the History screen with filtering and pagination.
 *
 * Query params:
 *   type    — filter by input type: "text" | "image" | "voice"
 *   status  — filter by status: "pending" | "processing" | "completed" | "failed"
 *   page    — page number (default: 1)
 *   limit   — records per page (default: 20, max: 50)
 */
export const getVerificationHistory = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        if (!req.userId) {
            res.status(401).json({ message: "User authentication required" });
            return;
        }

        const { type, status, page = "1", limit = "20" } = req.query;

        // Build filter
        const filter: Record<string, unknown> = { userId: req.userId };

        const allowedTypes = ["text", "image", "voice"];
        if (type && allowedTypes.includes(type as string)) {
            filter["input.type"] = type;
        }

        const allowedStatuses = ["pending", "processing", "completed", "failed"];
        if (status && allowedStatuses.includes(status as string)) {
            filter.status = status;
        }

        // Pagination
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const [records, total] = await Promise.all([
            Verification.find(filter)
                .select(
                    "_id status createdAt updatedAt input.type input.source content.extracted_text " +
                    "result.overall_status result.risk_level result.explanation error"
                )
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Verification.countDocuments(filter),
        ]);

        res.status(200).json({
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
            verifications: records,
        });
    } catch (error) {
        console.error("Get verification history error:", error);
        res.status(500).json({ message: "Server error" });
    }
};