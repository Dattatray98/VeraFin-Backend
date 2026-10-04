/**
 * Voice Service — Speech-to-Text Abstraction
 *
 * Converts uploaded audio files to text for the voice submission flow.
 * Uses a configured speech-to-text-compatible API; fails closed when no service is configured.
 *
 * Required environment variable (to be set by LLM / audio team):
 *   STT_API_URL   — Speech-to-text API endpoint
 *   STT_API_KEY   — Auth token for the STT service
 *   STT_MODEL     — Optional model ID (e.g. "whisper-1")
 */

import { readFile } from "node:fs/promises";

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
 * The configured endpoint is expected to accept a multipart `file` and `model`
 * and return JSON containing a `text` field.
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

    if (!sttApiUrl) {
        return {
            success: false,
            transcribedText: "",
            error: "Voice transcription is not configured; set STT_API_URL to enable voice submissions",
        };
    }

    // ── Real STT call ──────────────────────────────────────────────────────────
    try {
        const sttApiKey = process.env.STT_API_KEY;
        const model = process.env.STT_MODEL ?? "whisper-1";

        const audioBuffer = await readFile(filePath);
        const formData = new FormData();
        formData.append("file", new Blob([new Uint8Array(audioBuffer)]), originalName);
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

        const transcribedText = data.text?.trim() ?? "";
        if (!transcribedText) throw new Error("STT service returned empty text");

        return {
            success: true,
            transcribedText,
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
