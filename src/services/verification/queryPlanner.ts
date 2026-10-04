import { generateText } from "../AI_Models/llmModel.js";
import type {
    VerificationPlan,
    VerificationPlannerInput,
    VerificationQuery
} from "../../types/verification.js";

export const createVerificationPlan = async (
    input: VerificationPlannerInput
): Promise<VerificationPlan> => {
    const prompt = [
        "Create a verification query plan from the provided JSON input.",
        "Return only valid JSON in this shape:",
        '{"queries":[{"id":"query-1","query":"...","source":"vector_db","target":{"type":"claim|entity|domain","value":"..."},"purpose":"..."}]}',
        "Use only the vector_db source. Create queries for relevant claims, entities, and links that can be searched in the evidence vector database.",
        "A missing result must not be treated as proof that a claim is false.",
        `Input: ${JSON.stringify(input)}`
    ].join("\n");
    const response = await generateText(prompt);

    let parsed: unknown;
    try {
        parsed = JSON.parse(response);
    } catch {
        throw new Error("LLM returned invalid JSON for the verification plan");
    }

    if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { queries?: unknown }).queries)) {
        throw new Error("LLM returned an invalid verification plan");
    }

    const queries = (parsed as { queries: unknown[] }).queries.map((item, index): VerificationQuery => {
        if (typeof item !== "object" || item === null) {
            throw new Error(`Verification query ${index + 1} is invalid`);
        }
        const query = item as Record<string, unknown>;
        const target = query.target as Record<string, unknown> | null;
        if (
            typeof query.id !== "string" || typeof query.query !== "string" ||
            typeof query.purpose !== "string" || query.source !== "vector_db" ||
            !target || typeof target.value !== "string" ||
            (target.type !== "claim" && target.type !== "entity" && target.type !== "domain")
        ) {
            throw new Error(`Verification query ${index + 1} is invalid`);
        }
        return {
            id: query.id,
            query: query.query,
            source: query.source,
            purpose: query.purpose,
            target: { type: target.type, value: target.value }
        };
    });

    return { mode: "llm", queries };
};
