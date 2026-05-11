const { Notification } = require("../modules/notification/notification.model");

const createAdminNotification = async ({
  type = "system",
  title,
  message,
  entityType = "",
  entityId = null,
  data = {},
}) => {
  if (!title || !message) return null;

  try {
    return await Notification.create({
      targetRole: "admin",
      type,
      title: String(title).trim(),
      message: String(message).trim(),
      entityType: String(entityType || "").trim(),
      entityId,
      data,
      isRead: false,
    });
  } catch (e) {
    // Notification creation should not block business flow.
    // eslint-disable-next-line no-console
    console.error("Failed to create admin notification", e?.message || e);
    return null;
  }
};

module.exports = {
  createAdminNotification,
};
