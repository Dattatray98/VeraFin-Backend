import "dotenv/config";
import { InferenceClient } from "@huggingface/inference";

const HUGGING_FACE_URL = "https://router.huggingface.co/v1/chat/completions";
const DEFAULT_HUGGING_FACE_MODEL = "deepseek-ai/DeepSeek-V4.1-Flash:novita";
const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const REQUEST_TIMEOUT_MS = 120_000;

type JsonObject = Record<string, unknown>;

const isJsonObject = (value: unknown): value is JsonObject =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const responseError = async (response: Response): Promise<Error> => {
    const details = await response.text().catch(() => "");
    return new Error(
        `Model request failed (${response.status})${details ? `: ${details}` : ""}`
    );
};

export class ControllerModel {
    constructor(private readonly prompt: string) {}

    async brain(): Promise<string> {
        const token = process.env.HF_TOKEN;
        if (!token) throw new Error("HF_TOKEN is missing");

        const response = await fetch(HUGGING_FACE_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: process.env.HF_MODEL ?? DEFAULT_HUGGING_FACE_MODEL,
                messages: [{ role: "user", content: this.prompt }]
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) throw await responseError(response);

        const data: unknown = await response.json();
        if (!isJsonObject(data) || !Array.isArray(data.choices)) {
            throw new Error("Hugging Face returned an invalid chat completion response");
        }

        const firstChoice: unknown = data.choices[0];
        if (!isJsonObject(firstChoice) || !isJsonObject(firstChoice.message)) {
            throw new Error("Hugging Face response did not contain a message");
        }

        const content = firstChoice.message.content;
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
            const text = content
                .filter(isJsonObject)
                .map((part) => part.text)
                .filter((part): part is string => typeof part === "string")
                .join("");
            if (text) return text;
        }

        throw new Error("Hugging Face returned an empty or unsupported message");
    }
}

export class OllamaModel {
    private readonly model = process.env.OLLAMA_MODEL;
    private readonly baseUrl = (process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL).replace(/\/+$/, "");

    async Model(prompt: string): Promise<string> {
        if (!this.model) throw new Error("OLLAMA_MODEL is missing");

        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: this.model, prompt, stream: false }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) throw await responseError(response);

        const data: unknown = await response.json();
        if (!isJsonObject(data) || typeof data.response !== "string") {
            throw new Error("Ollama returned an invalid generate response");
        }
        return data.response;
    }
}

/** Routes text generation to Hugging Face or a local Ollama server. */
export const generateText = async (prompt: string): Promise<string> => {
    if (!prompt.trim()) throw new Error("LLM prompt cannot be empty");

    const provider = (process.env.LLM_PROVIDER ?? "huggingface").toLowerCase();
    if (provider === "ollama") return new OllamaModel().Model(prompt);
    if (provider === "huggingface") return new ControllerModel(prompt).brain();

    throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
};

/** Read text from an image with a vision-language model. */
export const extractImageText = async (image: Buffer, mimeType: string, prompt: string): Promise<string> => {
    const token = process.env.HF_TOKEN;
    if (!token) throw new Error("HF_TOKEN is missing");
    if (!image.length) throw new Error("Image data is empty");

    const client = new InferenceClient(token);
    const response = await client.chatCompletion({
        model: process.env.HF_VISION_MODEL ?? "Qwen/Qwen2.5-VL-3B-Instruct",
        messages: [{
            role: "user",
            content: [
                { type: "text", text: prompt },
                {
                    type: "image_url",
                    image_url: { url: `data:${mimeType};base64,${image.toString("base64")}` }
                }
            ]
        }],
        temperature: 0,
        max_tokens: 2048
    });

    const text = response.choices[0]?.message.content?.trim();
    if (!text) throw new Error("Vision model returned no text");
    return text;
};
