import { useEffect, useMemo, useState } from "react";
import { Eye, RefreshCw, Search, XCircle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { cancelAdminBooking, getAdminBookings } from "../../services/admin.service";

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "3m", label: "Last 3 months" },
  { value: "1y", label: "Last 1 year" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "payment_pending", label: "Payment Pending" },
  { value: "payment_failed", label: "Payment Failed" },
];

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

export default function ManageBookings() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialSearch = searchParams.get("search") || "";
  const [searchText, setSearchText] = useState(initialSearch);
  const [query, setQuery] = useState(initialSearch);
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("30d");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookingToCancel, setBookingToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const loadBookings = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    setError("");
    try {
      const data = await getAdminBookings({
        q: query,
        status,
        page,
        limit: 10,
        range,
      });
      setRows(Array.isArray(data?.items) ? data.items : []);
      setPagination(
        data?.pagination || {
          page,
          limit: 10,
          total: 0,
          totalPages: 1,
        }
      );
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load bookings");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const externalSearch = searchParams.get("search") || "";
    setSearchText(externalSearch);
    setQuery(externalSearch);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  useEffect(() => {
    // eslint-disable-next-line no-void
    void loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, range, page]);

  const pageSummary = useMemo(() => {
    if (!pagination.total) return "No results";
    const start = (pagination.page - 1) * pagination.limit + 1;
    const end = Math.min(pagination.page * pagination.limit, pagination.total);
    return `${start}-${end} of ${pagination.total}`;
  }, [pagination]);

  const onSearchSubmit = (event) => {
    event.preventDefault();
    const next = searchText.trim();
    setQuery(next);
    setPage(1);

    if (next) {
      setSearchParams({ search: next });
    } else {
      setSearchParams({});
    }
  };

  const onCancelBooking = async () => {
    if (!bookingToCancel) return;
    setCancelling(true);
    try {
      await cancelAdminBooking(bookingToCancel.id);
      setBookingToCancel(null);
      await loadBookings({ silent: true });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to cancel booking");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Manage Bookings</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Search, inspect, and manage booking records</p>
        </div>

        <button
          type="button"
          onClick={() => loadBookings({ silent: true })}
          disabled={refreshing}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="admin-surface p-4 sm:p-5">
        <form onSubmit={onSearchSubmit} className="grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search booking, user, route..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>

          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={range}
            onChange={(event) => {
              setRange(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 md:col-span-4"
          >
            Apply Filters
          </button>
        </form>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="admin-surface overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={`booking-skeleton-${idx}`} className="skeleton h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">No bookings found for selected filters.</div>
          ) : (
            <table className="w-full min-w-245 text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  <th className="px-4 py-3 font-semibold">User Name</th>
                  <th className="px-4 py-3 font-semibold">Phone Number</th>
                  <th className="px-4 py-3 font-semibold">Route</th>
                  <th className="px-4 py-3 font-semibold">Seat Number</th>
                  <th className="px-4 py-3 font-semibold">Pickup</th>
                  <th className="px-4 py-3 text-right font-semibold">Price</th>
                  <th className="px-4 py-3 text-right font-semibold">Date</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.userName}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.phone}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                      <div className="font-medium">{row.route}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{row.busName}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.seatNumber}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.pickupLocation}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(row.price)}</td>
                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{formatDateTime(row.date)}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          row.status === "cancelled"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedBooking(row.details)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => setBookingToCancel(row)}
                          disabled={row.status === "cancelled"}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800/70 dark:text-rose-300 dark:hover:bg-rose-900/30"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800">
          <p className="text-slate-500 dark:text-slate-400">{pageSummary}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Previous
            </button>
            <span className="text-slate-600 dark:text-slate-300">
              Page {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selectedBooking ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Booking Details</h3>
            <div className="mt-4 grid gap-3 text-sm text-slate-700 dark:text-slate-200">
              <p><span className="font-semibold">Booking ID:</span> {selectedBooking.bookingId}</p>
              <p><span className="font-semibold">User:</span> {selectedBooking.userName} ({selectedBooking.email || "-"})</p>
              <p><span className="font-semibold">Phone:</span> {selectedBooking.phone}</p>
              <p><span className="font-semibold">Passenger:</span> {selectedBooking.passengerName || "-"}</p>
              <p><span className="font-semibold">Route:</span> {selectedBooking.route}</p>
              <p><span className="font-semibold">Bus:</span> {selectedBooking.busName} ({selectedBooking.vehicleNumber})</p>
              <p><span className="font-semibold">Seat:</span> {selectedBooking.seatNumber}</p>
              <p><span className="font-semibold">Pickup:</span> {selectedBooking.pickupLocation}</p>
              <p><span className="font-semibold">Drop:</span> {selectedBooking.droppingLocation}</p>
              <p><span className="font-semibold">Price:</span> {formatCurrency(selectedBooking.price)}</p>
              <p><span className="font-semibold">Status:</span> {selectedBooking.status}</p>
              <p><span className="font-semibold">Date:</span> {formatDateTime(selectedBooking.date)}</p>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bookingToCancel ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Cancel Booking?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              This will cancel booking for {bookingToCancel.userName} on route {bookingToCancel.route}.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBookingToCancel(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Keep Booking
              </button>
              <button
                type="button"
                onClick={onCancelBooking}
                disabled={cancelling}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {cancelling ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
