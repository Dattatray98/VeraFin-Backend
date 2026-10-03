import mongoose, { Schema, Document } from "mongoose";

export interface IVerification extends Document {
    userId: mongoose.Types.ObjectId;

    input: {
        type: string;
        language: string;
        source: string;
    };

    content: {
        raw_text: string;
    };

    status: "pending" | "processing" | "completed" | "failed";

    result?: Record<string, unknown>;

    error?: string;

    createdAt: Date;
    updatedAt: Date;
}

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
                required: true,
            },
            language: {
                type: String,
                required: true,
            },
            source: {
                type: String,
                required: true,
            },
        },

        content: {
            raw_text: {
                type: String,
                required: true,
            },
        },

        status: {
            type: String,
            enum: ["pending", "processing", "completed", "failed"],
            default: "pending",
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