const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const connectDB = require("./config/db");
const moduleRouter = require("./modules");
const { isApiError } = require("./utils/apiError");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check routes
const sendApiHealth = (req, res) => {
  res.json({ status: "ok" });
};

app.get("/api/health", sendApiHealth);
app.get("/api/status", sendApiHealth);

// ================= ROUTES =================
// Support both /api and /api/v1 to avoid 404s from mismatched frontend base URLs.
app.use("/api", moduleRouter);
app.use("/api/v1", moduleRouter);

// ================= SERVE FRONTEND =================
// VERY IMPORTANT: Serve Vite build files
const frontendPath = path.join(__dirname, "../frontend/dist");

app.use(express.static(frontendPath));

// SPA fallback (React Router support)
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// ================= ERROR HANDLER =================
app.use((err, req, res, next) => {
  if (isApiError(err)) {
    const status = Number.isFinite(Number(err.status)) ? Number(err.status) : 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Request failed",
      data: err.data ?? null,
    });
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ message: "Image size must be 5MB or less" });
    }
    return res
      .status(400)
      .json({ message: err.message || "Invalid upload request" });
  }

  if (typeof err?.message === "string" && /upload|image/i.test(err.message)) {
    return res.status(400).json({ message: err.message });
  }

  const cloudinaryMessage = String(err?.error?.message || err?.message || "").trim();
  const cloudinaryHost = String(err?.request_options?.host || "").toLowerCase();
  const isCloudinaryError = Boolean(cloudinaryMessage) && (
    /cloudinary|cloud_name|api[\s_-]*key|signature|upload/i.test(cloudinaryMessage)
    || cloudinaryHost.includes("cloudinary.com")
  );

  if (isCloudinaryError) {
    const status = Number(err?.http_code);
    const httpStatus = Number.isInteger(status) && status >= 400 && status < 600 ? status : 400;
    return res.status(httpStatus).json({ message: `Cloudinary error: ${cloudinaryMessage}` });
  }

  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

// ================= START SERVER =================
const start = async () => {
  await connectDB();

  const port = Number(process.env.PORT) || 5000;

  app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });
};

if (require.main === module) {
  start().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = app;