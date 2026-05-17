import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import connectDB from "./src/config/db.js";
import authRoutes from "./src/routes/authRoutes.js";
import propertyRoutes from "./src/routes/propertyRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import inquiryRoutes from "./src/routes/inquiryRoutes.js";
import publicRoutes from "./src/routes/publicRoutes.js";
import agentRoutes from "./src/routes/agentRoutes.js";
import passport from "passport";
import "./src/config/passport.js";
import cookieParser from "cookie-parser";
import errorMiddleware from "./src/middleware/errorMiddleware.js";

dotenv.config({
  path: "./.env",
});
const app = express();
app.set("trust proxy", 1);

const allowedOrigins = [
  process.env.CORS_ORIGIN,
  "http://localhost:3000",
  "https://real-estate-app-shazil.vercel.app",
  "https://real-estate-api-cyan.vercel.app",
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/uploads", express.static(path.resolve("public/uploads")));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health route for local + Vercel checks
app.get("/", (req, res) => {
  return res.status(200).json({ status: "ok", service: "backend" });
});
app.use(passport.initialize());

// Connect DB
connectDB().catch((err) => {
  console.error("MONGO db connection failed:", err);
});

if (process.env.NODE_ENV !== "production") {
  const port = process.env.PORT || 8000;
  const server = app.listen(port, () => {
    console.log(`Server running on ${port}`);
  });

  const shutdown = async () => {
    console.log("Shutting down gracefully...");
    server.close(async () => {
      const mongoose = (await import("mongoose")).default;
      await mongoose.connection.close();
      console.log("MongoDB connection closed");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// Request Logger (dev only)
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    console.log(`[Incoming Request] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/agent", agentRoutes);

// Catch-all 404 for unknown routes
app.use((req, res, next) => {
  console.log(`[404 Unknown Route] ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found on this server`,
  });
});

// Global Error Handler
app.use(errorMiddleware);

export default app;

 





