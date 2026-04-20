import {
  CalendarDays,
  Phone,
  Search,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getOperatorBookings } from "../../services/operator.service";
import { formatCurrency } from "../../utils/helpers";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const formatDateLabel = (value) => {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (DATE_KEY_REGEX.test(text)) {
    const parsed = new Date(`${text}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString();
    return text;
  }
  return text;
};

const isRevenueBooking = (booking) => {
  const status = String(booking?.status || "").trim().toLowerCase();
  const paymentStatus = String(booking?.paymentStatus || "").trim().toLowerCase();
  return status === "confirmed" && paymentStatus === "paid";
};

const toPassengerCount = (booking) => {
  const explicit = Number(booking?.passengerCount);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (Array.isArray(booking?.passengerNames) && booking.passengerNames.length > 0) return booking.passengerNames.length;
  if (Array.isArray(booking?.seats) && booking.seats.length > 0) return booking.seats.length;
  return 1;
};

export default function PassengersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dateFilter, setDateFilter] = useState("");
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  const [schedules, setSchedules] = useState([]);
  const [bookings, setBookings] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await getOperatorBookings({ date: dateFilter || undefined });
      setSchedules(Array.isArray(payload?.availableSchedules) ? payload.availableSchedules : []);
      setBookings(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load passenger schedules");
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const scheduleStats = useMemo(() => {
    const map = new Map();

    bookings.forEach((booking) => {
      const scheduleId = String(booking?.scheduleId || "").trim();
      if (!scheduleId) return;

      const row = map.get(scheduleId) || {
        bookings: 0,
        passengers: 0,
        paidRevenue: 0,
        pendingPayments: 0,
      };

      row.bookings += 1;
      row.passengers += toPassengerCount(booking);

      if (isRevenueBooking(booking)) {
        row.paidRevenue += Number(booking?.amount) || 0;
      }
      if (String(booking?.paymentStatus || "").trim().toLowerCase() === "pending") {
        row.pendingPayments += 1;
      }

      map.set(scheduleId, row);
    });

    return map;
  }, [bookings]);

  const visibleSchedules = useMemo(() => {
    const keyword = String(query || "").trim().toLowerCase();

    return schedules.filter((schedule) => {
      if (activeOnly && schedule?.isActive === false) return false;
      if (!keyword) return true;

      const haystack = `${schedule?.route || ""} ${schedule?.busName || ""} ${schedule?.date || ""} ${schedule?.time || ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [activeOnly, query, schedules]);

  const summary = useMemo(() => {
    const active = schedules.filter((schedule) => schedule?.isActive !== false).length;
    const totalPassengers = [...scheduleStats.values()].reduce((sum, row) => sum + row.passengers, 0);
    const totalPaidRevenue = [...scheduleStats.values()].reduce((sum, row) => sum + row.paidRevenue, 0);

    return {
      schedules: schedules.length,
      active,
      passengers: totalPassengers,
      paidRevenue: totalPaidRevenue,
    };
  }, [scheduleStats, schedules]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Passengers</h2>
          <p className="text-sm text-slate-500">Choose a schedule to open a detailed passenger manifest.</p>
        </div>
        <Link
          to="/operator/bookings"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Ticket className="h-4 w-4" />
          Open Bookings
        </Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedules</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <CalendarDays className="h-5 w-5 text-blue-600" />
            {loading ? "..." : summary.schedules}
          </p>
        </div>

        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Schedules</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{loading ? "..." : summary.active}</p>
        </div>

        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Passengers</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Users className="h-5 w-5 text-orange-600" />
            {loading ? "..." : summary.passengers}
          </p>
        </div>

        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid Revenue</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Wallet className="h-5 w-5 text-emerald-600" />
            {loading ? "..." : formatCurrency(summary.paidRevenue)}
          </p>
        </div>
      </section>

      <section className="admin-surface p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-slate-700">Search Schedule</span>
            <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Route, bus, date"
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-slate-700">Date</span>
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
            />
          </label>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => setActiveOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-200"
            />
            Active schedules only
          </label>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="admin-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Schedule Manifests</p>
          <p className="text-xs text-slate-500">{visibleSchedules.length} schedules</p>
        </div>

        <div className="divide-y divide-slate-100 bg-white">
          {loading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <div key={`passenger-schedule-skeleton-${index}`} className="px-4 py-4">
                <div className="skeleton h-4 w-1/2" />
                <div className="mt-2 skeleton h-3.5 w-1/3" />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="skeleton h-12 w-full" />
                  <div className="skeleton h-12 w-full" />
                  <div className="skeleton h-12 w-full" />
                  <div className="skeleton h-12 w-full" />
                </div>
              </div>
            ))
          ) : visibleSchedules.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">No schedules available for passenger view.</div>
          ) : (
            visibleSchedules.map((schedule) => {
              const stats = scheduleStats.get(schedule.id) || {
                bookings: 0,
                passengers: 0,
                paidRevenue: 0,
                pendingPayments: 0,
              };

              return (
                <article key={schedule.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-slate-900">{schedule.route}</p>
                      <p className="mt-1 text-xs text-slate-500">{schedule.busName || "Unassigned bus"}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDateLabel(schedule.date)} at {schedule.time || "--:--"}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={[
                        "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
                        schedule?.isActive === false
                          ? "bg-slate-100 text-slate-700"
                          : "bg-emerald-50 text-emerald-700",
                      ].join(" ")}>
                        {schedule?.isActive === false ? "Inactive" : "Active"}
                      </span>

                      <Link
                        to={`/operator/passengers/${schedule.id}`}
                        className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Open List
                      </Link>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-500">Bookings</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{stats.bookings}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-500">Passengers</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{stats.passengers}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-500">Paid Revenue</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(stats.paidRevenue)}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-500">Pending Payments</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{stats.pendingPayments}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-500">Ops Contact</p>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        Available in list
                      </p>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

