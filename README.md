# VeraFin Backend

VeraFin is a TypeScript backend prototype for checking financial messages and claims against evidence. Its intended purpose is to help people verify a message before paying, sharing information, or following a link. It is not an investment advice service.

The current implementation demonstrates part of the verification pipeline with a fixed sample input, a local LanceDB evidence store, preliminary claim status, and a rule-based risk summary. Model calls are routed through shared embedding and LLM functions. Several planned components are not implemented yet; see [Current scope](#current-scope).

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
| `LLM_PROVIDER` | LLM backend: `huggingface` or `ollama` | `huggingface` |
| `HF_TOKEN` | Hugging Face token with Inference Providers permission | None |
| `HF_MODEL` | Hugging Face chat model identifier | `deepseek-ai/DeepSeek-V4.1-Flash:novita` |
| `HF_EMBEDDING_MODEL` | Hugging Face feature-extraction model | `sentence-transformers/all-MiniLM-L6-v2` |
| `OLLAMA_URL` | Ollama server base URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Installed local Ollama model name | None |

Keep API keys in the backend environment and do not commit `.env`. The local LanceDB directory is runtime data and is git-ignored.

For local Ollama text generation, set `LLM_PROVIDER=ollama` and provide `OLLAMA_MODEL`. Hugging Face embeddings always use `HF_TOKEN` and `HF_EMBEDDING_MODEL`, regardless of the selected LLM provider.

## API

### `GET /api/verification/plan`

Uses the configured LLM provider to create a plan from the built-in sample input and returns both. The request returns HTTP 503 if the provider is not configured or the model request fails.

### `POST /api/verification/run`

Runs planning, retrieval, evidence analysis, risk assessment, and explanation against the built-in sample input. The planner, analyzer, and explanation call the configured LLM provider; vector retrieval generates embeddings with Hugging Face. The response includes the sample input, plan, vector retrieval outcomes, evidence analysis, risk assessment, and explanation. LanceDB is the only configured evidence source. The request returns HTTP 503 if model configuration or a model request fails.

## Evidence database

Evidence chunks are stored in a local LanceDB table. Each chunk includes a vector, text, document and source metadata, and an `isMock` flag. Search uses cosine distance and excludes chunks marked as mock data. The store exports `upsertEvidenceChunks`, `searchEvidenceByVector`, and `countEvidenceChunks` from `src/services/evidence/lanceEvidenceStore.ts`.

There is currently no HTTP endpoint or command-line script to ingest documents. Evidence must be added by calling the store from application code. Query vectors are generated with the configured Hugging Face embedding model. Ingested evidence vectors must be generated with the same model and dimensions.

## Current scope

- The planner input is a hard-coded example in `src/mocks/verificationPlannerInput.ts`; user-submitted messages are not processed. The planner delegates query generation to the LLM model function.
- LanceDB is the only evidence source in the current verification flow; browser and structured database retrieval are not used.
- Claim analysis uses the LLM to assess retrieved evidence. `supported` and `contradicted` results require IDs from retrieved evidence; absent or failed retrieval is not treated as proof that a claim is false.
- Risk scoring uses prototype weights. Neither it nor the LLM-based analysis and explanation should be treated as a definitive fraud determination.
- OCR, input extraction, and document ingestion are not implemented in the API flow. A Hugging Face embedding provider and Hugging Face/Ollama text generation providers are available through the model functions.

The project plan describes the broader intended system; this README describes the behavior currently present in the source code.

## Project layout

```text
src/
├── index.ts                              # Express server and verification endpoints
├── mocks/verificationPlannerInput.ts     # Built-in sample verification input
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
