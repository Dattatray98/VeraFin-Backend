import { Router } from "express";

import {
    registerUser,
    loginUser,
    getUser,
    getProfile,
} from "../controllers/userController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = Router();


router.post("/register", registerUser);

router.post("/login", loginUser);


router.get("/profile", protect, getProfile);

router.get("/:id", getUser);

export default router;