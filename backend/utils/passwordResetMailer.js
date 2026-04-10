const EmailService = require("../services/email.service");

const safeString = (v) => String(v == null ? "" : v);

const buildPasswordResetEmail = ({ name, resetUrl }) => {
	const subject = "SmartBus Password Reset";
	const safeName = safeString(name).trim();
	const greeting = safeName ? `Hi ${safeName},` : "Hi,";

	const text = [
		greeting,
		"",
		"We received a request to reset your SmartBus account password.",
		"",
		`Reset your password using this link: ${resetUrl}`,
		"",
		"If you did not request this, you can ignore this email.",
	].join("\n");

	const html = `
		<div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.5; color: #0f172a;">
			<h2 style="margin:0 0 8px;">Password reset</h2>
			<p style="margin:0 0 16px; color:#475569;">${greeting}<br/>We received a request to reset your SmartBus account password.</p>
			<p style="margin:0 0 16px;">
				<a href="${resetUrl}" style="display:inline-block; padding:10px 14px; background:#0f172a; color:#ffffff; text-decoration:none; border-radius:10px;">Reset password</a>
			</p>
			<p style="margin:0 0 16px; color:#475569;">If the button doesn’t work, copy and paste this URL into your browser:</p>
			<p style="margin:0 0 16px;"><a href="${resetUrl}">${resetUrl}</a></p>
			<p style="margin:0; color:#475569; font-size: 12px;">If you did not request this, you can safely ignore this email.</p>
		</div>
	`;

	return { subject, html, text };
};

exports.sendPasswordResetEmailSafely = async ({ to, name, resetUrl }) => {
	try {
		const email = safeString(to).trim();
		if (!email) return false;

		let emailService;
		try {
			emailService = new EmailService();
		} catch (e) {
			// SMTP not configured
			return false;
		}

		const { subject, html, text } = buildPasswordResetEmail({ name, resetUrl });
		await emailService.sendEmail({
			to: email,
			sub: subject,
			message: html,
			text,
		});

		return true;
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error("Password reset email failed", e);
		return false;
	}
};
