import mongoose from "mongoose";
const { Schema } = mongoose;

const emailLogSchema = new Schema(
  {
    to: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String },
    status: { type: String, enum: ["sent", "failed", "skipped"], default: "sent" },
    error: { type: String },
    messageId: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.EmailLog || mongoose.model("EmailLog", emailLogSchema);
