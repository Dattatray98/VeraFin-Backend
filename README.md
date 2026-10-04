# VeraFin Backend

VeraFin is a TypeScript backend prototype for checking financial messages and claims against evidence. Its intended purpose is to help people verify a message before paying, sharing information, or following a link. It is not an investment advice service.

The backend accepts a message from the frontend, extracts verification details with an LLM, and checks claims against a local Chroma collection. It also watches `data/inputdata/` for PDFs, extracts text, creates page-aware chunks, generates embeddings, and stores the text and metadata in Chroma. Original PDFs stay in `data/inputdata/`; the ingestion code does not copy them elsewhere.

## Requirements

- Node.js 20 or newer
- npm
- MongoDB
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

Copy `.env.example` to `.env` and replace the placeholders. `MONGO_URI` and `JWT_SECRET` are required. Text extraction, screenshot transcription, and embeddings require a Hugging Face token. Image bytes are sent to the configured vision model; the resulting text and verification prompts are sent to the selected LLM provider.

| Variable | Purpose | Default |
| --- | --- | --- |
| `CHROMA_API_KEY` | Chroma Cloud API key | Required for cloud |
| `CHROMA_TENANT` | Chroma tenant | `default_tenant` |
| `CHROMA_DATABASE` | Chroma database | `default_database` |
| `CHROMA_COLLECTION` | Verification evidence collection | `verafin_evidence` |
| `CHROMA_TOKEN` | Optional token alias for `CHROMA_API_KEY` | None |
| `PDF_INPUT_DIRECTORY` | Folder watched for new PDFs | `data/inputdata` |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins, or `*` | `*` |
| `LLM_PROVIDER` | LLM backend: `huggingface` or `ollama` | `huggingface` |
| `HF_TOKEN` | Hugging Face token with Inference Providers permission | Required for HF models |
| `HF_MODEL` | Hugging Face chat model identifier | `deepseek-ai/DeepSeek-V4.1-Flash:novita` |
| `HF_VISION_MODEL` | Hugging Face vision-language model for screenshot transcription | `Qwen/Qwen2.5-VL-3B-Instruct` |
| `HF_EMBEDDING_MODEL` | Hugging Face feature-extraction model | `sentence-transformers/all-MiniLM-L6-v2` |
| `MONGO_URI` | MongoDB connection string for users and verification history | Required |
| `JWT_SECRET` | Secret used to validate authenticated API requests | Required |
| `OLLAMA_URL` | Ollama server base URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Installed local Ollama model name | None |

The backend initializes Chroma Cloud through the TypeScript `CloudClient` in `src/config/chroma.ts`. Set `CHROMA_API_KEY`, `CHROMA_TENANT`, and `CHROMA_DATABASE`; the collection is created on first use. `CHROMA_TOKEN` is accepted as an API key alias.

Keep API keys in the backend environment and do not commit `.env`. Chroma stores its persistent data in the path used when starting its server. The watcher keeps only hash/status metadata under `data/metadata/` and does not create extracted PDF copies.

For local Ollama text generation, set `LLM_PROVIDER=ollama` and provide `OLLAMA_MODEL`. Hugging Face embeddings always use `HF_TOKEN` and `HF_EMBEDDING_MODEL`, regardless of the selected LLM provider.

## API

### `POST /api/verification/submit`

Requires a bearer JWT. Text is submitted as JSON. Images use `multipart/form-data` and the `image` field. Both input types run through extraction, planning, Chroma retrieval, evidence analysis, risk assessment, and explanation. The endpoint returns a verification ID immediately; poll `GET /api/verification/:id` for the completed result. Chroma is the only configured evidence source.

Request:

```json
{
  "language": "en",
  "source": "whatsapp",
  "raw_text": "Your account will be blocked. Pay a verification fee now."
}
```

Image requests include `language`, `source`, and an `image` file (JPEG, PNG, or WEBP, up to 10 MB). OCR extracts text before the same verification pipeline runs. The completed record contains extracted text, structured claims, plan, retrieval results, analysis, risk assessment, and explanation. Invalid requests return HTTP 400; processing failures are saved with status `failed`.

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

- Text is processed by an LLM extraction step. Uploaded images use Hugging Face printed-text OCR before entering the same pipeline; handwritten text and complex document layouts can be misread.
- Chroma is the only evidence source in the current verification flow; browser and structured database retrieval are not used.
- Claim analysis uses the LLM to assess retrieved evidence. `supported` and `contradicted` results require IDs from retrieved evidence; absent or failed retrieval is not treated as proof that a claim is false.
- Risk scoring uses prototype weights. Neither it nor the LLM-based analysis and explanation should be treated as a definitive fraud determination.
- Scanned PDFs still need a separate OCR step. A Hugging Face embedding provider and Hugging Face/Ollama text generation providers are available through the model functions.

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
