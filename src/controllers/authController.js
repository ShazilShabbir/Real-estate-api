import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import User from "../models/User.js";   
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import Jwt from "jsonwebtoken";

const generateAccessAndRefereshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating referesh and access token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  //get user details from frontend
  //validation - not empty
  // check if already exist: username, email
  // check for image, check for avatar
  // upload them to cloudinary, avatar
  // create user object - create entry in db
  // remove password and refresh token field from response
  // check for user creation
  //return response
// console.log("REQ FILE:", req.file);
// console.log("REQ BODY:", req.body);
  //get user details from frontend
  const { username, email, phone, password } = req.body || {};
  //console.log("email:", email);

  //validation - not empty (phone is optional in model)
  if ([username, email, password].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }
  if (!email.includes("@")) {
    throw new ApiError(
      400,
      "Invalid email format. Email must contain '@' symbol"
    );
  }

  // check if already exist: username, email
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  // check for image, check for avatar (support multer single or multiple-file shapes)
  const avatarLocalPath = req.file?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }
  console.log("avatar ",avatarLocalPath);
  
  // upload them to cloudinary, avatar 
  const avatar = await uploadOnCloudinary(avatarLocalPath);


  // again check for avatar upload to cloudinary
 if (!avatar || !avatar.secure_url) {
    throw new ApiError(400, "Avatar upload failed");
  }

  // create user object - create entry in db
  const user = await User.create({
    username: username.toLowerCase(),
    avatar: avatar.secure_url,
    email,
    password,
    phone,
  });

  // check for user creation
  // remove password and refresh token field from response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered Successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // req body -> data
  // username or email
  //find the user
  //password check
  //access and referesh token
  //send cookie

  const { email, username, password } = req.body;
  console.log(email);

  if (!username && !email) {
    throw new ApiError(400, "username or email is required");
  }

  // Here is an alternative of above code based on logic discussed in video:
  // if (!(username || email)) {
  //     throw new ApiError(400, "username or email is required")

  // }

  const user = await User.findOne({ $or: [{ username }, { email }] }).select(
    "+password +refreshToken"
  );

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: false,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged In Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1, // this removes the field from document
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request");
  }

  try {
    const decodedToken = Jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh Token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefereshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Acess token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  try {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user?._id).select("+password");

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordCorrect) {
      throw new ApiError(400, "Invalid old password");
    }
    user.password = newPassword;
    await user.save({ validateBeforeSave: false });
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Password changed successfully"));
  } catch (error) {
    throw new ApiError(500, error?.message || "Something went wrong");
  }
});

const getCurrentUser = asyncHandler(async (req, res) => {
  console.log(req.user)
  res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { username, email, phone } = req.body;
  if (!username || !email) {
    throw new ApiError(400, "All fields are required");
  }
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        username: username.toLowerCase(),
        email,
        phone,
      },
    },
    { new: true }
  ).select("-password");

  return res.status(200).json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
try {
    const avatarLocalPath = req.file?.path;
    if (!avatarLocalPath) {
      throw new ApiError(400, "Avatar file is missing");
    }


   const avatar = await uploadOnCloudinary(avatarLocalPath);
    
    if (!avatar.url) {
      throw new ApiError(400, "Error while uploading on avatar");
    }
  
    const updatedAvatar = await User.findByIdAndUpdate(
      req.user?._id,
      {
        $set: {
          avatar: avatar.url,
        },
      },
      { new: true }
    ).select("-password");
  
    res
      .status(200)
      .json(new ApiResponse(200, updatedAvatar, "Avatar Updated successfully"));
} catch (error) {
    throw new ApiError(500, error?.message || "Something went wrong while updating avatar");
}
});


// OAuth callback handler used by passport routes
const oauthCallbackHandler = asyncHandler(async (req, res, next) => {
  try {
    const user = req.user;
    console.log("OAuth user:", user);
    
// check if user already exists
    const existingUser = await User.findById(user._id);
    if (existingUser) {
      // FIXED: Proper error handling
      return res.json({message: "User is already registered"}).redirect(`${process.env.CORS_ORIGIN}/login?error=oauth_failed`);
    }

    if (!user) {
      // FIXED: Proper error handling
      return res.redirect(`${process.env.CORS_ORIGIN}/login?error=oauth_failed`);
    }

    const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(user._id);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    // Set cookies
    res.cookie("accessToken", accessToken, cookieOptions);
    res.cookie("refreshToken", refreshToken, cookieOptions);

    // FIXED: Use CLIENT_REDIRECT_URL or CORS_ORIGIN
    const redirectUrl = process.env.CLIENT_REDIRECT_URL || process.env.CORS_ORIGIN || "http://localhost:3000";
    
    // Redirect to frontend
    return res.redirect(`${redirectUrl}/auth/success`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return res.redirect(`${process.env.CORS_ORIGIN}/login?error=token_generation_failed`);
  }
});




export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  // oauth callback handler for passport
  oauthCallbackHandler,
};


