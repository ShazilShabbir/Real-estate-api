import mongoose from "mongoose";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import ActivityLog from "../models/ActivityLog.js";
import Setting from "../models/Setting.js";
import EmailLog from "../models/EmailLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { logAdminAction } from "../utils/activityLogger.js";
import { sendEmail, buildEmailTemplate } from "../utils/emailService.js";

// ──────────────────────────────────────────────
// DASHBOARD STATS
// ──────────────────────────────────────────────
export const getDashboardStats = asyncHandler(async (req, res) => {
  const [totalProperties, totalUsers, totalAgents, totalInquiries, viewsResult, statusCounts, recentUsers, recentProperties, pendingApprovals, pendingApplications] =
    await Promise.all([
      Property.countDocuments(),
      User.countDocuments(),
      User.countDocuments({ role: "agent" }),
      Inquiry.countDocuments(),
      Property.aggregate([{ $group: { _id: null, total: { $sum: "$views" } } }]),
      Property.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
      Property.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
      Property.countDocuments({ approved: false }),
      User.countDocuments({ "agentApplication.status": "pending" }),
    ]);

  const totalViews = viewsResult[0]?.total || 0;
  const statusMap = {};
  statusCounts.forEach((s) => { statusMap[s._id] = s.count; });

  const recentActivity = await ActivityLog.find()
    .sort({ createdAt: -1 })
    .limit(8)
    .populate("performedBy", "username avatar")
    .lean();

  const stats = {
    totalProperties,
    totalUsers,
    totalAgents,
    totalInquiries,
    totalViews,
    newUsersThisWeek: recentUsers,
    newPropertiesThisWeek: recentProperties,
    pendingApprovals,
    pendingAgentApplications: pendingApplications,
    statusBreakdown: statusMap,
    recentActivity,
  };

  res.status(200).json(new ApiResponse(200, stats, "Dashboard stats fetched"));
});

// ──────────────────────────────────────────────
// USER MANAGEMENT
// ──────────────────────────────────────────────
export const getUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const role = req.query.role || "";

  const filter = {};
  if (role && ["user", "agent", "admin"].includes(role)) {
    filter.role = role;
  }
  if (search) {
    filter.$or = [
      { username: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("-password -refreshToken")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  const userIds = users.map((u) => u._id);
  const propertyCounts = await Property.aggregate([
    { $match: { postedBy: { $in: userIds } } },
    { $group: { _id: "$postedBy", count: { $sum: 1 } } },
  ]);
  const countMap = {};
  propertyCounts.forEach((p) => { countMap[p._id.toString()] = p.count; });
  const enriched = users.map((u) => ({
    ...u,
    propertyCount: countMap[u._id.toString()] || 0,
  }));

  res.status(200).json(
    new ApiResponse(200, { users: enriched, total, page, limit, totalPages: Math.ceil(total / limit) }, "Users fetched")
  );
});

export const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid user ID");

  const user = await User.findById(id).select("-password -refreshToken").lean();
  if (!user) throw new ApiError(404, "User not found");

  const propertyCount = await Property.countDocuments({ postedBy: id });
  const properties = await Property.find({ postedBy: id })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("title price status propertyType isFeatured approved views createdAt")
    .lean();

  res.status(200).json(new ApiResponse(200, { ...user, propertyCount, properties }, "User fetched"));
});

export const updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid user ID");
  if (!["user", "agent", "admin"].includes(role)) throw new ApiError(400, "Invalid role");

  if (id === req.user._id.toString()) throw new ApiError(400, "Cannot change your own role");

  const user = await User.findByIdAndUpdate(id, { role }, { new: true })
    .select("-password -refreshToken");
  if (!user) throw new ApiError(404, "User not found");

  await logAdminAction(req.user._id, `Changed user role to ${role}`, "user", id, { previousRole: user.role, newRole: role });

  res.status(200).json(new ApiResponse(200, user, "User role updated"));
});

export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid user ID");
  if (id === req.user._id.toString()) throw new ApiError(400, "Cannot delete your own account");

  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "User not found");

  const propertyCount = await Property.countDocuments({ postedBy: id });
  if (propertyCount > 0) {
    await Property.deleteMany({ postedBy: id });
  }

  await User.findByIdAndDelete(id);
  await logAdminAction(req.user._id, "Deleted user", "user", id, { username: user.username, email: user.email, propertiesDeleted: propertyCount });

  res.status(200).json(new ApiResponse(200, null, "User and their properties deleted"));
});

