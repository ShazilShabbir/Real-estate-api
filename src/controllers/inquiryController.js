import Inquiry from "../models/Inquiry.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

export const createInquiry = asyncHandler(async (req, res) => {
  const { name, email, phone, message, propertyId } = req.body;
  if (!name || !email || !message) {
    throw new ApiError(400, "Name, email, and message are required");
  }

  const inquiry = await Inquiry.create({ name, email, phone, message, propertyId });

  res.status(201).json(new ApiResponse(201, inquiry, "Inquiry submitted successfully"));
});
