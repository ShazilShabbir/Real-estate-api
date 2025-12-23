import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config();




passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user already exists
    console.log("📥 Google Profile Received:", {
          id: profile.id,
          email: profile.emails?.[0]?.value,
          name: profile.displayName,
        });

        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          // Create new user
         user = await User.create({
            googleId: profile.id,
            username: profile.displayName, // FIXED: was 'name', schema expects 'username'
            email: profile.emails[0].value,
            avatar: profile.photos[0]?.value,
            provider: "google",
            providerId: profile.id,
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Facebook OAuth strategy
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL,
      profileFields: ["id", "displayName", "emails", "photos"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("📥 Facebook Profile Received:", {
          id: profile.id,
          email: profile.emails?.[0]?.value,
          name: profile.displayName,
        });

        let user = await User.findOne({ facebookId: profile.id });

        if (!user) {
          // Create new user (email may be missing from Facebook)
          user = await User.create({
            facebookId: profile.id,
            username: profile.displayName ,
            email: profile.emails?.[0]?.value ,
            avatar: profile.photos?.[0]?.value,
            provider: "facebook",
            providerId: profile.id,
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);





export default passport;
