import nodemailer from 'nodemailer';
import { db } from './db.js';

export async function getEmailTransporter() {
  const settings = await db.getSettings();

  const host = settings.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(settings.smtp_port || process.env.SMTP_PORT || '465', 10);
  const user = settings.smtp_user || process.env.SMTP_USER || '';
  const pass = settings.smtp_app_password || process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS || '';
  const fromName = settings.smtp_from_name || process.env.SMTP_FROM_NAME || 'SHMS Hotel Cloud Platform';

  if (!user || !pass) {
    return { configured: false, transporter: null, user, fromName };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass: pass.replace(/\s+/g, ''), // Strip spaces in Google App Password e.g. "abcd efgh ijkl mnop"
    },
  });

  return { configured: true, transporter, user, fromName };
}

export async function sendPasswordResetEmail({ toEmail, hotelName, hotelSlug, otpCode }) {
  const { configured, transporter, user, fromName } = await getEmailTransporter();

  const subject = `SHMS Password Reset Code: ${otpCode} for ${hotelName}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #121216; color: #f4f4f5; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; padding: 32px;">
      <div style="border-bottom: 1px solid #27272a; padding-bottom: 20px; margin-bottom: 24px;">
        <h2 style="color: #ffffff; margin: 0 0 6px 0; font-size: 20px;">SHMS Hotel Monitoring Platform</h2>
        <span style="font-size: 12px; color: #10b981; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Security Verification Service</span>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #d4d4d8;">
        Hello,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #d4d4d8;">
        We received a password reset request for your hotel portal <strong style="color: #ffffff;">${hotelName}</strong> (Endpoint: <code style="color: #34d399; background: #18181b; padding: 2px 6px; border-radius: 4px;">/${hotelSlug}</code>).
      </p>

      <div style="background: #18181b; border: 1px solid #3f3f46; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #a1a1aa; display: block; margin-bottom: 8px;">Your 6-Digit Verification OTP</span>
        <div style="font-size: 36px; font-weight: 800; letter-spacing: 0.2em; color: #34d399; font-family: monospace;">
          ${otpCode}
        </div>
        <span style="font-size: 11px; color: #71717a; display: block; margin-top: 8px;">This code expires in 15 minutes.</span>
      </div>

      <p style="font-size: 13px; line-height: 1.6; color: #a1a1aa;">
        If you did not request this password reset, you can safely ignore this email. Your credentials remain unchanged.
      </p>

      <div style="border-top: 1px solid #27272a; margin-top: 32px; padding-top: 20px; font-size: 11px; color: #71717a; text-align: center;">
        &copy; 2026 SHMS Cloud Services &bull; Multi-Tenant Surveillance &amp; Hygiene Compliance Platform
      </div>
    </div>
  `;

  if (!configured || !transporter) {
    throw new Error('SMTP email service is not configured with an App Password. Please ask the platform operator to configure SMTP in Settings.');
  }

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to: toEmail,
      subject,
      html,
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Email Service] Failed to send email via App Password SMTP:', err);
    throw new Error(`Failed to deliver reset email: ${err.message}`);
  }
}
