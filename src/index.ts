import "dotenv/config";
import express from 'express';
import type { Request, Response } from 'express';
import { createVerificationPlan } from "./services/verification/queryPlanner.js";
import { retrieveEvidence } from "./services/verification/chromaEvidenceRetriever.js";
import { startInputPdfWatcher } from "./services/evidence/inputPdfWatcher.js";
import { analyzeEvidence } from "./services/verification/evidenceAnalyzer.js";
import { assessRisk } from "./services/verification/riskEngine.js";
import { createExplanation } from "./services/verification/explanationEngine.js";
import { extractMessageForVerification } from "./services/verification/messageExtractor.js";
const app = express();
const PORT = 5000;

const allowedOrigins = (process.env.CORS_ORIGIN ?? "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use((req: Request, res: Response, next) => {
    const requestOrigin = req.headers.origin;
    const allowAnyOrigin = allowedOrigins.includes("*");

    if (allowAnyOrigin) {
        res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        res.setHeader("Access-Control-Allow-Origin", requestOrigin);
        res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
    }

    next();
});

app.use(express.json({ limit: "1mb" }));

app.post("/api/verification/run", async (req: Request, res: Response) => {
    const body: unknown = req.body;
    if (
        typeof body !== "object" || body === null ||
        !("message" in body) || typeof body.message !== "string"
    ) {
        res.status(400).json({ error: "Request body must include a string 'message'" });
        return;
    }
    const message = body.message;
    if (!message.trim()) {
        res.status(400).json({ error: "Message cannot be empty" });
        return;
    }

    try {
        console.log("Input message:", message.trim());
        const input = await extractMessageForVerification(message.trim());
        const plan = await createVerificationPlan(input);
        const retrieval = await retrieveEvidence(plan);
        console.log(
            "Chroma retrieved evidence:",
            retrieval.results.flatMap((result) => result.evidence)
        );
        const analysis = await analyzeEvidence(input, retrieval);
        const riskAssessment = assessRisk(input.riskSignals, analysis);
        const explanation = await createExplanation(analysis, retrieval, riskAssessment);
        res.json({ input, plan, retrieval, analysis, riskAssessment, explanation });
    } catch (error) {
        res.status(503).json({
            error: error instanceof Error ? error.message : "Verification service is unavailable"
        });
    }
});

app.get("/", (_req: Request, res: Response) => {
    res.json({ status: "ok", evidenceSource: "vector_db" });
});


app.listen(PORT, () => console.log(`server is runnning at : http://localhost:${PORT}`));
void startInputPdfWatcher().catch((error: unknown) => {
    console.error("[PDF-INGEST] could not start input folder watcher", error);
});
