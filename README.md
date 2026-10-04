# VeraFin Backend

VeraFin is a TypeScript backend prototype for checking financial messages and claims against evidence. Its intended purpose is to help people verify a message before paying, sharing information, or following a link. It is not an investment advice service.

The current implementation accepts a message from the frontend, extracts verification details with an LLM, and checks claims against a local LanceDB evidence store. It then analyzes the retrieved evidence, calculates a prototype risk score, and produces an explanation. Several planned components are not implemented yet; see [Current scope](#current-scope).

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```bash
npm install
npm run dev
```

The development server listens at `http://localhost:5000`.

To compile and run the production build:

```bash
npm run build
npm start
```

`npm run build` compiles TypeScript from `src/` into `dist/`.

## Configuration

The server can start without environment variables. Add a `.env` file in the project root to configure optional settings:

| Variable | Purpose | Default |
| --- | --- | --- |
| `EVIDENCE_DB_PATH` | Local directory used by LanceDB | `data/evidence/lancedb` |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins, or `*` | `*` |
| `LLM_PROVIDER` | LLM backend: `huggingface` or `ollama` | `huggingface` |
| `HF_TOKEN` | Hugging Face token with Inference Providers permission | None |
| `HF_MODEL` | Hugging Face chat model identifier | `deepseek-ai/DeepSeek-V4.1-Flash:novita` |
| `HF_EMBEDDING_MODEL` | Hugging Face feature-extraction model | `sentence-transformers/all-MiniLM-L6-v2` |
| `OLLAMA_URL` | Ollama server base URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Installed local Ollama model name | None |

Keep API keys in the backend environment and do not commit `.env`. The local LanceDB directory is runtime data and is git-ignored.

For local Ollama text generation, set `LLM_PROVIDER=ollama` and provide `OLLAMA_MODEL`. Hugging Face embeddings always use `HF_TOKEN` and `HF_EMBEDDING_MODEL`, regardless of the selected LLM provider.

## API

### `POST /api/verification/run`

Receives a frontend message, runs extraction, planning, vector retrieval, evidence analysis, risk assessment, and explanation, then returns the result. The backend console logs only the incoming message and evidence retrieved from LanceDB. LanceDB is the only configured evidence source.

Request:

```json
{
  "message": "Your account will be blocked. Pay a verification fee now."
}
```

The response includes the extracted verification input, plan, vector retrieval results, analysis, risk assessment, and explanation. Invalid or empty messages return HTTP 400. Model or verification errors return HTTP 503.

## Evidence database

Evidence chunks are stored in a local LanceDB table. Each chunk includes a vector, text, document and source metadata, and an `isMock` flag. Search uses cosine distance and excludes chunks marked as mock data. The store exports `upsertEvidenceChunks`, `searchEvidenceByVector`, and `countEvidenceChunks` from `src/services/evidence/lanceEvidenceStore.ts`.

There is currently no HTTP endpoint or command-line script to ingest documents. Evidence must be added by calling the store from application code. Query vectors are generated with the configured Hugging Face embedding model. Ingested evidence vectors must be generated with the same model and dimensions.

## Current scope

- Frontend text is processed by an LLM extraction step; images and OCR are not supported yet.
- LanceDB is the only evidence source in the current verification flow; browser and structured database retrieval are not used.
- Claim analysis uses the LLM to assess retrieved evidence. `supported` and `contradicted` results require IDs from retrieved evidence; absent or failed retrieval is not treated as proof that a claim is false.
- Risk scoring uses prototype weights. Neither it nor the LLM-based analysis and explanation should be treated as a definitive fraud determination.
- Screenshot OCR and document ingestion are not implemented. A Hugging Face embedding provider and Hugging Face/Ollama text generation providers are available through the model functions.

The project plan describes the broader intended system; this README describes the behavior currently present in the source code.

## Project layout

```text
src/
├── index.ts                              # Express server and verification endpoints
├── services/
│   ├── AI_Models/                         # Hugging Face embeddings and Hugging Face/Ollama LLM adapters
│   ├── evidence/lanceEvidenceStore.ts     # Local LanceDB storage and vector search
│   └── verification/                      # Planning, retrieval, analysis, risk, explanation
└── types/                                 # Evidence and verification TypeScript types
```

## Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Start the server with `tsx watch` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
