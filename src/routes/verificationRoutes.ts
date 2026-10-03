import { Router } from "express";

import {
    submitVerification,
    getVerification,
    updateVerificationStatus,
} from "../controllers/verificationController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = Router();


router.post("/submit", protect, submitVerification);


router.get("/:id", protect, getVerification);


router.patch("/:id/status", protect, updateVerificationStatus);

export default router;