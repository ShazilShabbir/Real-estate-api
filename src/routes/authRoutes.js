import { Router } from "express";
import passport from "passport";
import { upload } from "../middleware/multerMiddleware.js";
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  // OAuth handlers exported below
  oauthCallbackHandler,
} from "../controllers/authController.js";
import authMiddleware from "../middleware/authMiddleware.js";
const router = Router();



// Local auth
router.route("/register").post(upload.single("avatar"), registerUser);
router.route("/login").post(loginUser);
router.route("/logout").post(authMiddleware,logoutUser);
router.route("/refresh").post(refreshAccessToken);

// OAuth: Google
router.route(
  "/google").get(
  passport.authenticate("google", { scope: ["profile", "email"],session: false })
);
router.route(
  "/google/callback").get(
  passport.authenticate("google", {  
    failureRedirect: `${process.env.CORS_ORIGIN || "http://localhost:3000"}/login?error=auth_failed`,
      session: false,
   }),
  oauthCallbackHandler
);

// OAuth: Facebook
router.route(
  "/facebook").get(
  passport.authenticate("facebook", { scope: ["email"] })
);
router.route(
  "/facebook/callback").get(  
  passport.authenticate("facebook", { session: false, failureRedirect: "/login" }),
  oauthCallbackHandler
);

// Other account routes
router.route("/me").get(authMiddleware, getCurrentUser);
router.route("/account").put(authMiddleware,updateAccountDetails);
router.route("/update-avatar").patch(authMiddleware, upload.single('avatar'), updateUserAvatar);
router.route("/change-password").post(authMiddleware,changeCurrentPassword);

export default router;
