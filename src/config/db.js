import mongoose from "mongoose";
import { DB_NAME } from "../../constants.js";

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`
    );
    console.log(
      `\n MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`
    );
    // Drop old incorrect index on coordinates if it exists,
    // so the correct 2dsphere index on location is used
    try {
      await connectionInstance.connection.db
        .collection("properties")
        .dropIndex("location.coordinates_2dsphere");
      console.log("Dropped outdated coordinates index");
    } catch {
      // index didn't exist, that's fine
    }
    // Ensure schema indexes are created
    await connectionInstance.connection.syncIndexes();
    console.log("Indexes synced");
  } catch (error) { 
    console.log("MONGODB connection error ", error);
    process.exit(1);
  }
};
export default connectDB;