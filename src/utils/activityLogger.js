import ActivityLog from "../models/ActivityLog.js";

export async function logAdminAction(adminId, action, targetType, targetId = null, details = null) {
  try {
    await ActivityLog.create({
      action,
      performedBy: adminId,
      targetType,
      targetId,
      details,
    });
  } catch (err) {
    console.error("Failed to log admin action:", err.message);
  }
}