// ──────────────────────────────────────────────
// AGENT APPLICATION MANAGEMENT
// ──────────────────────────────────────────────
export const getAgentApplications = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const status = req.query.status || "pending";

  const filter = { "agentApplication.status": status };

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("-password -refreshToken")
      .sort({ "agentApplication.appliedAt": -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  res.status(200).json(
    new ApiResponse(200, { users, total, page, limit, totalPages: Math.ceil(total / limit) }, "Agent applications fetched")
  );
});

export const handleAgentApplication = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // "approve" or "reject"

  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid user ID");
  if (!["approve", "reject"].includes(action)) throw new ApiError(400, "Action must be 'approve' or 'reject'");

  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "User not found");
  if (user.agentApplication?.status !== "pending") throw new ApiError(400, "No pending application");

  if (action === "approve") {
    user.role = "agent";
    user.agentApplication.status = "approved";
  } else {
    user.agentApplication.status = "rejected";
  }
  await user.save({ validateBeforeSave: false });

  await logAdminAction(req.user._id, `${action}d agent application`, "agent_application", id, {
    username: user.username,
    email: user.email,
    action,
  });

  // Email notification
  if (user.email) {
    const title = action === "approve" ? "Agent Application Approved" : "Agent Application Update";
    const body = action === "approve"
      ? `<p>Congratulations <strong>${user.username}</strong>!</p><p>Your agent application has been approved. You can now list properties on EstateHub.</p><p><a href="${process.env.CORS_ORIGIN || "http://localhost:3000"}/create-property" style="display: inline-block; background: #d97706; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; margin-top: 8px;">List Your First Property</a></p>`
      : `<p>Dear <strong>${user.username}</strong>,</p><p>Your agent application has been reviewed and unfortunately was not approved at this time.</p><p>You are welcome to apply again in the future.</p>`;
    sendEmail({ to: user.email, subject: title, html: buildEmailTemplate(title, body) }).catch(() => {});
  }

  res.status(200).json(new ApiResponse(200, user, `Agent application ${action}d`));
});

// ──────────────────────────────────────────────
// PROPERTY MANAGEMENT
// ──────────────────────────────────────────────
export const getAllProperties = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.approved === "true") filter.approved = true;
  if (req.query.approved === "false") filter.approved = false;
  if (req.query.status && ["available", "sold", "pending", "rented"].includes(req.query.status)) {
    filter.status = req.query.status;
  }
  if (req.query.propertyType && ["house", "apartment", "villa", "condo", "land", "townhouse", "commercial", "other"].includes(req.query.propertyType)) {
    filter.propertyType = req.query.propertyType;
  }
  if (req.query.featured === "true") filter.isFeatured = true;
  if (req.query.featured === "false") filter.isFeatured = false;
  if (req.query.postedBy && mongoose.Types.ObjectId.isValid(req.query.postedBy)) {
    filter.postedBy = new mongoose.Types.ObjectId(req.query.postedBy);
  }
  if (req.query.q) {
    filter.$or = [
      { title: { $regex: req.query.q, $options: "i" } },
      { "address.city": { $regex: req.query.q, $options: "i" } },
      { "address.state": { $regex: req.query.q, $options: "i" } },
    ];
  }
  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
  }

  const [properties, total] = await Promise.all([
    Property.find(filter)
      .populate("postedBy", "username email avatar")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Property.countDocuments(filter),
  ]);

  res.status(200).json(
    new ApiResponse(200, { properties, total, page, limit, totalPages: Math.ceil(total / limit) }, "Properties fetched")
  );
});

export const approveProperty = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid property ID");

  const property = await Property.findByIdAndUpdate(id, { approved: true, status: "available" }, { new: true }).populate("postedBy", "email username");
  if (!property) throw new ApiError(404, "Property not found");

  await logAdminAction(req.user._id, "Approved property", "property", id, { title: property.title });

  if (property.postedBy?.email) {
    const title = "Property Approved";
    const body = `<p>Hi <strong>${property.postedBy.username}</strong>,</p><p>Your property "<strong>${property.title}</strong>" has been approved and is now live on EstateHub.</p><p><a href="${process.env.CORS_ORIGIN || "http://localhost:3000"}/properties/${id}" style="display: inline-block; background: #d97706; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; margin-top: 8px;">View Property</a></p>`;
    sendEmail({ to: property.postedBy.email, subject: title, html: buildEmailTemplate(title, body) }).catch(() => {});
  }

  res.status(200).json(new ApiResponse(200, property, "Property approved"));
});

