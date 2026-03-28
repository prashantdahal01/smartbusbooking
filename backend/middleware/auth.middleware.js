// Middleware to verify JWT token and attach the authenticated user to req.user
const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  // Extract Bearer token from Authorization header
  // Verify token with JWT_SECRET from environment variables
  // Attach decoded user payload to req.user and call next()
};

module.exports = { verifyToken };
