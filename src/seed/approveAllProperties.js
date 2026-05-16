import mongoose from "mongoose";
import { DB_NAME } from "../../constants.js";
import Property from "../models/Property.js";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

async function approveAll() {
  try {
    await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
    console.log("Connected to MongoDB");

    const result = await Property.updateMany(
      { approved: { $ne: true } },
      { $set: { approved: true } }
    );

    console.log(`Approved ${result.modifiedCount} properties`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

approveAll();
