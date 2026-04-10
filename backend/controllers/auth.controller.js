// Handles user registration, login, and JWT token issuance
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { sendPasswordResetEmailSafely } = require("../utils/passwordResetMailer");

const safeString = (v) => String(v == null ? "" : v);

const normalizeEmail = (email) => safeString(email).toLowerCase().trim();

const getFrontendBaseUrl = () => {
	const raw = safeString(process.env.FRONTEND_URL || "http://localhost:5173").trim();
	return raw.replace(/\/+$/, "");
};

const hashResetToken = (token) => crypto.createHash("sha256").update(safeString(token)).digest("hex");

const signToken = (user) => {
	const secret = process.env.JWT_SECRET;
	if (!secret) throw new Error("JWT_SECRET missing");
	const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
	return jwt.sign(
		{ id: user._id.toString(), role: user.role, email: user.email, name: user.name },
		secret,
		{ expiresIn }
	);
};

exports.register = async (req, res) => {
	try {
		const { name, email, password, phone } = req.body;
		if (!name || !email || !password) {
			return res.status(400).json({ message: "name, email, password are required" });
		}

		const existing = await User.findOne({ email: email.toLowerCase().trim() });
		if (existing) {
			return res.status(409).json({ message: "Email already registered" });
		}

		const hashed = await bcrypt.hash(password, 10);
		const user = await User.create({
			name,
			email: email.toLowerCase().trim(),
			password: hashed,
			phone: phone || "",
			role: "customer",
			isActive: true,
		});

		const token = signToken(user);
		return res.status(201).json({
			token,
			user: { id: user._id, name: user.name, email: user.email, role: user.role },
		});
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.login = async (req, res) => {
	try {
		const { email, password } = req.body;
		if (!email || !password) {
			return res.status(400).json({ message: "email and password are required" });
		}

		const user = await User.findOne({ email: email.toLowerCase().trim() });
		if (!user) {
			return res.status(401).json({ message: "Invalid credentials" });
		}

		const ok = await bcrypt.compare(password, user.password);
		if (!ok) {
			return res.status(401).json({ message: "Invalid credentials" });
		}

		if (user.isActive === false) {
			return res.status(403).json({ message: "Account disabled" });
		}

		const token = signToken(user);
		return res.json({
			token,
			user: { id: user._id, name: user.name, email: user.email, role: user.role },
		});
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.me = async (req, res) => {
	try {
		const user = await User.findById(req.user.id).select("-password");
		if (!user) return res.status(404).json({ message: "User not found" });
		return res.json(user);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

// POST /api/auth/forgot-password
// Always returns a generic success message to avoid email enumeration.
exports.forgotPassword = async (req, res) => {
	try {
		const email = normalizeEmail(req.body?.email);
		if (!email) {
			return res.status(400).json({ message: "email is required" });
		}

		const user = await User.findOne({ email });
		if (user && user.isActive !== false) {
			const rawToken = crypto.randomBytes(32).toString("hex");
			const tokenHash = hashResetToken(rawToken);
			const minutes = Math.max(5, Number(process.env.PASSWORD_RESET_TOKEN_EXPIRES_MINUTES || 60) || 60);
			user.passwordResetToken = tokenHash;
			user.passwordResetExpires = new Date(Date.now() + minutes * 60 * 1000);
			await user.save();

			const resetUrl = `${getFrontendBaseUrl()}/reset-password/${rawToken}`;
			const emailSent = await sendPasswordResetEmailSafely({
				to: user.email,
				name: user.name,
				resetUrl,
			});

			const nodeEnv = safeString(process.env.NODE_ENV).trim().toLowerCase();
			if (!emailSent && (nodeEnv === "development" || nodeEnv === "test")) {
				// eslint-disable-next-line no-console
				console.warn("SMTP not configured or email failed. Dev reset URL:", resetUrl);
			}
		}

		return res.json({
			message: "If that email is registered, a password reset link has been sent.",
		});
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

// POST /api/auth/reset-password
exports.resetPassword = async (req, res) => {
	try {
		const token = safeString(req.body?.token).trim();
		const password = safeString(req.body?.password);
		const confirmPassword = req.body?.confirmPassword == null ? null : safeString(req.body.confirmPassword);

		if (!token || !password) {
			return res.status(400).json({ message: "token and password are required" });
		}
		if (confirmPassword != null && password !== confirmPassword) {
			return res.status(400).json({ message: "Passwords do not match" });
		}
		if (password.length < 8) {
			return res.status(400).json({ message: "Password must be at least 8 characters" });
		}

		const tokenHash = hashResetToken(token);
		const user = await User.findOne({
			passwordResetToken: tokenHash,
			passwordResetExpires: { $gt: new Date() },
		});

		if (!user) {
			return res.status(400).json({ message: "Reset link is invalid or has expired" });
		}
		if (user.isActive === false) {
			return res.status(403).json({ message: "Account disabled" });
		}

		user.password = await bcrypt.hash(password, 10);
		user.passwordResetToken = undefined;
		user.passwordResetExpires = undefined;
		await user.save();

		return res.json({ message: "Password updated successfully" });
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};
