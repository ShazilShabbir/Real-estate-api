import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const DEFAULT_AVATAR_FOLDER = "real-estate/avatars";
const DEFAULT_PROPERTY_FOLDER = "real-estate/properties";

const uploadOnCloudinary = async (localFilePath, resourceType = "auto", folder = DEFAULT_AVATAR_FOLDER) => {
  try {
    if (!localFilePath) return null;
    const response = await cloudinary.uploader.upload(localFilePath, {
      folder,
      resource_type: resourceType,
    });

    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    return response;
  } catch (error) {
    console.error("Cloudinary FULL ERROR:", error);
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    return null;
  }
};

const createUploadSignature = ({ folder = DEFAULT_PROPERTY_FOLDER, resourceType = "image", timestamp }) => {
  const normalizedResourceType = resourceType === "video" ? "video" : "image";
  const uploadTimestamp = Number(timestamp) || Math.floor(Date.now() / 1000);
  const paramsToSign = {
    folder,
    timestamp: uploadTimestamp,
  };

  return {
    folder,
    timestamp: uploadTimestamp,
    resourceType: normalizedResourceType,
    signature: cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET,
    ),
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
  };
};

export { cloudinary, DEFAULT_PROPERTY_FOLDER, uploadOnCloudinary, createUploadSignature };
