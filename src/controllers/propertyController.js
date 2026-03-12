import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import Property from "../models/Property.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();



// Create a property
const createProperty = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    price,
    currency,
    bedrooms,
    bathrooms,
    area,
    propertyType,
    status,
    address,
    lat,
    lng,
    amenities,
    isFeatured,
  } = req.body;

  if (!title || !description || !price || !currency || !address) {
    throw new ApiError(400, "title, description, price, currency and address are required");
  }

  // parse address whether sent as JSON string (multipart/form-data) or object (application/json)
  let parsedAddress;
  if (address) {
    if (typeof address === "string") {
      try {
        parsedAddress = JSON.parse(address);
      } catch (err) {
        parsedAddress = undefined;
      }
    } else {
      parsedAddress = address;
    }
  }

  // handle images and videos (multer)
  // req.files can be an array (multiple single-field uploads) or an object when using upload.fields  
  const allFiles = [];
  if (Array.isArray(req.files)) {
    allFiles.push(...req.files);
  } else if (req.files && typeof req.files === "object") {
    // object with arrays: { images: [...], videos: [...] }
    Object.values(req.files).forEach((v) => {
      if (Array.isArray(v)) allFiles.push(...v);
    });
  }

  const images = [];
  const videos = [];
  for (const file of allFiles) {
    if (!file || !file.path) continue;
    try {
      const uploaded = await uploadOnCloudinary(file.path);
      if (!uploaded) continue;
      const item = { url: uploaded.secure_url || uploaded.url, public_id: uploaded.public_id };
      if (file.fieldname === "videos" || (file.mimetype && file.mimetype.startsWith("video/"))) {
        videos.push(item);
      } else {
        images.push(item);
      }
    } catch (err) {
      // continue on upload error for individual files
      console.error("Error uploading file:", err);
    }
  }

  const location = lat && lng ? { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] } : undefined;

  const doc = {
    title,
    description,
    price: parseFloat(price),
    currency: currency || "USD",
    bedrooms: bedrooms ? parseInt(bedrooms, 10) : 0,
    bathrooms: bathrooms ? parseInt(bathrooms, 10) : 0,
    area: area ? parseFloat(area) : 0,
    propertyType: propertyType || "house",
    status: status || "available",
    address: parsedAddress,
    location,
    images,
    videos,
    amenities: amenities ? (typeof amenities === "string" ? amenities.split(",").map((a) => a.trim()) : amenities) : [],
    postedBy: req.user?._id,
    isFeatured: isFeatured === "true" || isFeatured === true,
  };

  const property = await Property.create(doc);

  return res.status(201).json(new ApiResponse(201, property, "Property created"));
});

// Get properties with filtering, search and pagination
const getProperties = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.max(parseInt(req.query.limit || "10", 10), 1);
  const skip = (page - 1) * limit;

  const {
    q,
    minPrice,
    maxPrice,
    city,
    state,
    propertyType,
    bedrooms,
    bathrooms,
    sort,
  } = req.query;

  const filter = {};
  if (q) filter.$text = { $search: q };
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = parseFloat(minPrice);
    if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
  }
  if (city) filter["address.city"] = city;
  if (state) filter["address.state"] = state;
  if (propertyType) filter.propertyType = propertyType;
  if (bedrooms) filter.bedrooms = { $gte: parseInt(bedrooms, 10) };
  if (bathrooms) filter.bathrooms = { $gte: parseInt(bathrooms, 10) };

  let sortObj = { createdAt: -1 };
  if (sort === "price_asc") sortObj = { price: 1 };
  if (sort === "price_desc") sortObj = { price: -1 };
  if (sort === "oldest") sortObj = { createdAt: 1 };

  const total = await Property.countDocuments(filter);
  const properties = await Property.find(filter)
    .sort(sortObj)
    .skip(skip)
    .limit(limit)
    .populate("postedBy", "username email avatar")
    .exec();

  return res
    .status(200)
    .json(new ApiResponse(200, { properties, page, limit, total }, "Properties fetched"));
});



// Get single property
const getPropertyById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid property id");
  const property = await Property.findById(id).populate("postedBy", "username email avatar");
  if (!property) throw new ApiError(404, "Property not found");

  // increment views
  property.views = (property.views || 0) + 1;
  await property.save();

  return res.status(200).json(new ApiResponse(200, property, "Property fetched"));
});

