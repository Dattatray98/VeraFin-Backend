# VeraFin Backend

VeraFin is a TypeScript backend prototype for checking financial messages and claims against evidence. Its intended purpose is to help people verify a message before paying, sharing information, or following a link. It is not an investment advice service.

The current implementation demonstrates part of the verification pipeline with a fixed sample input, a local LanceDB evidence store, preliminary claim status, and a rule-based risk summary. Several planned components are not implemented yet; see [Current scope](#current-scope).

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
| `BROWSE_API` | Bright Data API key used by the browser search helper | None |

Keep API keys in the backend environment and do not commit `.env`. The local LanceDB directory is runtime data and is git-ignored.

## API

### `GET /api/verification/plan`

Returns the built-in sample verification input and a plan of queries. Query IDs in this response are used to associate embedding vectors with vector database searches.

### `POST /api/verification/run`

Runs retrieval and the preliminary analysis/risk/explanation stages against the built-in sample input. The request body may contain vectors keyed by query ID:

```json
{
  "queryVectors": {
    "query-1": [0.12, -0.08, 0.31],
    "query-3": [0.09, 0.24, -0.17]
  }
}
```

Use the query IDs returned by `GET /api/verification/plan` and provide numeric vectors with the same dimensions as the vectors stored in LanceDB. The example values above are illustrative and will only work if stored vectors have three dimensions.

The response includes the sample input, plan, per-query retrieval outcomes, claim analysis, risk assessment, and explanation. `queryVectors` is optional; vector queries without a supplied vector report a retrieval failure. Sources other than `vector_db` currently have no configured retriever and also report retrieval failure.

## Evidence database

Evidence chunks are stored in a local LanceDB table. Each chunk includes a vector, text, document and source metadata, and an `isMock` flag. Search uses cosine distance and excludes chunks marked as mock data. The store exports `upsertEvidenceChunks`, `searchEvidenceByVector`, and `countEvidenceChunks` from `src/services/evidence/lanceEvidenceStore.ts`.

There is currently no HTTP endpoint or command-line script to ingest documents. Evidence must be added by calling the store from application code. Query embeddings also need to be generated outside this API and passed in the request; an embedding provider is not wired into the server yet.

## Current scope

- The planner input is a hard-coded example in `src/mocks/verificationPlannerInput.ts`; user-submitted messages are not processed.
- LanceDB vector retrieval is implemented, but structured database and browser search retrieval are not connected to the verification run.
- Claim analysis reports preliminary `unverified` or `unable_to_verify` results. It does not determine that evidence supports or contradicts claims.
- Risk scoring uses prototype weights, and the explanation is template-based. Neither should be treated as a definitive fraud determination.
- OCR, input extraction, document ingestion, and embedding generation are not implemented in the API flow.

The project plan describes the broader intended system; this README describes the behavior currently present in the source code.

## Project layout

```text
src/
├── index.ts                              # Express server and verification endpoints
├── mocks/verificationPlannerInput.ts     # Built-in sample verification input
├── services/
│   ├── evidence/lanceEvidenceStore.ts     # Local LanceDB storage and vector search
│   ├── tools/browserAPI.ts                # Bright Data search helper
│   └── verification/                      # Planning, retrieval, analysis, risk, explanation
└── types/                                 # Evidence and verification TypeScript types
```

## Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Start the server with `tsx watch` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
