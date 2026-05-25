import { Router } from "express";
import { upload } from "../middleware/multerMiddleware.js";
import {
  createPropertyUploadSignature,
  createProperty,
  getProperties,
  getPropertyById,
  updateProperty,
  deleteProperty,
  getNearbyProperties,
  toggleLike,
  getCategoryCounts,
  getLocations,
} from "../controllers/propertyController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireRole from "../middleware/roleMiddleware.js";

const router = Router();

// Public
router.get("/categories", getCategoryCounts);
router.get("/locations", getLocations);
router.get("/", getProperties);
router.get("/nearby", getNearbyProperties);
router.post(
  "/upload-signature",
  authMiddleware,
  requireRole("agent", "admin"),
  createPropertyUploadSignature,
);
router.get("/:id", getPropertyById);

// Protected - require authentication
router.post(
  "/create",
  authMiddleware,
  requireRole("agent", "admin"),
  upload.fields([{ name: "images", maxCount: 5 },{ name: "videos", maxCount: 2 }]),
  createProperty
);
router.patch(
  "/:id",
  authMiddleware,
  upload.fields([{ name: "images", maxCount: 5 },{ name: "videos", maxCount: 2 }]),
  updateProperty
);
router.delete("/:id", authMiddleware, deleteProperty);
router.post("/:id/like", authMiddleware, toggleLike);

export default router;
