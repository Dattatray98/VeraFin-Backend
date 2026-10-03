import express from 'express';
import type { Request, Response } from 'express';
import { createVerificationPlan } from "./services/verification/queryPlanner.js";
import { retrieveEvidence } from "./services/verification/lanceEvidenceRetriever.js";
import { analyzeEvidence } from "./services/verification/evidenceAnalyzer.js";
import { assessRisk } from "./services/verification/riskEngine.js";
import { createMockExplanation } from "./services/verification/explanationEngine.js";
import { mockVerificationPlannerInput } from "./mocks/verificationPlannerInput.js";
import { browse } from "./services/tools/browserAPI.js";
const app = express();
const PORT = 5000;

app.use(express.json({ limit: "1mb" }));

app.get("/api/verification/plan", (_req: Request, res: Response) => {
    const plan = createVerificationPlan(mockVerificationPlannerInput);
    res.json({ input: mockVerificationPlannerInput, plan });
});

app.post("/api/verification/run", async (req: Request, res: Response) => {
    const body: unknown = req.body;
    let queryVectors: Record<string, number[]> = {};

    if (typeof body === "object" && body !== null && "queryVectors" in body) {
        const rawVectors = body.queryVectors;
        if (typeof rawVectors !== "object" || rawVectors === null || Array.isArray(rawVectors)) {
            res.status(400).json({ error: "queryVectors must be an object keyed by query ID" });
            return;
        }

        for (const [queryId, vector] of Object.entries(rawVectors)) {
            if (!Array.isArray(vector) || !vector.every(
                (value) => typeof value === "number" && Number.isFinite(value)
            )) {
                res.status(400).json({ error: `queryVectors.${queryId} must be an array of finite numbers` });
                return;
            }
            queryVectors[queryId] = vector;
        }
    }

    const plan = createVerificationPlan(mockVerificationPlannerInput);
    const retrieval = await retrieveEvidence(plan, queryVectors);
    const analysis = analyzeEvidence(mockVerificationPlannerInput, retrieval);
    const riskAssessment = assessRisk(mockVerificationPlannerInput.riskSignals, analysis);
    const explanation = createMockExplanation(analysis, retrieval, riskAssessment);
    res.json({ input: mockVerificationPlannerInput, plan, retrieval, analysis, riskAssessment, explanation });
});

app.get("/", async (req: Request, res: Response) => {
    try {
        browse('where is taj mahel?').catch(console.error);

    } catch (e) {
        res.status(500).json({ "message": e })
    }
})


app.listen(PORT, () => console.log(`server is runnning at : http://localhost:${PORT}`))
