import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import connectDB from "./config/db.js";
import userRoutes from "./routes/userRoutes.js";
import verificationRoutes from "./routes/verificationRoutes.js";
import { startInputPdfWatcher } from "./services/evidence/inputPdfWatcher.js";

const app = express();
const PORT = Number(process.env.PORT ?? 5000);

const allowedOrigins = (process.env.CORS_ORIGIN ?? "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use((req: Request, res: Response, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes("*")) {
        res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (origin && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
    }
    next();
});

app.use(express.json({ limit: "1mb" }));
app.use("/api/users", userRoutes);
app.use("/api/verification", verificationRoutes);

app.get("/", (_req, res) => {
    res.status(200).json({ status: "ok", evidenceSource: "chroma" });
});

const startServer = async (): Promise<void> => {
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required for authenticated routes");
    await connectDB();
    await startInputPdfWatcher();
    app.listen(PORT, () => console.log(`Server is running at http://localhost:${PORT}`));
};

void startServer().catch((error: unknown) => {
    console.error("Server startup failed:", error);
    process.exitCode = 1;
});
