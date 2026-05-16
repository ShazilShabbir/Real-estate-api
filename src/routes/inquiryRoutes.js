import { Router } from "express";
import { createInquiry } from "../controllers/inquiryController.js";

const router = Router();

router.post("/contact", createInquiry);

export default router;
