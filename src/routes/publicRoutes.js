import { Router } from "express";
import Setting from "../models/Setting.js";

const DEFAULT_PUBLIC_SETTINGS = [
  { key: "direction", value: "ltr" },
  { key: "language", value: "en" },
  { key: "site_name", value: "EstateHub" },
  { key: "site_tagline", value: "Luxury Properties & Premium Real Estate" },
  { key: "site_logo", value: "" },
  { key: "default_currency", value: "USD" },
  { key: "contact_email", value: "info@estatehub.com" },
  { key: "contact_phone", value: "(555) 123-4567" },
  { key: "contact_address", value: "123 Luxury Lane, Suite 500, New York, NY 10001" },
  { key: "social_facebook", value: "" },
  { key: "social_twitter", value: "" },
  { key: "social_instagram", value: "" },
  { key: "social_linkedin", value: "" },
];

const PUBLIC_KEYS = DEFAULT_PUBLIC_SETTINGS.map((s) => s.key);

const router = Router();

router.get("/settings", async (req, res) => {
  try {
    let settings = await Setting.find({ key: { $in: PUBLIC_KEYS } }).lean();

    if (settings.length === 0) {
      await Setting.insertMany(DEFAULT_PUBLIC_SETTINGS);
      settings = await Setting.find({ key: { $in: PUBLIC_KEYS } }).lean();
    }

    const map = {};
    settings.forEach((s) => { map[s.key] = s.value; });

    // Fill in any missing keys with defaults
    for (const def of DEFAULT_PUBLIC_SETTINGS) {
      if (map[def.key] === undefined) map[def.key] = def.value;
    }

    res.json({ data: map });
  } catch {
    res.json({ data: { direction: "ltr", language: "en", site_name: "EstateHub", site_tagline: "Luxury Properties & Premium Real Estate", site_logo: "", default_currency: "USD", contact_email: "info@estatehub.com", contact_phone: "(555) 123-4567", contact_address: "123 Luxury Lane, Suite 500, New York, NY 10001", social_facebook: "", social_twitter: "", social_instagram: "", social_linkedin: "" } });
  }
});

export default router;
