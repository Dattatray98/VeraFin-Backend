/**
 * OCR Service — Image Text Extraction Abstraction
 *
 * Currently backed by HuggingFace Inference API (vision/image-to-text model).
 * The HF_API_TOKEN environment variable must be set for real extraction.
 *
 * If HF_API_TOKEN is not configured, the service returns a stub response
 * so the rest of the pipeline can still be tested without credentials.
 *
 * The LLM team / another team member can swap this implementation by
 * replacing the body of `extractTextFromImage` while keeping the same
 * function signature.
 *
 * Required environment variable:
 *   HF_API_TOKEN  — HuggingFace API token (obtain at https://huggingface.co/settings/tokens)
 *
 * Optional environment variable:
 *   OCR_MODEL     — HuggingFace model ID for image-to-text (default: Salesforce/blip-image-captioning-base)
 */

import { InferenceClient } from "@huggingface/inference";
import fs from "fs";
import path from "path";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface OCRResult {
    success: boolean;
    extractedText: string;
    confidence?: number;
    error?: string;
}

// ─── OCR Implementation ─────────────────────────────────────────────────────────

/**
 * Extract text from a locally stored image file.
 *
 * @param filePath Absolute path to the uploaded image file
 * @param originalName Original filename (for logging)
 * @returns OCRResult with extracted text or error information
 */
export async function extractTextFromImage(
    filePath: string,
    originalName: string
): Promise<OCRResult> {
    const token = process.env.HF_API_TOKEN;

    // ── Stub mode: no credentials configured ──────────────────────────────────
    if (!token) {
        console.warn(
            "[OCRService] HF_API_TOKEN not set. Running in stub mode. " +
            "Set HF_API_TOKEN in .env to enable real OCR extraction."
        );
        return {
            success: true,
            extractedText:
                `[OCR STUB] Text extraction not configured. ` +
                `Image "${originalName}" was received and stored. ` +
                `Set HF_API_TOKEN in .env and configure OCR_MODEL to enable real extraction.`,
            confidence: undefined,
            error: undefined,
        };
    }

    // ── Real extraction via HuggingFace Inference ─────────────────────────────
    try {
        const modelId =
            process.env.OCR_MODEL ??
            "Salesforce/blip-image-captioning-base";

        const client = new InferenceClient(token);

        // Read image as binary buffer
        const imageBuffer = fs.readFileSync(filePath);
        const ext = path.extname(originalName).toLowerCase().replace(".", "");
        const mimeType =
            ext === "jpg" || ext === "jpeg"
                ? "image/jpeg"
                : ext === "png"
                ? "image/png"
                : ext === "webp"
                ? "image/webp"
                : "image/jpeg";

        const imageBlob = new Blob([imageBuffer], { type: mimeType });

        const response = await client.imageToText({
            model: modelId,
            data: imageBlob,
        });

        const extractedText =
            response.generated_text?.trim() ??
            "[OCR returned empty result]";

        return {
            success: true,
            extractedText,
            confidence: undefined, // HuggingFace image-to-text doesn't return confidence
        };
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Unknown OCR error";

        console.error("[OCRService] Extraction failed:", message);

        return {
            success: false,
            extractedText: "",
            error: `OCR extraction failed: ${message}`,
        };
    }
}
