// Middleware factory for role-based access control
// Usage: authorizeRoles("admin", "operator")

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    // Check if req.user.role is included in the allowed roles list
    // If not, respond with 403 Forbidden
    // Otherwise call next()
  };
};

module.exports = { authorizeRoles };
