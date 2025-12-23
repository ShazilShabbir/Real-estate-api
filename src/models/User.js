import mongoose from "mongoose";
import bcrypt from "bcrypt";
import Jwt from "jsonwebtoken";

const { Schema } = mongoose;

const userSchema = new Schema(
	{
		username: { type: String, required: true, trim: true },
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
			index: true,
		},
		// password is required only when user registers locally (no provider)
		password: { type: String, minlength: 6, select: false },
		provider: { type: String, enum: ["local", "google", "facebook"], default: "local" },
		providerId: { type: String },
		googleId: String,
    	facebookId: String,
		avatar: { type: String },
		role: { type: String, enum: ["user", "admin", "agent"], default: "user" },
		phone: { type: String },
		savedProperties: [{ type: Schema.Types.ObjectId, ref: "Property" }],
		  refreshToken: {
      type: String,
    },
	},
	{ timestamps: true }
);

// Hash password before save
// Hash password before save if it's provided/modified
userSchema.pre("save", async function (next) {
	if (!this.isModified("password") || !this.password) return next();
	try {
		const salt = await bcrypt.genSalt(10);
		this.password = await bcrypt.hash(this.password, salt);
		return next();
	} catch (err) {
		return next(err);
	}
});

// Compare candidate password with stored hash
userSchema.methods.isPasswordCorrect = async function (candidatePassword) {
	if (!this.password) return false;
	return bcrypt.compare(candidatePassword, this.password);
};

// generate access and refresh tokens
// generate access and refresh tokens (return raw token strings)
userSchema.methods.generateAccessToken = function () {
  return Jwt.sign({ _id: this._id.toString(), role: this.role }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m",
  });
};

userSchema.methods.generateRefreshToken = function () {
  return Jwt.sign({ _id: this._id.toString() }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
  });
};

// Remove sensitive fields when converting to JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  return obj;
};

export default mongoose.models.User || mongoose.model("User", userSchema);

