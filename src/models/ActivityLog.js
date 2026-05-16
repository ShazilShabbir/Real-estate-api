import mongoose from "mongoose";
const { Schema } = mongoose;

const activityLogSchema = new Schema(
  {
    action: { type: String, required: true },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetType: { type: String, required: true, enum: ["user", "property", "inquiry", "agent_application", "settings", "system"] },
    targetId: { type: Schema.Types.ObjectId },
    details: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ action: 1 });
activityLogSchema.index({ targetType: 1 });

export default mongoose.models.ActivityLog || mongoose.model("ActivityLog", activityLogSchema);
