/**
 * LLM Service — Clean Backend Interface / Adapter
 *
 * This file defines the contract between the VeraFin backend pipeline and the
 * LLM implementation owned by the LLM team.
 *
 * ─── HOW THE LLM TEAM CONNECTS THEIR IMPLEMENTATION ────────────────────────
 *
 * 1. The LLM team replaces the body of `runVerification` below with their
 *    actual LLM call (OpenAI, Gemini, local model, custom API, etc.).
 *
 * 2. The function MUST accept `LLMInput` and return a Promise of `LLMOutput`.
 *    The TypeScript types are imported from `../types/extractType.js`.
 *
 * 3. Add any required API keys / tokens to `.env` and read them via
 *    `process.env.YOUR_KEY_NAME` — never hard-code credentials.
 *
 * 4. If the LLM service is external (HTTP API), the recommended pattern is:
 *
 *       const response = await fetch(process.env.LLM_API_URL!, {
 *           method: "POST",
 *           headers: {
 *               "Content-Type": "application/json",
 *               "Authorization": `Bearer ${process.env.LLM_API_KEY}`,
 *           },
 *           body: JSON.stringify(input),
 *       });
 *       const data = await response.json();
 *       return data as LLMOutput;
 *
 * 5. Relevant environment variables to add (values set by LLM team):
 *       LLM_API_URL   — Base URL of the LLM API endpoint
 *       LLM_API_KEY   — API key / Bearer token for the LLM service
 *       LLM_MODEL     — Optional: specific model identifier
 *       LLM_TIMEOUT   — Optional: request timeout in ms (default: 30000)
 *
 * ─── INPUT / OUTPUT CONTRACT ─────────────────────────────────────────────────
 *
 * Input:
 *   {
 *     extractedText:       string        — full text (from raw input or OCR)
 *     input:               { type, language, source }
 *     claims:              ClaimItem[]
 *     financialInformation: FinancialInformation
 *     entities:            EntityGroup
 *     intent?:             { primary, secondary, requested_action, urgency }
 *     riskIndicators?:     RiskIndicatorItem[]
 *   }
 *
 * Output:
 *   {
 *     status:          "verified" | "unverified" | "suspicious" | "inconclusive"
 *     claims:          ClaimItem[]
 *     riskIndicators:  RiskIndicatorItem[]
 *     evidence:        string[]
 *     confidence?:     number  (0 – 1)
 *     explanation:     string
 *     recommendation:  string
 *     warnings?:       string[]
 *   }
 */

import type { LLMInput, LLMOutput } from "../types/extractType.js";

// ─── Main LLM Entry Point ──────────────────────────────────────────────────────

/**
 * Send structured content to the LLM for financial verification.
 *
 * Replace this function body with the real LLM call.
 * The signature must remain unchanged.
 */
export async function runVerification(input: LLMInput): Promise<LLMOutput> {
    const llmApiUrl = process.env.LLM_API_URL;
    const llmApiKey = process.env.LLM_API_KEY;

    // ── Stub mode: LLM not yet configured ────────────────────────────────────
    if (!llmApiUrl) {
        console.warn(
            "[LLMService] LLM_API_URL not set. Running in stub mode. " +
            "Set LLM_API_URL (and LLM_API_KEY if required) in .env to enable real verification."
        );

        return buildStubOutput(input);
    }

    // ── Real LLM call (replace / extend as needed) ────────────────────────────
    try {
        const timeout = parseInt(process.env.LLM_TIMEOUT ?? "30000", 10);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        if (llmApiKey) {
            headers["Authorization"] = `Bearer ${llmApiKey}`;
        }

        const response = await fetch(llmApiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(input),
            signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
            throw new Error(
                `LLM API returned HTTP ${response.status}: ${response.statusText}`
            );
        }

        const data = (await response.json()) as LLMOutput;
        return data;
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Unknown LLM error";
        console.error("[LLMService] LLM call failed:", message);
        throw new Error(`LLM verification failed: ${message}`);
    }
}

// ─── Stub Helper ───────────────────────────────────────────────────────────────

function buildStubOutput(input: LLMInput): LLMOutput {
    return {
        status: "inconclusive",
        risk_level: "none",
        claims: input.claims ?? [],
        riskIndicators: input.riskIndicators ?? [],
        evidence: [],
        sources: [],
        confidence: undefined,
        explanation:
            "LLM verification service is not yet configured. " +
            "This is a stub response. Set LLM_API_URL in .env to enable real verification.",
        recommendation:
            "Configure the LLM service (LLM_API_URL) to obtain a real verification result.",
        warnings: [
            "LLM_API_URL environment variable is not set. Running in stub mode.",
        ],
    };
}
