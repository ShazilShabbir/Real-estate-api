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

// Simple health route for quick local debugging
// app.get("/", (req, res) => {
//   return res.status(200).json({ status: "ok", uptime: process.uptime() });
// });
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


 





