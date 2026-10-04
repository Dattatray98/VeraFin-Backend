import { generateText } from "../AI_Models/llmModel.js";
import type {
    EvidenceAnalysis,
    EvidenceRetrieval,
    ExplanationEvidence,
    RiskAssessment,
    VerificationExplanation
} from "../../types/verification.js";

export const createExplanation = async (
    analysis: EvidenceAnalysis,
    retrieval: EvidenceRetrieval,
    risk: RiskAssessment
): Promise<VerificationExplanation> => {
    const evidence: ExplanationEvidence[] = retrieval.results.flatMap((result) =>
        result.evidence.map((item) => ({
            id: item.id,
            title: item.title,
            sourceName: item.sourceName,
            sourceUrl: item.sourceUrl,
            source: result.source,
            retrievedAt: item.retrievedAt,
            isMock: item.isMock
        }))
    );

    const prompt = [
        "Write a clear, cautious explanation of this financial message verification result.",
        "Use only the supplied risk assessment, claim analysis, and evidence. Do not invent facts or sources.",
        "Do not call something fraud based only on missing evidence. Distinguish retrieval failure from no evidence found.",
        "Return only valid JSON: {\"summary\":string,\"reasons\":string[],\"claimExplanations\":string[],\"recommendedActions\":string[]}",
        "claimExplanations must have one short explanation per claim, in the same order.",
        `Risk: ${JSON.stringify(risk)}`,
        `Analysis: ${JSON.stringify(analysis)}`,
        `Retrieval: ${JSON.stringify(retrieval)}`
    ].join("\n");
    const response = await generateText(prompt);
    let generated: unknown;
    try {
        generated = JSON.parse(response);
    } catch {
        throw new Error("LLM returned invalid JSON for the explanation");
    }
    if (typeof generated !== "object" || generated === null) {
        throw new Error("LLM returned an invalid explanation");
    }
    const content = generated as Record<string, unknown>;
    if (
        typeof content.summary !== "string" || !Array.isArray(content.reasons) ||
        !content.reasons.every((item) => typeof item === "string") ||
        !Array.isArray(content.claimExplanations) ||
        !content.claimExplanations.every((item) => typeof item === "string") ||
        !Array.isArray(content.recommendedActions) ||
        !content.recommendedActions.every((item) => typeof item === "string")
    ) {
        throw new Error("LLM returned an invalid explanation");
    }

    return {
        mode: "llm",
        risk: { level: risk.level, score: risk.score },
        summary: content.summary,
        reasons: content.reasons as string[],
        claims: analysis.assessments.map((assessment, index) => ({
            claim: assessment.claim,
            status: assessment.status,
            explanation: content.claimExplanations[index] as string | undefined ?? assessment.explanation,
            evidenceIds: assessment.evidenceIds
        })),
        evidence,
        limitations: risk.limitations,
        recommendedActions: content.recommendedActions as string[],
        notice: "The generated explanation uses LLM evidence analysis and prototype risk weights. It is not a definitive fraud determination."
    };
};
