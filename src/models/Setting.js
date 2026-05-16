import mongoose from "mongoose";
const { Schema } = mongoose;

const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    description: { type: String, default: "" },
    group: { type: String, default: "general" },
  },
  { timestamps: true }
);

export default mongoose.models.Setting || mongoose.model("Setting", settingSchema);
