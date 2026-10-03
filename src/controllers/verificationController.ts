import type { Request, Response } from "express";
import Verification from "../models/verificationModel.js";

// Submit content for verification
export const submitVerification = async (
    req: Request,
    res: Response
) => {
    try {
        const { type, language, source, raw_text } = req.body;

        if (!type || !language || !source || !raw_text) {
            return res.status(400).json({
                message:
                    "type, language, source and raw_text are required",
            });
        }

        if (!req.userId) {
            return res.status(401).json({
                message: "User authentication required",
            });
        }

        const verification = await Verification.create({
            userId: req.userId,

            input: {
                type,
                language,
                source,
            },

            content: {
                raw_text,
            },

            status: "pending",
        });

        return res.status(201).json({
            message: "Content submitted successfully",

            verification: {
                id: verification._id,
                status: verification.status,
                createdAt: verification.createdAt,
            },
        });
    } catch (error) {
        console.error("Verification submission error:", error);

        return res.status(500).json({
            message: "Server error",
        });
    }
};

// Get verification by ID
export const getVerification = async (
    req: Request,
    res: Response
) => {
    try {
        const { id } = req.params;

        if (!req.userId) {
            return res.status(401).json({
                message: "User authentication required",
            });
        }

        const verification = await Verification.findOne({
            _id: id,
            userId: req.userId,
        });

        if (!verification) {
            return res.status(404).json({
                message: "Verification not found",
            });
        }

        return res.status(200).json({
            verification,
        });
    } catch (error) {
        console.error("Get verification error:", error);

        return res.status(500).json({
            message: "Server error",
        });
    }
};

// Update verification status
export const updateVerificationStatus = async (
    req: Request,
    res: Response
) => {
    try {
        const { id } = req.params;
        const { status, result, error } = req.body;

        if (!req.userId) {
            return res.status(401).json({
                message: "User authentication required",
            });
        }

        const allowedStatuses = [
            "pending",
            "processing",
            "completed",
            "failed",
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                message: "Invalid verification status",
            });
        }

        const verification = await Verification.findOne({
            _id: id,
            userId: req.userId,
        });

        if (!verification) {
            return res.status(404).json({
                message: "Verification not found",
            });
        }

        verification.status = status;

        if (result !== undefined) {
            verification.result = result;
        }

        if (error !== undefined) {
            verification.error = error;
        }

        await verification.save();

        return res.status(200).json({
            message: "Verification status updated successfully",
            verification: {
                id: verification._id,
                status: verification.status,
                result: verification.result,
                error: verification.error,
            },
        });
    } catch (error) {
        console.error("Update verification status error:", error);

        return res.status(500).json({
            message: "Server error",
        });
    }
};