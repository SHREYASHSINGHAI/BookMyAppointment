const axios = require("axios");

async function sendOTPEmail(toEmail, otpCode) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn("[Email Service] SENDGRID_API_KEY not configured. OTP code is:", otpCode);
    return;
  }

  // Use a default sender if not configured
  const fromEmail = process.env.FROM_EMAIL || "noreply@bookmyappointment.online";
  const subject = "Reset your BookMyAppointment Password";

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="color: #0a2540; margin: 0; font-size: 24px; font-weight: 800;">BMA <span style="color: #10b981;">AI</span></h2>
      </div>
      <p style="font-size: 16px; color: #333333; line-height: 1.5;">Hello,</p>
      <p style="font-size: 16px; color: #333333; line-height: 1.5;">We received a request to reset the password for your clinical dashboard account.</p>
      <p style="font-size: 16px; color: #333333; line-height: 1.5;">Please use the following 6-digit verification code (OTP) to reset your password. This code will expire in 15 minutes.</p>
      <div style="text-align: center; margin: 30px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #10b981; background: #f0fdf4; padding: 12px 24px; border-radius: 8px; border: 1px dashed #10b981; display: inline-block;">
          ${otpCode}
        </span>
      </div>
      <p style="font-size: 14px; color: #666666; line-height: 1.5;">If you did not request this, please ignore this email. Your password will remain unchanged.</p>
      <hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;" />
      <p style="font-size: 12px; color: #999999; text-align: center;">BookMyAppointment © 2026. All rights reserved.</p>
    </div>
  `;

  try {
    await axios.post(
      "https://api.sendgrid.com/v3/mail/send",
      {
        personalizations: [
          {
            to: [{ email: toEmail }]
          }
        ],
        from: {
          email: fromEmail,
          name: "BookMyAppointment Support"
        },
        subject: subject,
        content: [
          {
            type: "text/html",
            value: htmlContent
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log(`[Email Service] OTP successfully sent to ${toEmail}`);
  } catch (err) {
    console.error("[Email Service] Failed to send email via SendGrid:", err.response?.data || err.message);
    console.warn(`\n[Email Service] [FALLBACK WARNING] Could not deliver email. The generated OTP is: ${otpCode}\n`);
  }
}

module.exports = {
  sendOTPEmail
};
