/**
 * Verification Service — Pipeline Orchestrator
 *
 * Coordinates:
 *   1. OCR extraction (for image submissions)
 *   2. Building the LLM input payload
 *   3. Calling the LLM service
 *   4. Persisting the result to MongoDB
 */

import Verification from "../models/verificationModel.js";
import { extractTextFromImage } from "./ocrService.js";
import { transcribeAudio } from "./voiceService.js";
import { runVerification } from "./llmService.js";
import type { LLMInput, VerificationResult, RiskIndicatorItem } from "../types/extractType.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PipelineResult {
    success: boolean;
    verificationId: string;
    status: string;
    result?: VerificationResult;
    error?: string;
}

// ─── Main Pipeline ─────────────────────────────────────────────────────────────

/**
 * Run the full verification pipeline for a given verification document.
 *
 * Steps:
 *   1. Mark document as "processing"
 *   2. If image: run OCR and store extracted text
 *   3. Build LLM input from content + any pre-extracted data
 *   4. Call LLM service
 *   5. Store structured result; mark document as "completed" or "failed"
 *
 * @param verificationId MongoDB ObjectId string of the verification document
 */
export async function runVerificationPipeline(
    verificationId: string
): Promise<PipelineResult> {
    // ── 1. Fetch document ─────────────────────────────────────────────────────
    const doc = await Verification.findById(verificationId);
    if (!doc) {
        return {
            success: false,
            verificationId,
            status: "failed",
            error: "Verification document not found",
        };
    }

    // ── 2. Mark as processing ─────────────────────────────────────────────────
    doc.status = "processing";
    await doc.save();

    try {
        let textForLLM = doc.content.raw_text ?? "";

        // ── 3. OCR extraction (image submissions) ─────────────────────────────
        if (doc.input.type === "image") {
            const storagePath = doc.content.image_metadata?.storagePath;

            if (!storagePath) {
                throw new Error(
                    "Image submission is missing storagePath in image_metadata"
                );
            }

            const ocrResult = await extractTextFromImage(
                storagePath,
                doc.content.image_metadata?.originalName ?? "image"
            );

            if (!ocrResult.success) {
                throw new Error(ocrResult.error ?? "OCR extraction failed");
            }

            doc.content.extracted_text = ocrResult.extractedText;
            textForLLM = ocrResult.extractedText;
            await doc.save();
        }

        // ── 3b. STT transcription (voice submissions) ─────────────────────────
        if (doc.input.type === "voice") {
            const storagePath = doc.content.audio_metadata?.storagePath;

            if (!storagePath) {
                throw new Error(
                    "Voice submission is missing storagePath in audio_metadata"
                );
            }

            const sttResult = await transcribeAudio(
                storagePath,
                doc.content.audio_metadata?.originalName ?? "audio",
                doc.input.language
            );

            if (!sttResult.success) {
                throw new Error(sttResult.error ?? "Speech-to-text transcription failed");
            }

            doc.content.extracted_text = sttResult.transcribedText;
            textForLLM = sttResult.transcribedText;
            await doc.save();
        }

        // ── 4. Build LLM input ────────────────────────────────────────────────
        const extracted = doc.extractedData ?? {};

        const llmInput: LLMInput = {
            extractedText: textForLLM,
            input: {
                type: doc.input.type,
                language: doc.input.language,
                source: doc.input.source,
            },
            claims: extracted.claims ?? [],
            financialInformation: extracted.financial_information ?? {
                amounts: [],
                payment_methods: [],
                upi_ids: [],
                account_numbers: [],
            },
            entities: extracted.entities ?? {
                organizations: [],
                companies: [],
                financial_institutions: [],
                regulatory_bodies: [],
                people: [],
                locations: [],
            },
            intent: extracted.intent,
            riskIndicators: extracted.risk_indicators as RiskIndicatorItem[] | undefined,
        };

        // ── 5. Call LLM ───────────────────────────────────────────────────────
        const llmOutput = await runVerification(llmInput);

        // ── 6. Build result and save ──────────────────────────────────────────
        const verificationResult: VerificationResult = {
            overall_status: llmOutput.status,
            risk_level: llmOutput.risk_level ?? "none",
            confidence: llmOutput.confidence,
            explanation: llmOutput.explanation,
            evidence: llmOutput.evidence ?? [],
            warnings: llmOutput.warnings ?? [],
            recommendation: llmOutput.recommendation,
            sources: llmOutput.sources ?? [],
            claims: llmOutput.claims,
            risk_indicators: llmOutput.riskIndicators,
        };

        doc.result = verificationResult;
        doc.status = "completed";
        await doc.save();

        return {
            success: true,
            verificationId,
            status: "completed",
            result: verificationResult,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Pipeline error";
        console.error("[VerificationService] Pipeline failed:", message);

        doc.status = "failed";
        doc.error = message;
        await doc.save();

        return {
            success: false,
            verificationId,
            status: "failed",
            error: message,
        };
    }
}
