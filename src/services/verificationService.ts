/** Orchestrates text and image input through the same evidence-backed flow. */

import Verification from "../models/verificationModel.js";
import { extractTextFromImage } from "./ocrService.js";
import { transcribeAudio } from "./voiceService.js";
import { extractMessageForVerification } from "./verification/messageExtractor.js";
import { createVerificationPlan } from "./verification/queryPlanner.js";
import { retrieveEvidence } from "./verification/chromaEvidenceRetriever.js";
import { analyzeEvidence } from "./verification/evidenceAnalyzer.js";
import { assessRisk } from "./verification/riskEngine.js";
import { createExplanation } from "./verification/explanationEngine.js";
import type { VerificationResult } from "../types/extractType.js";

export interface PipelineResult {
    success: boolean;
    verificationId: string;
    status: string;
    result?: VerificationResult;
    error?: string;
}

export async function runVerificationPipeline(verificationId: string): Promise<PipelineResult> {
    const doc = await Verification.findById(verificationId);
    if (!doc) {
        return { success: false, verificationId, status: "failed", error: "Verification document not found" };
    }

    doc.status = "processing";
    doc.error = undefined;
    await doc.save();

    try {
        let text = doc.content.raw_text?.trim() ?? "";

        if (doc.input.type === "image") {
            const image = doc.content.image_metadata;
            if (!image?.storagePath) throw new Error("Image submission is missing its uploaded file");
            const ocr = await extractTextFromImage(image.storagePath, image.originalName, image.mimeType);
            if (!ocr.success || !ocr.extractedText.trim()) {
                throw new Error(ocr.error ?? "No readable text was found in the image");
            }
            text = ocr.extractedText.trim();
        } else if (doc.input.type === "voice") {
            const audio = doc.content.audio_metadata;
            if (!audio?.storagePath) throw new Error("Voice submission is missing its uploaded file");
            const transcription = await transcribeAudio(audio.storagePath, audio.originalName, doc.input.language);
            if (!transcription.success || !transcription.transcribedText.trim()) {
                throw new Error(transcription.error ?? "No speech was transcribed from the audio");
            }
            text = transcription.transcribedText.trim();
        }

        if (!text) throw new Error("No text was available for verification");
        doc.content.extracted_text = text;

        const extracted = await extractMessageForVerification(text);
        doc.extractedData = extracted;

        const plan = await createVerificationPlan(extracted);
        const retrieval = await retrieveEvidence(plan);
        const analysis = await analyzeEvidence(extracted, retrieval);
        const risk = assessRisk(extracted.riskSignals, analysis);
        const explanation = await createExplanation(analysis, retrieval, risk);

        const contradicted = analysis.assessments.some((item) => item.status === "contradicted");
        const allSupported = analysis.assessments.length > 0 &&
            analysis.assessments.every((item) => item.status === "supported");
        const overallStatus: VerificationResult["overall_status"] = contradicted
            ? "suspicious"
            : allSupported
                ? "verified"
                : analysis.assessments.length === 0
                    ? "inconclusive"
                    : "unverified";

        const foundSources = new Map<string, { name: string; url: string; status: "found" }>();
        for (const queryResult of retrieval.results) {
            for (const item of queryResult.evidence) {
                const key = item.sourceUrl || item.sourceName;
                if (!foundSources.has(key)) {
                    foundSources.set(key, { name: item.sourceName, url: item.sourceUrl, status: "found" });
                }
            }
        }

        const verificationResult: VerificationResult = {
            overall_status: overallStatus,
            risk_level: risk.level === "moderate" ? "medium" : risk.level,
            explanation: explanation.summary,
            evidence: retrieval.results.flatMap((item) => item.evidence.map((evidence) =>
                `${evidence.title}: ${evidence.content}`
            )),
            warnings: [...new Set([...risk.limitations, explanation.notice])],
            recommendation: explanation.recommendedActions.join(" "),
            sources: foundSources.size > 0
                ? [...foundSources.values()]
                : [{ name: "Chroma evidence database", status: "unverified" }],
            claims: extracted.claims,
            risk_indicators: extracted.riskSignals,
            pipeline: { extracted, plan, retrieval, analysis, risk, explanation }
        };

        doc.result = verificationResult;
        doc.status = "completed";
        await doc.save();

        return { success: true, verificationId, status: "completed", result: verificationResult };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Verification pipeline failed";
        console.error("[VerificationService] Pipeline failed:", message);
        doc.status = "failed";
        doc.error = message;
        await doc.save();
        return { success: false, verificationId, status: "failed", error: message };
    }
}
