import mongoose, { Schema, Document } from "mongoose";

// ─── Verification Document Interface ──────────────────────────────────────────

export interface IVerification extends Document {
    userId: mongoose.Types.ObjectId;

    /** Input metadata about the submitted content */
    input: {
        type: "text" | "image" | "voice";
        language: string;
        source: string;
    };

    /** Raw content submitted */
    content: {
        raw_text?: string;
        extracted_text?: string;
        image_metadata?: {
            originalName: string;
            mimeType: string;
            sizeBytes: number;
            uploadedAt: Date;
            storagePath: string;
        };
        audio_metadata?: {
            originalName: string;
            mimeType: string;
            sizeBytes: number;
            uploadedAt: Date;
            storagePath: string;
            durationSeconds?: number;
        };
    };

    /** Processing status */
    status: "pending" | "processing" | "completed" | "failed";

    /** Structured data extracted by LLM / OCR pipeline */
    extractedData?: {
        intent?: {
            primary: string;
            secondary: string[];
            requested_action: string;
            urgency: string;
        };
        links?: {
            url: string;
            domain: string;
            context: string;
            position: string;
        }[];
        keywords?: string[];
        entities?: {
            organizations: string[];
            companies: string[];
            financial_institutions: string[];
            regulatory_bodies: string[];
            people: string[];
            locations: string[];
        };
        financial_information?: {
            amounts: { value: string; currency: string; context: string }[];
            payment_methods: string[];
            upi_ids: string[];
            account_numbers: string[];
        };
        claims?: {
            claim: string;
            claim_type: string;
            subject: string;
        }[];
        risk_indicators?: {
            indicator: string;
            evidence: string;
            severity: string;
        }[];
    };

    /** Final verification result from LLM */
    result?: {
        overall_status: "verified" | "unverified" | "suspicious" | "inconclusive";
        /** UI risk label shown in app cards and analysis result screen */
        risk_level: "high" | "medium" | "low" | "none";
        confidence?: number;
        explanation: string;
        evidence: string[];
        warnings: string[];
        recommendation: string;
        /** Per-source verification results for Evidence & Verification screen */
        sources?: {
            name: string;           // e.g. "SEBI Official Website"
            url?: string;
            status: "found" | "not_found" | "unverified";
            detail?: string;
        }[];
        claims?: {
            claim: string;
            claim_type: string;
            subject: string;
        }[];
        risk_indicators?: {
            indicator: string;
            evidence: string;
            severity: "high" | "medium" | "low";
        }[];
    };

    /** Error message if processing failed */
    error?: string;

    createdAt: Date;
    updatedAt: Date;
}

// ─── Schema ────────────────────────────────────────────────────────────────────

const verificationSchema = new Schema<IVerification>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        input: {
            type: {
                type: String,
                enum: ["text", "image", "voice"],
                required: true,
            },
            language: {
                type: String,
                required: true,
                default: "en",
            },
            source: {
                type: String,
                required: true,
            },
        },

        content: {
            raw_text: { type: String },
            extracted_text: { type: String },
            image_metadata: {
                originalName: { type: String },
                mimeType: { type: String },
                sizeBytes: { type: Number },
                uploadedAt: { type: Date },
                storagePath: { type: String },
            },
            audio_metadata: {
                originalName: { type: String },
                mimeType: { type: String },
                sizeBytes: { type: Number },
                uploadedAt: { type: Date },
                storagePath: { type: String },
                durationSeconds: { type: Number },
            },
        },

        status: {
            type: String,
            enum: ["pending", "processing", "completed", "failed"],
            default: "pending",
        },

        extractedData: {
            type: Schema.Types.Mixed,
        },

        result: {
            type: Schema.Types.Mixed,
        },

        error: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

const Verification = mongoose.model<IVerification>(
    "Verification",
    verificationSchema
);

export default Verification;