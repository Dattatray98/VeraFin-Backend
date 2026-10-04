/**
 * Voice Service — Speech-to-Text Abstraction
 *
 * Converts uploaded audio files to text for the voice submission flow.
 * Currently a stub — replace with a real STT provider (e.g. Whisper, Google STT).
 *
 * Required environment variable (to be set by LLM / audio team):
 *   STT_API_URL   — Speech-to-text API endpoint
 *   STT_API_KEY   — Auth token for the STT service
 *   STT_MODEL     — Optional model ID (e.g. "whisper-1")
 */

import fs from "fs";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface STTResult {
    success: boolean;
    transcribedText: string;
    language?: string;
    durationSeconds?: number;
    error?: string;
}

// ─── Allowed Audio Formats ─────────────────────────────────────────────────────

export const ALLOWED_AUDIO_MIME_TYPES = [
    "audio/mpeg",       // .mp3
    "audio/mp4",        // .m4a
    "audio/wav",        // .wav
    "audio/webm",       // .webm
    "audio/ogg",        // .ogg
    "audio/x-m4a",     // .m4a (alternate)
];

export const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

// ─── STT Implementation ────────────────────────────────────────────────────────

/**
 * Transcribe speech from an audio file to text.
 *
 * Replace this function body with a real STT provider call.
 * Recommended providers:
 *   - OpenAI Whisper:  POST https://api.openai.com/v1/audio/transcriptions
 *   - Google Cloud STT
 *   - Azure Cognitive Services
 *
 * @param filePath Absolute path to the uploaded audio file
 * @param originalName Original filename (for MIME detection)
 * @param language BCP-47 language code (e.g. "en", "hi") — optional hint
 */
export async function transcribeAudio(
    filePath: string,
    originalName: string,
    language?: string
): Promise<STTResult> {
    const sttApiUrl = process.env.STT_API_URL;

    // ── Stub mode ──────────────────────────────────────────────────────────────
    if (!sttApiUrl) {
        console.warn(
            "[VoiceService] STT_API_URL not set. Running in stub mode. " +
            "Set STT_API_URL (and STT_API_KEY) in .env to enable real transcription."
        );

        // Verify file still exists
        if (!fs.existsSync(filePath)) {
            return {
                success: false,
                transcribedText: "",
                error: `Audio file not found at path: ${filePath}`,
            };
        }

        return {
            success: true,
            transcribedText:
                `[VOICE STUB] Transcription not configured. ` +
                `Audio file "${originalName}" was received and stored. ` +
                `Set STT_API_URL in .env to enable real speech-to-text.`,
            language: language ?? "en",
        };
    }

    // ── Real STT call ──────────────────────────────────────────────────────────
    try {
        const sttApiKey = process.env.STT_API_KEY;
        const model = process.env.STT_MODEL ?? "whisper-1";

        const audioBuffer = fs.readFileSync(filePath);
        const formData = new FormData();
        formData.append("file", new Blob([audioBuffer]), originalName);
        formData.append("model", model);
        if (language) formData.append("language", language);

        const headers: Record<string, string> = {};
        if (sttApiKey) {
            headers["Authorization"] = `Bearer ${sttApiKey}`;
        }

        const response = await fetch(sttApiUrl, {
            method: "POST",
            headers,
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`STT API returned HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as { text?: string };

        return {
            success: true,
            transcribedText: data.text?.trim() ?? "[STT returned empty result]",
            language,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown STT error";
        console.error("[VoiceService] Transcription failed:", message);
        return {
            success: false,
            transcribedText: "",
            error: `Speech-to-text failed: ${message}`,
        };
    }
}
