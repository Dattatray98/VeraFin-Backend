import express from 'express';
import type { Request, Response } from 'express';
import { createVerificationPlan } from "./services/verification/queryPlanner.js";
import { retrieveEvidence } from "./services/verification/lanceEvidenceRetriever.js";
import { analyzeEvidence } from "./services/verification/evidenceAnalyzer.js";
import { assessRisk } from "./services/verification/riskEngine.js";
import { createExplanation } from "./services/verification/explanationEngine.js";
import { mockVerificationPlannerInput } from "./mocks/verificationPlannerInput.js";
const app = express();
const PORT = 5000;

app.use(express.json({ limit: "1mb" }));

app.get("/api/verification/plan", async (_req: Request, res: Response) => {
    try {
        const plan = await createVerificationPlan(mockVerificationPlannerInput);
        res.json({ input: mockVerificationPlannerInput, plan });
    } catch (error) {
        res.status(503).json({
            error: error instanceof Error ? error.message : "Verification planner is unavailable"
        });
    }
});

app.post("/api/verification/run", async (req: Request, res: Response) => {
    try {
        const plan = await createVerificationPlan(mockVerificationPlannerInput);
        const retrieval = await retrieveEvidence(plan);
        const analysis = await analyzeEvidence(mockVerificationPlannerInput, retrieval);
        const riskAssessment = assessRisk(mockVerificationPlannerInput.riskSignals, analysis);
        const explanation = await createExplanation(analysis, retrieval, riskAssessment);
        res.json({ input: mockVerificationPlannerInput, plan, retrieval, analysis, riskAssessment, explanation });
    } catch (error) {
        res.status(503).json({
            error: error instanceof Error ? error.message : "Verification service is unavailable"
        });
    }
});

app.get("/", (_req: Request, res: Response) => {
    res.json({ status: "ok", evidenceSource: "vector_db" });
});


app.listen(PORT, () => console.log(`server is runnning at : http://localhost:${PORT}`))
