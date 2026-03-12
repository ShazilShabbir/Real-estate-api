import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./src/config/db.js";
import authRoutes from "./src/routes/authRoutes.js";
import propertyRoutes from "./src/routes/propertyRoutes.js";
import passport from "passport";
import "./src/config/passport.js";
import cookieParser from "cookie-parser";

dotenv.config({
  path: "./.env",
});
const app = express();
app.use(cors({ 
  origin: process.env.CORS_ORIGIN,
  credentials: true, // IMPORTANT: Allow cookies
}));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health route for local + Vercel checks
app.get("/", (req, res) => {
  return res.status(200).json({ status: "ok", service: "backend" });
});
app.use(passport.initialize());

// Connect DB and passport

connectDB().catch((err) => {
  console.error("MONGO db connection failed:", err);
});

if (process.env.NODE_ENV !== "production") {
  const port = process.env.PORT || 8000;
  app.listen(port, () => {
    console.log(`Server running on ${port}`);
  });
}

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/properties", propertyRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Something went wrong";
  let errors = err.errors || [];

  // Handle Mongoose Validation Errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = "Validation Error";
    errors = Object.values(err.errors).map(val => val.message);
    console.log("[Mongoose Validation Error]:", JSON.stringify(err.errors, null, 2));
  }

  // Handle Mongoose Cast Errors (Invalid ID)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  console.error(`[Error] ${statusCode} - ${message}`);
  if (err.stack && process.env.NODE_ENV !== 'production') {
    // console.error(err.stack); // Reduced noise
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors,
  });
});

export default app;

 