export const rejectProperty = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid property ID");

  const property = await Property.findByIdAndUpdate(id, { approved: false, status: "pending" }, { new: true }).populate("postedBy", "email username");
  if (!property) throw new ApiError(404, "Property not found");

  await logAdminAction(req.user._id, "Rejected property", "property", id, { title: property.title });

  if (property.postedBy?.email) {
    const title = "Property Status Update";
    const body = `<p>Hi <strong>${property.postedBy.username}</strong>,</p><p>Your property "<strong>${property.title}</strong>" has been reviewed and was not approved at this time.</p><p>Please check the property details and make any necessary adjustments before resubmitting.</p>`;
    sendEmail({ to: property.postedBy.email, subject: title, html: buildEmailTemplate(title, body) }).catch(() => {});
  }

  res.status(200).json(new ApiResponse(200, property, "Property rejected"));
});

export const toggleFeatureProperty = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid property ID");

  const property = await Property.findById(id);
  if (!property) throw new ApiError(404, "Property not found");

  // Check featured_property_limit when featuring
  if (!property.isFeatured) {
    const limitSetting = await Setting.findOne({ key: "featured_property_limit" }).lean();
    const limit = parseInt(limitSetting?.value) || 10;
    const currentFeatured = await Property.countDocuments({ isFeatured: true });
    if (currentFeatured >= limit) {
      throw new ApiError(400, `Featured property limit (${limit}) reached. Unfeature another property first.`);
    }
  }

  property.isFeatured = !property.isFeatured;
  await property.save();

  await logAdminAction(req.user._id, `Property ${property.isFeatured ? "featured" : "unfeatured"}`, "property", id, { title: property.title });

  res.status(200).json(new ApiResponse(200, property, `Property ${property.isFeatured ? "featured" : "unfeatured"}`));
});

export const togglePropertyStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid property ID");
  if (!["available", "sold", "pending", "rented"].includes(status)) throw new ApiError(400, "Invalid status");

  const property = await Property.findByIdAndUpdate(id, { status }, { new: true });
  if (!property) throw new ApiError(404, "Property not found");

  await logAdminAction(req.user._id, `Changed property status to ${status}`, "property", id, { title: property.title, newStatus: status });

  res.status(200).json(new ApiResponse(200, property, "Property status updated"));
});

export const adminDeleteProperty = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid property ID");

  const property = await Property.findByIdAndDelete(id);
  if (!property) throw new ApiError(404, "Property not found");

  await logAdminAction(req.user._id, "Deleted property", "property", id, { title: property.title });

  res.status(200).json(new ApiResponse(200, null, "Property deleted by admin"));
});

// ──────────────────────────────────────────────
// BULK ACTIONS
// ──────────────────────────────────────────────
export const bulkPropertyAction = asyncHandler(async (req, res) => {
  const { action, ids, ...data } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) throw new ApiError(400, "ids must be a non-empty array");
  if (!["delete", "feature", "unfeature", "status", "approve", "reject"].includes(action)) throw new ApiError(400, "Invalid action");

  const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validIds.length === 0) throw new ApiError(400, "No valid IDs provided");

  let update = {};
  let result;

  switch (action) {
    case "delete":
      result = await Property.deleteMany({ _id: { $in: validIds } });
      await logAdminAction(req.user._id, `Bulk deleted ${result.deletedCount} properties`, "property", null, { count: result.deletedCount });
      break;
    case "feature":
      const limitSetting = await Setting.findOne({ key: "featured_property_limit" }).lean();
      const limitVal = parseInt(limitSetting?.value) || 10;
      const currentFeatured = await Property.countDocuments({ isFeatured: true });
      const slotsAvailable = Math.max(0, limitVal - currentFeatured);
      if (slotsAvailable === 0) throw new ApiError(400, `Featured property limit (${limitVal}) reached. Unfeature properties first.`);
      const featureIds = validIds.slice(0, slotsAvailable);
      result = await Property.updateMany({ _id: { $in: featureIds } }, { isFeatured: true });
      await logAdminAction(req.user._id, `Bulk featured ${result.modifiedCount} properties`, "property", null, { count: result.modifiedCount, limit: limitVal, slotsAvailable });
      break;
    case "unfeature":
      update = { isFeatured: false };
      result = await Property.updateMany({ _id: { $in: validIds } }, update);
      break;
    case "status":
      if (!data.status || !["available", "sold", "pending", "rented"].includes(data.status)) throw new ApiError(400, "Invalid status");
      result = await Property.updateMany({ _id: { $in: validIds } }, { status: data.status });
      await logAdminAction(req.user._id, `Bulk status change to ${data.status}`, "property", null, { count: result.modifiedCount, status: data.status });
      break;
    case "approve":
      result = await Property.updateMany({ _id: { $in: validIds } }, { approved: true, status: "available" });
      await logAdminAction(req.user._id, `Bulk approved ${result.modifiedCount} properties`, "property", null, { count: result.modifiedCount });
      break;
    case "reject":
      result = await Property.updateMany({ _id: { $in: validIds } }, { approved: false, status: "pending" });
      break;
  }

  res.status(200).json(new ApiResponse(200, { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }, "Bulk action completed"));
});

