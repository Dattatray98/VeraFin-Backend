import { CloudClient } from "chromadb";

const apiKey = process.env.CHROMA_API_KEY ?? process.env.CHROMA_TOKEN;
const tenant = process.env.CHROMA_TENANT;
const database = process.env.CHROMA_DATABASE;

if (!apiKey) {
    throw new Error("CHROMA_API_KEY (or CHROMA_TOKEN) is required to connect to Chroma Cloud");
}
if (!tenant) throw new Error("CHROMA_TENANT is required to connect to Chroma Cloud");
if (!database) throw new Error("CHROMA_DATABASE is required to connect to Chroma Cloud");

export const chromaClient = new CloudClient({ apiKey, tenant, database });
