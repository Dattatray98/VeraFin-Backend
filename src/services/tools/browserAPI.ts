import { request as httpsRequest } from "node:https";
import dotenv from "dotenv";

dotenv.config();

type BrowseResult =
    | { success: true; query: string; data: unknown }
    | { success: false; query: string; error: string };

export const browse = async (question: string): Promise<BrowseResult> => {
    try {
        if (!question.trim()) {
            throw new Error("Search question cannot be empty");
        }

        const apiKey = process.env.BROWSE_API;

        if (!apiKey) {
            throw new Error("BROWSE_API is missing");
        }

        const googleUrl = new URL("https://www.google.com/search");
        googleUrl.searchParams.set("q", question);
        googleUrl.searchParams.set("hl", "en");
        googleUrl.searchParams.set("gl", "in");
        googleUrl.searchParams.set("brd_json", "1");

        const requestBody = JSON.stringify({
            zone: "serp_api1",
            url: googleUrl.toString(),
            format: "raw"
        });

        const responseText = await new Promise<string>((resolve, reject) => {
            const request = httpsRequest(
                "https://api.brightdata.com/request",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(requestBody)
                    },
                    signal: AbortSignal.timeout(30_000)
                },
                (response) => {
                    let body = "";
                    response.setEncoding("utf8");
                    response.on("data", (chunk: string) => {
                        body += chunk;
                    });
                    response.on("end", () => {
                        const status = response.statusCode ?? 0;
                        if (status < 200 || status >= 300) {
                            reject(new Error(`Bright Data API Error (${status}): ${body}`));
                            return;
                        }
                        resolve(body);
                    });
                    response.on("error", reject);
                }
            );

            request.on("error", reject);
            request.end(requestBody);
        });

        if (!responseText.trim()) {
            throw new Error("Bright Data returned an empty response");
        }

        let data: unknown;
        try {
            data = JSON.parse(responseText);
        } catch {
            throw new Error("Bright Data returned invalid JSON");
        }

        return {
            success: true,
            query: question,
            data
        };

    } catch (error) {
        console.error("Bright Data search error:", error);

        return {
            success: false,
            query: question,
            error: error instanceof Error
                ? error.message
                : "Unknown error"
        };
    }
};