// ──────────────────────────────────────────────
// CSV EXPORT
// ──────────────────────────────────────────────
const toCSV = (headers, rows) => {
  const headerRow = headers.map((h) => `"${h}"`).join(",");
  const dataRows = rows.map((row) =>
    headers.map((h) => {
      const val = row[h] !== undefined ? String(row[h]).replace(/"/g, '""') : "";
      return `"${val}"`;
    }).join(",")
  );
  return [headerRow, ...dataRows].join("\n");
};

export const exportPropertiesCSV = asyncHandler(async (req, res) => {
  const properties = await Property.find()
    .populate("postedBy", "username email")
    .sort({ createdAt: -1 })
    .lean();

  const rows = properties.map((p) => ({
    ID: p._id,
    Title: p.title,
    Price: p.price,
    Currency: p.currency,
    Type: p.propertyType,
    Status: p.status,
    Bedrooms: p.bedrooms,
    Bathrooms: p.bathrooms,
    Area: p.area,
    City: p.address?.city || "",
    State: p.address?.state || "",
    Country: p.address?.country || "",
    Featured: p.isFeatured ? "Yes" : "No",
    Approved: p.approved ? "Yes" : "No",
    Views: p.views,
    Agent: p.postedBy?.username || "",
    "Agent Email": p.postedBy?.email || "",
    Created: new Date(p.createdAt).toISOString(),
  }));

  const csv = toCSV(Object.keys(rows[0] || {}), rows);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=properties.csv");
  res.status(200).send(csv);
});

export const exportUsersCSV = asyncHandler(async (req, res) => {
  const users = await User.find().select("-password -refreshToken").sort({ createdAt: -1 }).lean();

  const rows = users.map((u) => ({
    ID: u._id,
    Username: u.username,
    Email: u.email,
    Role: u.role,
    Provider: u.provider,
    "Agent Status": u.agentApplication?.status || "none",
    Phone: u.phone || "",
    Created: new Date(u.createdAt).toISOString(),
  }));

  const csv = toCSV(Object.keys(rows[0] || {}), rows);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=users.csv");
  res.status(200).send(csv);
});

export const exportInquiriesCSV = asyncHandler(async (req, res) => {
  const inquiries = await Inquiry.find().populate("propertyId", "title").sort({ createdAt: -1 }).lean();

  const rows = inquiries.map((i) => ({
    ID: i._id,
    Name: i.name,
    Email: i.email,
    Phone: i.phone || "",
    Message: i.message,
    Status: i.status,
    Property: i.propertyId?.title || "",
    Created: new Date(i.createdAt).toISOString(),
  }));

  const csv = toCSV(Object.keys(rows[0] || {}), rows);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=inquiries.csv");
  res.status(200).send(csv);
});

// ──────────────────────────────────────────────
// CSV IMPORT
// ──────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length && values.some((v) => v)) {
      const row = {};
      headers.forEach((h, idx) => { row[h.trim().toLowerCase()] = values[idx]; });
      rows.push(row);
    }
  }
  return { headers, rows };
}

import fs from "fs";
import path from "path";
import { upload } from "../middleware/multerMiddleware.js";

