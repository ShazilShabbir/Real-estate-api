import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const getAgentDashboardStats = asyncHandler(async (req, res) => {
  const agentId = req.user._id;

  const [totalProperties, viewsResult, summaryCounts, recentProperties] = await Promise.all([
    Property.countDocuments({ postedBy: agentId }),
    Property.aggregate([
      { $match: { postedBy: agentId } },
      { $group: { _id: null, total: { $sum: "$views" } } },
    ]),
    Property.aggregate([
      { $match: { postedBy: agentId } },
      {
        $group: {
          _id: null,
          totalViews: { $sum: "$views" },
          featured: { $sum: { $cond: ["$isFeatured", 1, 0] } },
          approved: { $sum: { $cond: ["$approved", 1, 0] } },
          pendingApproval: { $sum: { $cond: [{ $eq: ["$approved", false] }, 1, 0] } },
          available: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
          sold: { $sum: { $cond: [{ $eq: ["$status", "sold"] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          rented: { $sum: { $cond: [{ $eq: ["$status", "rented"] }, 1, 0] } },
        },
      },
    ]),
    Property.find({ postedBy: agentId })
      .select("title price status propertyType isFeatured approved views createdAt")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  const agentPropertyIds = (await Property.find({ postedBy: agentId }).select("_id").lean()).map((p) => p._id);
  const totalInquiries = await Inquiry.countDocuments({ propertyId: { $in: agentPropertyIds } });

  const stats = summaryCounts[0] || {};
  const totalViews = stats.totalViews || 0;

  res.status(200).json(new ApiResponse(200, {
    totalProperties,
    totalViews,
    totalInquiries,
    featured: stats.featured || 0,
    approved: stats.approved || 0,
    pendingApproval: stats.pendingApproval || 0,
    statusBreakdown: {
      available: stats.available || 0,
      sold: stats.sold || 0,
      pending: stats.pending || 0,
      rented: stats.rented || 0,
    },
    recentProperties,
  }, "Agent dashboard stats fetched"));
});
