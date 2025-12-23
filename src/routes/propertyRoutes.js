import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import {
  createProperty,
  getProperties,
  getPropertiesCursor,
  getPropertyById,
  updateProperty,
  deleteProperty,
  getNearbyProperties,
  toggleLike,
} from "../controllers/propertyController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// ensure temp upload folder exists (uses existing public/temp directory)
const tempDir = path.join(process.cwd(), "public", "temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// use disk storage so files have a `path` for Cloudinary upload helper
const upload = multer({ dest: tempDir });

// Public
router.get("/", getProperties);
router.get("/cursor", getPropertiesCursor);
router.get("/nearby", getNearbyProperties);
router.get("/:id", getPropertyById);

// Protected - require authentication
router.post(
  "/create",
  authMiddleware,
  upload.fields([{ name: "images", maxCount: 10 }]),
  createProperty
);
router.put(
  "/:id",
  authMiddleware,
  upload.fields([{ name: "images", maxCount: 10 }]),
  updateProperty
);
router.delete("/:id", authMiddleware, deleteProperty);
router.post("/:id/like", authMiddleware, toggleLike);

export default router;