// Update property (owner or admin)
const updateProperty = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid property id");
  const property = await Property.findById(id);
  if (!property) throw new ApiError(404, "Property not found");

  // permission
  if (String(property.postedBy) !== String(req.user?._id) && req.user?.role !== "admin") {
    throw new ApiError(403, "Forbidden");
  }

  const updates = { ...req.body };

  // if address provided as JSON string in multipart/form-data, parse it
  if (updates.address && typeof updates.address === "string") {
    try {
      updates.address = JSON.parse(updates.address);
    } catch (err) {
      // keep as-is if parsing fails
    }
  }

  // handle location if provided
  if (updates.lat && updates.lng) {
    updates.location = { type: "Point", coordinates: [parseFloat(updates.lng), parseFloat(updates.lat)] };
  }

  // handle images - if req.files.images provided and replaceImages flag true, replace; otherwise append
  // handle images and videos from multer uploads
  const _allFiles = [];
  if (Array.isArray(req.files)) {
    _allFiles.push(...req.files);
  } else if (req.files && typeof req.files === "object") {
    Object.values(req.files).forEach((v) => {
      if (Array.isArray(v)) _allFiles.push(...v);
    });
  }

  const newImages = [];
  const newVideos = [];
  for (const file of _allFiles) {
    if (!file || !file.path) continue;
    try {
      const uploaded = await uploadOnCloudinary(file.path);
      if (!uploaded) continue;
      const item = { url: uploaded.secure_url || uploaded.url, public_id: uploaded.public_id };
      if (file.fieldname === "videos" || (file.mimetype && file.mimetype.startsWith("video/"))) {
        newVideos.push(item);
      } else {
        newImages.push(item);
      }
    } catch (err) {
      // ignore individual upload errors
    }
  }

  if (newImages.length) {
    if (req.body.replaceImages === "true" || req.body.replaceImages === true) {
      updates.images = newImages;
    } else {
      updates.images = [...(property.images || []), ...newImages];
    }
  }

  if (newVideos.length) {
    if (req.body.replaceVideos === "true" || req.body.replaceVideos === true) {
      updates.videos = newVideos;
    } else {
      updates.videos = [...(property.videos || []), ...newVideos];
    }
  }

  // safer update: avoid overwriting sensitive fields and use mongoose .set()
  const allowedKeys = [
    "title",
    "description",
    "price",
    "currency",
    "bedrooms",
    "bathrooms",
    "area",
    "propertyType",
    "status",
    "address",
    "amenities",
    "isFeatured",
    "location"
  ];

  const filteredUpdates = {};
  allowedKeys.forEach((key) => {
    if (updates[key] !== undefined) {
      filteredUpdates[key] = updates[key];
    }
  });

  if (updates.images) filteredUpdates.images = updates.images;
  if (updates.videos) filteredUpdates.videos = updates.videos;

  property.set(filteredUpdates);
  await property.save();

  return res.status(200).json(new ApiResponse(200, property, "Property updated"));
});

// Delete property (owner or admin)
const deleteProperty = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid property id");
  const property = await Property.findById(id);
  if (!property) throw new ApiError(404, "Property not found");

  if (String(property.postedBy) !== String(req.user?._id) && req.user?.role !== "admin") {
    throw new ApiError(403, "Forbidden");
  }

  await property.deleteOne();
  return res.status(200).json(new ApiResponse(200, {}, "Property deleted"));
});

// Get nearby properties (lat,lng in query, radius in km)
const getNearbyProperties = asyncHandler(async (req, res) => {
  const { lat, lng, radius = 10, limit = 20 } = req.query;
  if (!lat || !lng) throw new ApiError(400, "lat and lng are required");
  const meters = parseFloat(radius) * 1000;
  const props = await Property.find({
    location: {
      $nearSphere: {
        $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
        $maxDistance: meters,
      },
    },
  })
    .limit(parseInt(limit, 10))
    .populate("postedBy", "username avatar email");

  return res.status(200).json(new ApiResponse(200, props, "Nearby properties"));
});

// Toggle like
const toggleLike = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid property id");
  const property = await Property.findById(id);
  if (!property) throw new ApiError(404, "Property not found");

  const userId = req.user?._id;
  const exists = property.likes?.some((l) => String(l) === String(userId));
  if (exists) {
    property.likes = property.likes.filter((l) => String(l) !== String(userId));
  } else {
    property.likes = property.likes || [];
    property.likes.push(userId);
  }

  await property.save();
  return res.status(200).json(new ApiResponse(200, property, "Toggled like"));
});

export {
  createProperty,
  getProperties,
  // cursor based pagination,
  getPropertyById,
  updateProperty,
  deleteProperty,
  getNearbyProperties,
  toggleLike,
};
