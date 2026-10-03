import express from "express";
import type { Request, Response } from "express";
import dotenv from "dotenv";
import Cloudflare from "cloudflare";
import connectDB from "./config/db.js";
import userRoutes from "./routes/userRoutes.js";
import verificationRoutes from "./routes/verificationRoutes.js";

dotenv.config();

const app = express();
const PORT = 5000;

connectDB();

app.use(express.json());


app.use("/api/users", userRoutes);
app.use("/api/verification", verificationRoutes);


app.get("/", async (req: Request, res: Response) => {
    try {
        const client = new Cloudflare({
            apiToken: process.env["CLOUDFLARE_API_TOKEN"],
        });

        const zone = await client.zones.create({
            account: {
                id: "023e105f4ecef8ad9ca31a8372d0c353",
            },
            name: "example.com",
            type: "full",
        });

        console.log(zone.id);

        res.status(200).json({
            hello: "world",
        });
    } catch (e) {
        res.status(500).json({
            message: e,
        });
    }
});

app.listen(PORT, () => {
    console.log(`server is running at: http://localhost:${PORT}`);
});