export const importPropertiesCSV = [
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, "CSV file is required");
    if (!req.file.originalname.endsWith(".csv")) {
      fs.unlinkSync(req.file.path);
      throw new ApiError(400, "Only .csv files are accepted");
    }

    const text = fs.readFileSync(req.file.path, "utf-8");
    fs.unlinkSync(req.file.path); // cleanup

    const { headers, rows } = parseCSV(text);
    if (!headers.includes("title") || !headers.includes("price")) {
      throw new ApiError(400, "CSV must include at least 'title' and 'price' columns");
    }

    const VALID_TYPES = ["house", "apartment", "villa", "condo", "land", "townhouse", "commercial", "other"];
    const VALID_STATUSES = ["available", "sold", "pending", "rented"];
    const created = [];
    const errors = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const rowNum = idx + 2; // +2 for header row + 1-indexed

      try {
        if (!r.title) { errors.push({ row: rowNum, error: "Missing title" }); continue; }
        const price = parseFloat(r.price);
        if (isNaN(price) || price <= 0) { errors.push({ row: rowNum, error: `Invalid price: "${r.price}"` }); continue; }

        const propertyType = r.propertytype && VALID_TYPES.includes(r.propertytype) ? r.propertytype : "house";
        const status = r.status && VALID_STATUSES.includes(r.status) ? r.status : "available";
        const bedrooms = parseInt(r.bedrooms) || 0;
        const bathrooms = parseInt(r.bathrooms) || 0;
        const area = parseFloat(r.area) || 0;
        const isFeatured = r.isfeatured === "true" || r.isfeatured === "yes";
        const approved = r.approved === "true" || r.approved === "yes";

        const amenities = r.amenities ? r.amenities.split("|").map((a) => a.trim()).filter(Boolean) : [];
        const lat = parseFloat(r.latitude);
        const lng = parseFloat(r.longitude);
        const location = !isNaN(lat) && !isNaN(lng) ? { type: "Point", coordinates: [lng, lat] } : undefined;

        const propertyData = {
          title: r.title,
          description: r.description || r.title,
          price,
          currency: r.currency || "USD",
          bedrooms,
          bathrooms,
          area,
          propertyType,
          status,
          isFeatured,
          approved,
          amenities,
          postedBy: req.user._id,
          address: {
            street: r.street || "",
            city: r.city || "",
            state: r.state || "",
            zipcode: r.zipcode || r.postalcode || "",
            country: r.country || "USA",
          },
        };

        if (location) propertyData.location = location;

        const property = await Property.create(propertyData);
        created.push({ row: rowNum, id: property._id, title: property.title });
      } catch (err) {
        errors.push({ row: rowNum, error: err.message });
      }
    }

    await logAdminAction(req.user._id, `Imported ${created.length} properties from CSV`, "property", null, {
      total: rows.length,
      created: created.length,
      errors: errors.length,
    });

    res.status(201).json(new ApiResponse(201, { created, errors, total: rows.length }, `Imported ${created.length} of ${rows.length} properties`));
  }),
];

