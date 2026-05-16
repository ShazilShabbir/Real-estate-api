import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import {
  getDashboardStats,
  getUsers,
  getUserById,
  updateUserRole,
  deleteUser,
  getAgentApplications,
  handleAgentApplication,
  getAllProperties,
  approveProperty,
  rejectProperty,
  toggleFeatureProperty,
  togglePropertyStatus,
  adminDeleteProperty,
  bulkPropertyAction,
  exportPropertiesCSV,
  exportUsersCSV,
  exportInquiriesCSV,
  getAnalytics,
  getActivityLog,
  getInquiries,
  updateInquiryStatus,
  deleteInquiry,
  getSettings,
  updateSettings,
  uploadLogo,
  getSystemHealth,
  getPropertyAnalytics,
  getEmailLog,
  importPropertiesCSV,
} from "../controllers/adminController.js";

const router = Router();

// All admin routes require auth + admin role
router.use(authMiddleware, adminMiddleware);

// Dashboard
router.get("/stats", getDashboardStats);

// Activity Log
router.get("/activity-log", getActivityLog);

// Email Log
router.get("/email-log", getEmailLog);

// Users
router.get("/users", getUsers);
router.get("/users/export", exportUsersCSV);
router.get("/users/applications", getAgentApplications);
router.get("/users/:id", getUserById);
router.patch("/users/:id/role", updateUserRole);
router.patch("/users/:id/agent-application", handleAgentApplication);
router.delete("/users/:id", deleteUser);

// Properties
router.get("/properties", getAllProperties);
router.get("/properties/export", exportPropertiesCSV);
router.post("/properties/import", importPropertiesCSV);
router.post("/properties/bulk", bulkPropertyAction);
router.patch("/properties/:id/approve", approveProperty);
router.patch("/properties/:id/reject", rejectProperty);
router.patch("/properties/:id/feature", toggleFeatureProperty);
router.patch("/properties/:id/status", togglePropertyStatus);
router.delete("/properties/:id", adminDeleteProperty);

// Analytics
router.get("/analytics", getAnalytics);

// Inquiries
router.get("/inquiries", getInquiries);
router.get("/inquiries/export", exportInquiriesCSV);
router.patch("/inquiries/:id", updateInquiryStatus);
router.delete("/inquiries/:id", deleteInquiry);

// Settings
router.get("/settings", getSettings);
router.patch("/settings", updateSettings);
router.post("/settings/upload-logo", uploadLogo);

// System Health
router.get("/system-health", getSystemHealth);

// Property Analytics
router.get("/properties/:id/analytics", getPropertyAnalytics);

export default router;
