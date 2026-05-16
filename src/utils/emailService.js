import nodemailer from "nodemailer";

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  try {
    const Setting = (await import("../models/Setting.js")).default;
    const settings = await Setting.find({ key: { $in: ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"] } }).lean();
    const map = {};
    settings.forEach((s) => { map[s.key] = s.value; });

    if (map.smtp_host && map.smtp_user && map.smtp_pass) {
      transporter = nodemailer.createTransport({
        host: map.smtp_host,
        port: parseInt(map.smtp_port) || 587,
        secure: parseInt(map.smtp_port) === 465,
        auth: { user: map.smtp_user, pass: map.smtp_pass },
      });
    }
  } catch {
    transporter = null;
  }

  return transporter;
}

export async function sendEmail({ to, subject, html }) {
  const EmailLog = (await import("../models/EmailLog.js")).default;

  try {
    const t = await getTransporter();

    if (!t) {
      console.log(`[EmailService] SMTP not configured. Would send email to ${to}: ${subject}`);
      await EmailLog.create({ to, subject, body: html, status: "skipped", error: "SMTP not configured" });
      return { sent: false, reason: "SMTP not configured" };
    }

    const settings = await (await import("../models/Setting.js")).default.find({ key: "smtp_from" }).lean();
    const from = settings[0]?.value || "noreply@estatehub.com";

    const info = await t.sendMail({ from, to, subject, html });
    console.log(`[EmailService] Sent email to ${to}: ${info.messageId}`);

    await EmailLog.create({ to, subject, body: html, status: "sent", messageId: info.messageId });
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EmailService] Failed to send email to ${to}:`, error.message);
    await EmailLog.create({ to, subject, body: html, status: "failed", error: error.message });
    return { sent: false, error: error.message };
  }
}

export function buildEmailTemplate(title, bodyContent) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 32px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #d97706, #ea580c); padding: 24px 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 20px;">EstateHub</h1>
    </div>
    <div style="padding: 32px;">
      <h2 style="margin-top: 0; font-size: 18px; color: #1a1a1a;">${title}</h2>
      ${bodyContent}
    </div>
    <div style="padding: 16px 32px; border-top: 1px solid #e5e5e5; text-align: center; font-size: 12px; color: #999;">
      &copy; ${new Date().getFullYear()} EstateHub. All rights reserved.
    </div>
  </div>
</body>
</html>`;
}