// ──────────────────────────────────────────────
// ANALYTICS
// ──────────────────────────────────────────────
export const getAnalytics = asyncHandler(async (req, res) => {
  const monthsBack = parseInt(req.query.months) || 12;

  const sinceDate = new Date();
  sinceDate.setMonth(sinceDate.getMonth() - monthsBack);

  const [propertyTrend, userTrend, typeDistribution, cityDistribution] = await Promise.all([
    Property.aggregate([
      { $match: { createdAt: { $gte: sinceDate } } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
    User.aggregate([
      { $match: { createdAt: { $gte: sinceDate } } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
    Property.aggregate([
      { $group: { _id: "$propertyType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Property.aggregate([
      { $match: { "address.city": { $ne: null, $ne: "" } } },
      { $group: { _id: "$address.city", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
  ]);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const labelMap = {};
  propertyTrend.forEach((m) => { const k = `${monthNames[m._id.month - 1]} ${m._id.year}`; labelMap[k] = true; });
  userTrend.forEach((m) => { const k = `${monthNames[m._id.month - 1]} ${m._id.year}`; labelMap[k] = true; });

  const ptMap = {};
  propertyTrend.forEach((m) => { ptMap[`${monthNames[m._id.month - 1]} ${m._id.year}`] = m.count; });
  const utMap = {};
  userTrend.forEach((m) => { utMap[`${monthNames[m._id.month - 1]} ${m._id.year}`] = m.count; });

  const labels = Object.keys(labelMap).sort((a, b) => {
    const p = (s) => { const [m, y] = s.split(" "); return new Date(`${m} 1, ${y}`); };
    return p(a) - p(b);
  });

  const trend = labels.map((l) => ({ label: l, properties: ptMap[l] || 0, users: utMap[l] || 0 }));

  res.status(200).json(new ApiResponse(200, { trend, typeDistribution, cityDistribution }, "Analytics fetched"));
});

// ──────────────────────────────────────────────
// ACTIVITY LOG
// ──────────────────────────────────────────────
export const getActivityLog = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.action) filter.action = { $regex: req.query.action, $options: "i" };
  if (req.query.targetType) filter.targetType = req.query.targetType;

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("performedBy", "username avatar")
      .lean(),
    ActivityLog.countDocuments(filter),
  ]);

  res.status(200).json(
    new ApiResponse(200, { logs, total, page, limit, totalPages: Math.ceil(total / limit) }, "Activity log fetched")
  );
});

// ──────────────────────────────────────────────
// INQUIRY MANAGEMENT
// ──────────────────────────────────────────────
export const getInquiries = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const status = req.query.status || "";
  const search = req.query.search || "";

  const filter = {};
  if (status && ["new", "read", "replied", "archived"].includes(status)) {
    filter.status = status;
  }
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { message: { $regex: search, $options: "i" } },
    ];
  }

  const [inquiries, total] = await Promise.all([
    Inquiry.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("propertyId", "title")
      .lean(),
    Inquiry.countDocuments(filter),
  ]);

  res.status(200).json(
    new ApiResponse(200, { inquiries, total, page, limit, totalPages: Math.ceil(total / limit) }, "Inquiries fetched")
  );
});

export const updateInquiryStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid inquiry ID");
  if (!["new", "read", "replied", "archived"].includes(status)) throw new ApiError(400, "Invalid status");

  const inquiry = await Inquiry.findByIdAndUpdate(id, { status }, { new: true });
  if (!inquiry) throw new ApiError(404, "Inquiry not found");

  await logAdminAction(req.user._id, `Changed inquiry status to ${status}`, "inquiry", id);

  res.status(200).json(new ApiResponse(200, inquiry, "Inquiry status updated"));
});

export const deleteInquiry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid inquiry ID");

  const inquiry = await Inquiry.findByIdAndDelete(id);
  if (!inquiry) throw new ApiError(404, "Inquiry not found");

  await logAdminAction(req.user._id, "Deleted inquiry", "inquiry", id);

  res.status(200).json(new ApiResponse(200, null, "Inquiry deleted"));
});

// ──────────────────────────────────────────────
// SETTINGS
// ──────────────────────────────────────────────
const DEFAULT_SETTINGS = [
  { key: "site_name", value: "EstateHub", description: "Site name displayed in header and browser title", group: "general" },
  { key: "site_tagline", value: "Luxury Properties & Premium Real Estate", description: "Short site description", group: "general" },
  { key: "site_logo", value: "", description: "Logo image URL", group: "general" },
  { key: "default_currency", value: "USD", description: "Default currency for listings", group: "general" },
  { key: "contact_email", value: "info@estatehub.com", description: "Primary contact email", group: "contact" },
  { key: "contact_phone", value: "(555) 123-4567", description: "Primary contact phone", group: "contact" },
  { key: "contact_address", value: "123 Luxury Lane, Suite 500, New York, NY 10001", description: "Office address", group: "contact" },
  { key: "social_facebook", value: "", description: "Facebook page URL", group: "social" },
  { key: "social_twitter", value: "", description: "X (Twitter) profile URL", group: "social" },
  { key: "social_instagram", value: "", description: "Instagram profile URL", group: "social" },
  { key: "social_linkedin", value: "", description: "LinkedIn page URL", group: "social" },
  { key: "language", value: "en", description: "Default language code", group: "localization" },
  { key: "direction", value: "ltr", description: "Text direction (ltr or rtl)", group: "localization" },
  { key: "featured_property_limit", value: 10, description: "Maximum number of featured properties", group: "features" },
  { key: "auto_approve_properties", value: false, description: "Auto-approve new properties from agents", group: "features" },
];

