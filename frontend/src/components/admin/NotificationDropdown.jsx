import { useEffect, useRef, useState } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import {
  getAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "../../services/admin.service";

const formatTimeAgo = (value) => {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const wrapperRef = useRef(null);

  const loadNotifications = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAdminNotifications(20);
      setNotifications(Array.isArray(data?.items) ? data.items : []);
      setUnreadCount(Number(data?.unreadCount) || 0);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;

    // eslint-disable-next-line no-void
    void loadNotifications();

    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const onMarkRead = async (id) => {
    try {
      const data = await markAdminNotificationRead(id);
      const updated = data?.item;
      setNotifications((prev) =>
        prev.map((item) => (String(item._id) === String(updated?._id) ? { ...item, ...updated } : item))
      );
      setUnreadCount(Number(data?.unreadCount) || 0);
    } catch {
      // ignore per-item failure to keep panel responsive
    }
  };

  const onMarkAllRead = async () => {
    try {
      const data = await markAllAdminNotificationsRead();
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(Number(data?.unreadCount) || 0);
    } catch {
      // ignore failure
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</h3>
            <button
              type="button"
              onClick={onMarkAllRead}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-96 overflow-auto p-2">
            {loading ? (
              <div className="grid place-items-center py-8 text-slate-500 dark:text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </div>
            ) : notifications.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                No notifications yet.
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map((item) => (
                  <div
                    key={item._id}
                    className={`rounded-xl border px-3 py-2 transition ${
                      item.isRead
                        ? "border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-900"
                        : "border-blue-100 bg-blue-50/60 dark:border-blue-700/40 dark:bg-blue-900/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{item.message}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{formatTimeAgo(item.createdAt)}</p>
                      </div>
                      {!item.isRead ? (
                        <button
                          type="button"
                          onClick={() => onMarkRead(item._id)}
                          className="rounded-md p-1 text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                          aria-label="Mark as read"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
