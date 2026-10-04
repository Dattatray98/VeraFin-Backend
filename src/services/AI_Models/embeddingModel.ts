import "dotenv/config";
import { InferenceClient } from "@huggingface/inference";

const DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

const isNumberArray = (value: unknown): value is number[] =>
    Array.isArray(value) && value.every(
        (item): item is number => typeof item === "number" && Number.isFinite(item)
    );

/** Generate a single text embedding with Hugging Face Inference Providers. */
export const generateEmbedding = async (text: string): Promise<number[]> => {
    if (!text.trim()) throw new Error("Text to embed cannot be empty");

    const token = process.env.HF_TOKEN;
    if (!token) throw new Error("HF_TOKEN is missing");

    const client = new InferenceClient(token);
    const output: unknown = await client.featureExtraction({
        model: process.env.HF_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
        inputs: text
    });

    // The feature-extraction API returns a batch of vectors for a string input.
    const vector = isNumberArray(output)
        ? output
        : Array.isArray(output) && output.length === 1 && isNumberArray(output[0])
            ? output[0]
            : null;

    if (!vector || vector.length === 0) {
        throw new Error("Hugging Face returned an invalid embedding vector");
    }

    return vector;
};
