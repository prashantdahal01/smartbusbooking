// Centralized app configuration loaded from environment variables

const safeString = (v) => String(v == null ? "" : v);

const buildSmtpConfig = () => {
	const provider = safeString(process.env.SMTP_PROVIDER).trim().toLowerCase();
	const host = safeString(process.env.SMTP_HOST || (provider === "gmail" ? "smtp.gmail.com" : "")).trim();
	const port = Number(process.env.SMTP_PORT || (provider === "gmail" ? 587 : 0) || 0);
	const user = safeString(process.env.SMTP_USER).trim();

	let password = safeString(process.env.SMTP_PASS || process.env.SMTP_PASSWORD).trim();
	if (provider === "gmail") {
		// Google shows App Passwords with spaces for readability; remove whitespace if pasted that way.
		password = password.replace(/\s+/g, "");
	}

	let from = safeString(process.env.SMTP_FROM || process.env.SMTP_FROM_ADDRESS || user).trim();
	if (provider === "gmail" && user && from && from.toLowerCase() !== user.toLowerCase()) {
		from = user;
	}

	if (!host || !port || !user || !password || !from) return null;
	return {
		provider,
		host,
		port,
		user,
		password,
		from,
		secure: port === 465,
		requireTLS: port === 587,
	};
};

// For convenience, most code can just import this.
// If you need to re-read env values at runtime, use buildSmtpConfig() instead.
const SMTPConfig = buildSmtpConfig();

module.exports = { SMTPConfig, buildSmtpConfig };
