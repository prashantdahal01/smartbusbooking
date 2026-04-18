import { useEffect, useMemo, useState } from "react";
import { Pencil, RefreshCw, Trash2, UserSearch } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  deleteUserByAdmin,
  getAllUsers,
  getUserBookingsByAdmin,
  updateUserByAdmin,
} from "../../services/admin.service";

const ROLE_OPTIONS = ["all", "admin", "operator", "customer"];

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-NP", {
    style: "currency",
    currency: "NPR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

export default function ManageUsers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const externalSearch = searchParams.get("search") || "";

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [searchText, setSearchText] = useState(externalSearch);
  const [query, setQuery] = useState(externalSearch.toLowerCase());
  const [roleFilter, setRoleFilter] = useState("all");

  const [editingUser, setEditingUser] = useState(null);
  const [editingForm, setEditingForm] = useState({ name: "", phone: "", role: "customer", isActive: true });
  const [savingUser, setSavingUser] = useState(false);

  const [historyUser, setHistoryUser] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [deletingUser, setDeletingUser] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    setError("");
    try {
      const data = await getAllUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load users");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line no-void
    void loadUsers();
  }, []);

  useEffect(() => {
    const next = (searchParams.get("search") || "").trim();
    setSearchText(next);
    setQuery(next.toLowerCase());
  }, [searchParams]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (roleFilter !== "all" && String(user?.role || "").toLowerCase() !== roleFilter) {
        return false;
      }

      if (!query) return true;

      const haystack = `${user?.name || ""} ${user?.email || ""} ${user?.phone || ""} ${user?.role || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [users, roleFilter, query]);

  const onSearchSubmit = (event) => {
    event.preventDefault();
    const value = searchText.trim();
    setQuery(value.toLowerCase());
    if (value) setSearchParams({ search: value });
    else setSearchParams({});
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setEditingForm({
      name: user?.name || "",
      phone: user?.phone || "",
      role: user?.role || "customer",
      isActive: user?.isActive !== false,
    });
  };

  const saveUser = async (event) => {
    event.preventDefault();
    if (!editingUser?._id) return;

    setSavingUser(true);
    try {
      const updated = await updateUserByAdmin(editingUser._id, editingForm);
      setUsers((prev) => prev.map((user) => (user._id === updated._id ? updated : user)));
      setEditingUser(null);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to update user");
    } finally {
      setSavingUser(false);
    }
  };

  const openHistoryModal = async (user) => {
    setHistoryUser(user);
    setHistoryRows([]);
    setHistoryLoading(true);
    try {
      const data = await getUserBookingsByAdmin(user._id);
      setHistoryRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load booking history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deletingUser?._id) return;
    setDeleting(true);
    try {
      await deleteUserByAdmin(deletingUser._id);
      setUsers((prev) => prev.filter((user) => user._id !== deletingUser._id));
      setDeletingUser(null);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Manage Users</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Edit user roles/details and inspect booking history</p>
        </div>

        <button
          type="button"
          onClick={() => loadUsers({ silent: true })}
          disabled={refreshing}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="admin-surface p-4 sm:p-5">
        <form onSubmit={onSearchSubmit} className="grid gap-3 sm:grid-cols-4">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search users by name, email, phone"
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 sm:col-span-3 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
          <button
            type="submit"
            className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Search
          </button>

          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 sm:col-span-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role === "all" ? "All roles" : role}
              </option>
            ))}
          </select>
        </form>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="admin-surface overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 7 }).map((_, idx) => (
                <div key={`user-skeleton-${idx}`} className="skeleton h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">No users found.</div>
          ) : (
            <table className="w-full min-w-220 text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user._id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{user.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.email}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.phone || "-"}</td>
                    <td className="px-4 py-3 capitalize text-slate-700 dark:text-slate-200">{user.role}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          user.isActive === false
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        }`}
                      >
                        {user.isActive === false ? "inactive" : "active"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openHistoryModal(user)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <UserSearch className="h-3.5 w-3.5" />
                          History
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-700/70 dark:text-blue-300 dark:hover:bg-blue-900/30"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingUser(user)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-800/70 dark:text-rose-300 dark:hover:bg-rose-900/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editingUser ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Edit User</h3>
            <form onSubmit={saveUser} className="mt-4 grid gap-3">
              <input
                value={editingForm.name}
                onChange={(event) => setEditingForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Name"
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              <input
                value={editingForm.phone}
                onChange={(event) => setEditingForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="Phone"
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              <select
                value={editingForm.role}
                onChange={(event) => setEditingForm((prev) => ({ ...prev, role: event.target.value }))}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {ROLE_OPTIONS.filter((role) => role !== "all").map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={Boolean(editingForm.isActive)}
                  onChange={(event) =>
                    setEditingForm((prev) => ({
                      ...prev,
                      isActive: event.target.checked,
                    }))
                  }
                />
                Active account
              </label>

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingUser ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {historyUser ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Booking History - {historyUser.name}</h3>

            <div className="mt-4 max-h-104 overflow-auto">
              {historyLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div key={`history-skeleton-${idx}`} className="skeleton h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : historyRows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                  No bookings found for this user.
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <th className="py-2 font-semibold">Route</th>
                      <th className="py-2 font-semibold">Bus</th>
                      <th className="py-2 font-semibold">Seats</th>
                      <th className="py-2 text-right font-semibold">Amount</th>
                      <th className="py-2 text-right font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                        <td className="py-2 text-slate-700 dark:text-slate-200">{row.route}</td>
                        <td className="py-2 text-slate-600 dark:text-slate-300">{row.bus}</td>
                        <td className="py-2 text-slate-600 dark:text-slate-300">{Array.isArray(row.seats) ? row.seats.join(", ") : "-"}</td>
                        <td className="py-2 text-right font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(row.totalPrice)}</td>
                        <td className="py-2 text-right text-slate-500 dark:text-slate-400">{formatDateTime(row.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryUser(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deletingUser ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Delete User?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              This action will permanently remove {deletingUser.name} ({deletingUser.email}).
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                disabled={deleting}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
