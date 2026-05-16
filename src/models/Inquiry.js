import mongoose from "mongoose";
const { Schema } = mongoose;

const inquirySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    message: { type: String, required: true, trim: true },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property" },
    status: {
      type: String,
      enum: ["new", "read", "replied", "archived"],
      default: "new",
    },
  },
  { timestamps: true }
);

export default mongoose.models.Inquiry || mongoose.model("Inquiry", inquirySchema);
