import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
const { Schema } = mongoose;

const imageSchema = new Schema(
	{
		url: { type: String, required: true },
		public_id: { type: String },
	},
	{ _id: false }
);

const addressSchema = new Schema(
	{
		street: { type: String },
		city: { type: String },
		state: { type: String },
		zipcode: { type: String },
		postalCode: { type: String },
		country: { type: String, default: "USA" },
	},
	{ _id: false }
);

const propertySchema = new Schema(
	{
		title: { type: String, required: true, trim: true },
		description: { type: String, required: true, trim: true },
		price: { type: Number, required: true },
		currency: { type: String, default: "USD" },
		bedrooms: { type: Number, default: 0 },
		bathrooms: { type: Number, default: 0 },
		area: { type: Number, default: 0 }, // area in sqft (or sqm based on currency/locale)
		propertyType: {
			type: String,
			enum: ["house", "apartment", "villa", "condo", "land", "townhouse", "commercial", "other"],
			default: "house",
		},
		status: { type: String, enum: ["available", "sold", "pending", "rented"], default: "available" },
		address: addressSchema,
		// GeoJSON point: [lng, lat]
		location: {
			type: {
				type: String,
				enum: ["Point"],
				default: "Point",
			},
			coordinates: { type: [Number], index: "2dsphere" },
		},
		images: [imageSchema],
		videos: [imageSchema],
		amenities: [String],
		postedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
		isFeatured: { type: Boolean, default: false },
		views: { type: Number, default: 0 },
		likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
		meta: {
			furnished: { type: Boolean },
			yearBuilt: { type: Number },
		},
	},
	{ timestamps: true }
);

// Text index for quick searching
propertySchema.index({ title: "text", description: "text", "address.city": "text", "address.state": "text" });

// Virtual for full address
propertySchema.virtual("fullAddress").get(function () {
	const a = this.address || {};
	return [a.street, a.city, a.state, a.zipcode, a.postalCode, a.country].filter(Boolean).join(", ");
});
propertySchema.plugin(mongoosePaginate);
export default mongoose.models.Property || mongoose.model("Property", propertySchema);

