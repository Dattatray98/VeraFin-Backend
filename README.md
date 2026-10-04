# VeraFin Backend

VeraFin is a TypeScript backend prototype for checking financial messages and claims against evidence. Its intended purpose is to help people verify a message before paying, sharing information, or following a link. It is not an investment advice service.

The backend accepts a message from the frontend, extracts verification details with an LLM, and checks claims against a local Chroma collection. It also watches `data/inputdata/` for PDFs, extracts text, creates page-aware chunks, generates embeddings, and stores the text and metadata in Chroma. Original PDFs stay in `data/inputdata/`; the ingestion code does not copy them elsewhere.

## Requirements

- Node.js 20 or newer
- npm
- Poppler command-line tools (`pdftotext` and `pdfinfo`) for PDF text extraction
- A local Chroma server

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
| `CHROMA_URL` | Chroma HTTP server | `http://localhost:8000` |
| `CHROMA_TENANT` | Chroma tenant | `default_tenant` |
| `CHROMA_DATABASE` | Chroma database | `default_database` |
| `CHROMA_COLLECTION` | Verification evidence collection | `verafin_evidence` |
| `CHROMA_TOKEN` | Optional Chroma server token | None |
| `PDF_INPUT_DIRECTORY` | Folder watched for new PDFs | `data/inputdata` |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins, or `*` | `*` |
| `LLM_PROVIDER` | LLM backend: `huggingface` or `ollama` | `huggingface` |
| `HF_TOKEN` | Hugging Face token with Inference Providers permission | None |
| `HF_MODEL` | Hugging Face chat model identifier | `deepseek-ai/DeepSeek-V4.1-Flash:novita` |
| `HF_EMBEDDING_MODEL` | Hugging Face feature-extraction model | `sentence-transformers/all-MiniLM-L6-v2` |
| `OLLAMA_URL` | Ollama server base URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Installed local Ollama model name | None |

Keep API keys in the backend environment and do not commit `.env`. Chroma stores its persistent data in the path used when starting its server. The watcher keeps only hash/status metadata under `data/metadata/` and does not create extracted PDF copies.

For local Ollama text generation, set `LLM_PROVIDER=ollama` and provide `OLLAMA_MODEL`. Hugging Face embeddings always use `HF_TOKEN` and `HF_EMBEDDING_MODEL`, regardless of the selected LLM provider.

## API

### `POST /api/verification/run`

Receives a frontend message, runs extraction, planning, Chroma vector retrieval, evidence analysis, risk assessment, and explanation, then returns the result. The backend console logs the incoming message and evidence retrieved from Chroma. Chroma is the only configured evidence source.

Request:

```json
{
  "message": "Your account will be blocked. Pay a verification fee now."
}
```

The response includes the extracted verification input, plan, vector retrieval results, analysis, risk assessment, and explanation. Invalid or empty messages return HTTP 400. Model or verification errors return HTTP 503.

## Evidence database

Evidence chunks are stored in the Chroma `verafin_evidence` collection with their embedding, text, and source metadata. Search uses cosine distance and excludes chunks marked as mock data. Chroma requests use Node's built-in `fetch`; no Chroma npm package is required.

On backend startup, a watcher scans and monitors `data/inputdata/` for PDF files. It waits for each file to finish writing, validates its PDF signature, extracts page text with Poppler, splits it into page-aware chunks, generates vectors with the configured Hugging Face embedding model, and upserts those records to Chroma. A hash manifest skips unchanged files and records processing status. Scanned PDFs are reported as requiring OCR; OCR is not included. Use the same embedding model for ingestion and verification queries.

Start a persistent local Chroma server in a separate terminal:

```bash
python3 -m pip install chromadb
chroma run --path ./data/chroma --host 127.0.0.1 --port 8000
```

Then run the backend with `npm run dev` and place PDFs directly in `data/inputdata/`. The original PDFs remain there; extracted text and embeddings are sent to Chroma, and only processing hashes/status are written under `data/metadata/`.

## Current scope

- Frontend text is processed by an LLM extraction step; images and OCR are not supported yet.
- Chroma is the only evidence source in the current verification flow; browser and structured database retrieval are not used.
- Claim analysis uses the LLM to assess retrieved evidence. `supported` and `contradicted` results require IDs from retrieved evidence; absent or failed retrieval is not treated as proof that a claim is false.
- Risk scoring uses prototype weights. Neither it nor the LLM-based analysis and explanation should be treated as a definitive fraud determination.
- Screenshot OCR is not implemented. Scanned PDFs need a separate OCR step. A Hugging Face embedding provider and Hugging Face/Ollama text generation providers are available through the model functions.

The project plan describes the broader intended system; this README describes the behavior currently present in the source code.

## Project layout

```text
src/
├── index.ts                              # Express server and verification endpoints
├── services/
│   ├── AI_Models/                         # Hugging Face embeddings and Hugging Face/Ollama LLM adapters
│   ├── evidence/chromaEvidenceStore.ts    # Chroma storage and vector search
│   ├── evidence/inputPdfWatcher.ts        # Watch, extract, chunk, embed, and ingest PDFs
│   └── verification/                      # Planning, retrieval, analysis, risk, explanation
└── types/                                 # Evidence and verification TypeScript types
```

## Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Start the server with `tsx watch` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
