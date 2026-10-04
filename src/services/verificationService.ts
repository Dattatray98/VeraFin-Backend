/** Orchestrates text and image input through the same evidence-backed flow. */

import Verification, { type IVerification } from "../models/verificationModel.js";
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

type PipelineLogDetails = Record<string, string | number | boolean | null>;

const logPipelineEvent = (
    verificationId: string,
    stage: string,
    status: "started" | "completed" | "failed",
    details: PipelineLogDetails = {}
): void => {
    console.info("[VERIFICATION_PIPELINE]", JSON.stringify({
        timestamp: new Date().toISOString(),
        verificationId,
        stage,
        status,
        ...details
    }));
};

export async function runVerificationPipeline(verificationId: string): Promise<PipelineResult> {
    const pipelineStartedAt = Date.now();
    let doc: IVerification | null;
    try {
        logPipelineEvent(verificationId, "load_submission", "started");
        doc = await Verification.findById(verificationId);
        logPipelineEvent(verificationId, "load_submission", doc ? "completed" : "failed");
    } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load verification submission";
        logPipelineEvent(verificationId, "load_submission", "failed", { error: message.slice(0, 300) });
        logPipelineEvent(verificationId, "pipeline", "failed", {
            totalDurationMs: Date.now() - pipelineStartedAt,
            failedStage: "load_submission"
        });
        return { success: false, verificationId, status: "failed", error: message };
    }

    if (!doc) {
        logPipelineEvent(verificationId, "pipeline", "failed", {
            totalDurationMs: Date.now() - pipelineStartedAt,
            failedStage: "load_submission",
            error: "Verification document not found"
        });
        return { success: false, verificationId, status: "failed", error: "Verification document not found" };
    }

    let currentStage = "mark_processing";
    let stageStartedAt = Date.now();

    try {
        logPipelineEvent(verificationId, currentStage, "started");
        doc.status = "processing";
        doc.error = undefined;
        await doc.save();
        logPipelineEvent(verificationId, currentStage, "completed", { durationMs: Date.now() - stageStartedAt });

        let text = doc.content.raw_text?.trim() ?? "";

        if (doc.input.type === "image") {
            currentStage = "image_text_extraction";
            stageStartedAt = Date.now();
            logPipelineEvent(verificationId, currentStage, "started", { inputType: doc.input.type });
            const image = doc.content.image_metadata;
            if (!image?.storagePath) throw new Error("Image submission is missing its uploaded file");
            const ocr = await extractTextFromImage(image.storagePath, image.originalName, image.mimeType);
            if (!ocr.success || !ocr.extractedText.trim()) {
                throw new Error(ocr.error ?? "No readable text was found in the image");
            }
            text = ocr.extractedText.trim();
            logPipelineEvent(verificationId, currentStage, "completed", {
                durationMs: Date.now() - stageStartedAt,
                extractedCharacters: text.length
            });
        } else if (doc.input.type === "voice") {
            currentStage = "audio_transcription";
            stageStartedAt = Date.now();
            logPipelineEvent(verificationId, currentStage, "started", { inputType: doc.input.type });
            const audio = doc.content.audio_metadata;
            if (!audio?.storagePath) throw new Error("Voice submission is missing its uploaded file");
            const transcription = await transcribeAudio(audio.storagePath, audio.originalName, doc.input.language);
            if (!transcription.success || !transcription.transcribedText.trim()) {
                throw new Error(transcription.error ?? "No speech was transcribed from the audio");
            }
            text = transcription.transcribedText.trim();
            logPipelineEvent(verificationId, currentStage, "completed", {
                durationMs: Date.now() - stageStartedAt,
                extractedCharacters: text.length
            });
        }

        currentStage = "input_preparation";
        stageStartedAt = Date.now();
        logPipelineEvent(verificationId, currentStage, "started", { inputType: doc.input.type });
        if (!text) throw new Error("No text was available for verification");
        doc.content.extracted_text = text;
        logPipelineEvent(verificationId, currentStage, "completed", {
            durationMs: Date.now() - stageStartedAt,
            extractedCharacters: text.length
        });

        currentStage = "message_extraction";
        stageStartedAt = Date.now();
        logPipelineEvent(verificationId, currentStage, "started", { inputType: doc.input.type });
        const extracted = await extractMessageForVerification(text);
        doc.extractedData = extracted;
        logPipelineEvent(verificationId, currentStage, "completed", {
            durationMs: Date.now() - stageStartedAt,
            claimCount: extracted.claims.length,
            entityCount: extracted.entities.length,
            linkCount: extracted.links.length,
            riskSignalCount: extracted.riskSignals.length
        });

        currentStage = "query_planning";
        stageStartedAt = Date.now();
        logPipelineEvent(verificationId, currentStage, "started");
        const plan = await createVerificationPlan(extracted);
        logPipelineEvent(verificationId, currentStage, "completed", {
            durationMs: Date.now() - stageStartedAt,
            queryCount: plan.queries.length
        });

        currentStage = "evidence_retrieval";
        stageStartedAt = Date.now();
        logPipelineEvent(verificationId, currentStage, "started", { queryCount: plan.queries.length });
        const retrieval = await retrieveEvidence(plan);
        logPipelineEvent(verificationId, currentStage, "completed", {
            durationMs: Date.now() - stageStartedAt,
            queryCount: retrieval.results.length,
            evidenceCount: retrieval.results.reduce((count, item) => count + item.evidence.length, 0),
            foundQueryCount: retrieval.results.filter((item) => item.outcome === "evidence_found").length,
            emptyQueryCount: retrieval.results.filter((item) => item.outcome === "no_evidence_found").length,
            failedQueryCount: retrieval.results.filter((item) => item.outcome === "retrieval_failed").length
        });

        currentStage = "evidence_analysis";
        stageStartedAt = Date.now();
        logPipelineEvent(verificationId, currentStage, "started");
        const analysis = await analyzeEvidence(extracted, retrieval);
        logPipelineEvent(verificationId, currentStage, "completed", {
            durationMs: Date.now() - stageStartedAt,
            assessmentCount: analysis.assessments.length,
            supportedCount: analysis.assessments.filter((item) => item.status === "supported").length,
            contradictedCount: analysis.assessments.filter((item) => item.status === "contradicted").length,
            unverifiedCount: analysis.assessments.filter((item) => item.status === "unverified").length,
            unableToVerifyCount: analysis.assessments.filter((item) => item.status === "unable_to_verify").length
        });

        currentStage = "risk_assessment";
        stageStartedAt = Date.now();
        logPipelineEvent(verificationId, currentStage, "started");
        const risk = assessRisk(extracted.riskSignals, analysis);
        logPipelineEvent(verificationId, currentStage, "completed", {
            durationMs: Date.now() - stageStartedAt,
            score: risk.score,
            level: risk.level,
            factorCount: risk.factors.length
        });

        currentStage = "explanation_generation";
        stageStartedAt = Date.now();
        logPipelineEvent(verificationId, currentStage, "started");
        const explanation = await createExplanation(analysis, retrieval, risk);
        logPipelineEvent(verificationId, currentStage, "completed", {
            durationMs: Date.now() - stageStartedAt,
            recommendationCount: explanation.recommendedActions.length
        });

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

        currentStage = "result_persistence";
        stageStartedAt = Date.now();
        logPipelineEvent(verificationId, currentStage, "started");
        doc.result = verificationResult;
        doc.status = "completed";
        await doc.save();
        logPipelineEvent(verificationId, currentStage, "completed", {
            durationMs: Date.now() - stageStartedAt,
            overallStatus,
            riskLevel: verificationResult.risk_level
        });
        logPipelineEvent(verificationId, "pipeline", "completed", { totalDurationMs: Date.now() - pipelineStartedAt });

        return { success: true, verificationId, status: "completed", result: verificationResult };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Verification pipeline failed";
        logPipelineEvent(verificationId, currentStage, "failed", {
            durationMs: Date.now() - stageStartedAt,
            error: message.slice(0, 300)
        });
        try {
            doc.status = "failed";
            doc.error = message;
            await doc.save();
            logPipelineEvent(verificationId, "persist_failure", "completed");
        } catch (saveError) {
            const saveMessage = saveError instanceof Error ? saveError.message : "Could not save pipeline failure";
            logPipelineEvent(verificationId, "persist_failure", "failed", { error: saveMessage.slice(0, 300) });
        }
        logPipelineEvent(verificationId, "pipeline", "failed", {
            totalDurationMs: Date.now() - pipelineStartedAt,
            failedStage: currentStage
        });
        return { success: false, verificationId, status: "failed", error: message };
    }
}