export const getSettings = asyncHandler(async (req, res) => {
  let settings = await Setting.find().lean();

  if (settings.length === 0) {
    await Setting.insertMany(DEFAULT_SETTINGS);
    settings = await Setting.find().lean();
  } else {
    // Fill in any missing default keys (e.g. newly added defaults)
    const existingKeys = new Set(settings.map((s) => s.key));
    const missingDefaults = DEFAULT_SETTINGS.filter((d) => !existingKeys.has(d.key));
    if (missingDefaults.length > 0) {
      await Setting.insertMany(missingDefaults);
      settings = await Setting.find().lean();
    }
  }

  const map = {};
  settings.forEach((s) => { map[s.key] = s.value; });

  res.status(200).json(new ApiResponse(200, map, "Settings fetched"));
});

export const updateSettings = asyncHandler(async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== "object") throw new ApiError(400, "Body must be an object of key-value pairs");

  const keys = Object.keys(updates);
  if (keys.length === 0) throw new ApiError(400, "No settings provided");

  const ops = keys.map((key) => ({
    updateOne: {
      filter: { key },
      update: { $set: { key, value: updates[key] } },
      upsert: true,
    },
  }));

  await Setting.bulkWrite(ops);

  try {
    await logAdminAction(req.user._id, `Updated ${keys.length} settings`, "settings", null, { keys });
  } catch {
    console.warn("[settings] Failed to log admin action, but settings saved");
  }

  res.status(200).json(new ApiResponse(200, null, `${keys.length} settings updated`));
});

export const uploadLogo = [
  upload.single("logo"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, "Logo file is required");

    const uploadedLogo = await uploadOnCloudinary(req.file.path, "image");
    const url = uploadedLogo?.secure_url;

    if (!url) {
      throw new ApiError(500, "Logo upload failed");
    }

    await Setting.updateOne({ key: "site_logo" }, { $set: { key: "site_logo", value: url } }, { upsert: true });

    try {
      await logAdminAction(req.user._id, "Updated site logo", "settings", null, { url });
    } catch {
      console.warn("[uploadLogo] Failed to log admin action, but logo saved");
    }

    res.status(200).json(new ApiResponse(200, { url }, "Logo uploaded"));
  }),
];

// ──────────────────────────────────────────────
// SYSTEM HEALTH
// ──────────────────────────────────────────────
export const getSystemHealth = asyncHandler(async (req, res) => {
  const mongooseState = mongoose.connection.readyState;
  const stateMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };

  let dbStats = null;
  if (mongooseState === 1) {
    try {
      dbStats = await mongoose.connection.db.admin().serverStatus();
    } catch {
      // fallback
    }
  }

  res.status(200).json(new ApiResponse(200, {
    uptime: process.uptime(),
    nodeVersion: process.version,
    platform: process.platform,
    memoryUsage: process.memoryUsage(),
    mongoState: stateMap[mongooseState] || "unknown",
    mongoConnected: mongooseState === 1,
    timestamp: new Date().toISOString(),
  }, "System health fetched"));
});

// ──────────────────────────────────────────────
// PROPERTY ANALYTICS
// ──────────────────────────────────────────────
export const getPropertyAnalytics = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid property ID");

  const property = await Property.findById(id).select("title views propertyType status createdAt").lean();
  if (!property) throw new ApiError(404, "Property not found");

  const inquiryCount = await Inquiry.countDocuments({ propertyId: id });

  res.status(200).json(new ApiResponse(200, {
    property,
    inquiryCount,
  }, "Property analytics fetched"));
});

// ──────────────────────────────────────────────
// EMAIL LOG
// ──────────────────────────────────────────────
export const getEmailLog = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status && ["sent", "failed", "skipped"].includes(req.query.status)) {
    filter.status = req.query.status;
  }
  if (req.query.search) {
    filter.$or = [
      { to: { $regex: req.query.search, $options: "i" } },
      { subject: { $regex: req.query.search, $options: "i" } },
    ];
  }

  const [logs, total] = await Promise.all([
    EmailLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    EmailLog.countDocuments(filter),
  ]);

  res.status(200).json(
    new ApiResponse(200, { logs, total, page, limit, totalPages: Math.ceil(total / limit) }, "Email log fetched")
  );
});
