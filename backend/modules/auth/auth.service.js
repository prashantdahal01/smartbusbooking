const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { ApiError } = require("../../utils/apiError");
const { sendPasswordResetEmailSafely } = require("../../utils/passwordResetMailer");
const { User } = require("./auth.model");

const safeString = (value) => String(value == null ? "" : value);
const normalizeEmail = (email) => safeString(email).toLowerCase().trim();

const getFrontendBaseUrl = () => {
  const raw = safeString(process.env.FRONTEND_URL || "http://localhost:5173").trim();
  return raw.replace(/\/+$/, "");
};

const hashResetToken = (token) => crypto.createHash("sha256").update(safeString(token)).digest("hex");

const signToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new ApiError(500, "JWT_SECRET missing", null);
  }
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(
    { id: user._id.toString(), role: user.role, email: user.email, name: user.name },
    secret,
    { expiresIn }
  );
};

/**
 * Register a new customer account.
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} [params.phone]
 * @returns {Promise<{token: string, user: {id: string, name: string, email: string, role: string}}>} 
 */
const register = async ({ name, email, password, phone }) => {
  if (!name || !email || !password) {
    throw new ApiError(400, "name, email, password are required", null);
  }

  const safeEmail = normalizeEmail(email);
  const existing = await User.findOne({ email: safeEmail });
  if (existing) {
    throw new ApiError(409, "Email already registered", null);
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email: safeEmail,
    password: hashed,
    phone: phone || "",
    role: "customer",
    isActive: true,
  });

  const token = signToken(user);
  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  };
};

/**
 * Login a user and return a JWT.
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @returns {Promise<{token: string, user: {id: string, name: string, email: string, role: string}}>} 
 */
const login = async ({ email, password }) => {
  if (!email || !password) {
    throw new ApiError(400, "email and password are required", null);
  }

  const safeEmail = normalizeEmail(email);
  const user = await User.findOne({ email: safeEmail });
  if (!user) {
    throw new ApiError(401, "Invalid credentials", null);
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    throw new ApiError(401, "Invalid credentials", null);
  }

  if (user.isActive === false) {
    throw new ApiError(403, "Account disabled", null);
  }

  const token = signToken(user);
  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  };
};

/**
 * Get the current user's profile (without password).
 * @param {object} params
 * @param {string} params.userId
 * @returns {Promise<object>} 
 */
const me = async ({ userId }) => {
  const user = await User.findById(userId).select("-password");
  if (!user) {
    throw new ApiError(404, "User not found", null);
  }
  return user;
};

/**
 * Send a password reset email if the account exists.
 * @param {object} params
 * @param {string} params.email
 * @returns {Promise<{message: string}>} 
 */
const forgotPassword = async ({ email }) => {
  const safeEmail = normalizeEmail(email);
  if (!safeEmail) {
    throw new ApiError(400, "email is required", null);
  }

  const user = await User.findOne({ email: safeEmail });
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

  return {
    message: "If that email is registered, a password reset link has been sent.",
  };
};

/**
 * Reset a user's password using a token.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.password
 * @param {string} [params.confirmPassword]
 * @returns {Promise<{message: string}>} 
 */
const resetPassword = async ({ token, password, confirmPassword }) => {
  const safeToken = safeString(token).trim();
  const safePassword = safeString(password);

  if (!safeToken || !safePassword) {
    throw new ApiError(400, "token and password are required", null);
  }
  if (confirmPassword != null && safePassword !== safeString(confirmPassword)) {
    throw new ApiError(400, "Passwords do not match", null);
  }
  if (safePassword.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters", null);
  }

  const tokenHash = hashResetToken(safeToken);
  const user = await User.findOne({
    passwordResetToken: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  });

  if (!user) {
    throw new ApiError(400, "Reset link is invalid or has expired", null);
  }
  if (user.isActive === false) {
    throw new ApiError(403, "Account disabled", null);
  }

  user.password = await bcrypt.hash(safePassword, 10);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  return { message: "Password updated successfully" };
};

module.exports = {
  register,
  login,
  me,
  forgotPassword,
  resetPassword,
};
