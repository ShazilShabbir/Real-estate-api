import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import requireRole from "../middleware/roleMiddleware.js";
import { getAgentDashboardStats } from "../controllers/agentController.js";

const router = Router();

router.use(authMiddleware, requireRole("agent", "admin"));
router.get("/stats", getAgentDashboardStats);

export default router;
