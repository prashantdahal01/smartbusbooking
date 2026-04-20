import { Bell, BusFront, CalendarDays, Settings, ShieldCheck, Ticket, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getOperatorBookings,
  getOperatorBuses,
  getOperatorSchedules,
  getProfileForOperator,
} from "../../services/operator.service";
import { formatCurrency } from "../../utils/helpers";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const toDateKey = (value) => {
  const text = String(value || "").trim();
  if (DATE_KEY_REGEX.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const isRevenueBooking = (booking) => {
  const status = String(booking?.status || "").trim().toLowerCase();
  const paymentStatus = String(booking?.paymentStatus || "").trim().toLowerCase();
  return status === "confirmed" && paymentStatus === "paid";
};

export default function OperatorSettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [profile, setProfile] = useState(null);
  const [buses, setBuses] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      setLoading(true);
      setError("");

      try {
        const [profilePayload, busRows, scheduleRows, bookingPayload] = await Promise.all([
          getProfileForOperator(),
          getOperatorBuses(),
          getOperatorSchedules(),
          getOperatorBookings(),
        ]);

        if (cancelled) return;

        setProfile(profilePayload || null);
        setBuses(Array.isArray(busRows) ? busRows : []);
        setSchedules(Array.isArray(scheduleRows) ? scheduleRows : []);
        setBookings(Array.isArray(bookingPayload?.items) ? bookingPayload.items : []);
      } catch (err) {
        if (cancelled) return;
        setError(err?.response?.data?.message || err?.message || "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const snapshot = useMemo(() => {
    const today = todayKey();
    const activeSchedules = schedules.filter((schedule) => schedule?.isActive !== false).length;
    const upcomingSchedules = schedules.filter((schedule) => {
      const departure = new Date(`${schedule?.date || ""}T${String(schedule?.time || "00:00").trim() || "00:00"}:00`).getTime();
      return Number.isFinite(departure) && departure >= Date.now();
    }).length;

    const todayRows = bookings.filter((booking) => {
      const scheduleDate = toDateKey(booking?.scheduleDate);
      if (scheduleDate && scheduleDate === today) return true;
      return toDateKey(booking?.bookedAt) === today;
    });

    const todayRevenue = todayRows.reduce((sum, booking) => {
      if (!isRevenueBooking(booking)) return sum;
      return sum + (Number(booking?.amount) || 0);
    }, 0);

    const pendingPayments = bookings.filter((booking) => String(booking?.paymentStatus || "").trim().toLowerCase() === "pending").length;
    const cancelledBookings = bookings.filter((booking) => String(booking?.status || "").trim().toLowerCase() === "cancelled").length;

    const latestBookingTs = bookings
      .map((booking) => new Date(booking?.bookedAt || 0).getTime())
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a)[0];

    return {
      activeSchedules,
      upcomingSchedules,
      todayBookings: todayRows.length,
      todayRevenue,
      pendingPayments,
      cancelledBookings,
      latestBookingAt: Number.isFinite(latestBookingTs) ? new Date(latestBookingTs).toLocaleString() : "No activity yet",
    };
  }, [bookings, schedules]);

  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "-";
    } catch {
      return "-";
    }
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
          <p className="text-sm text-slate-500">Account, security, and operational preferences for daily operator work.</p>
        </div>

        <Link
          to="/operator/profile"
          className="inline-flex h-10 items-center rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          Edit Profile
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="admin-surface p-5">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-orange-600" />
            <h3 className="text-lg font-bold text-slate-900">Account & Locale</h3>
          </div>

          {loading ? (
            <div className="mt-4 space-y-2">
              <div className="skeleton h-10 w-full" />
              <div className="skeleton h-10 w-full" />
              <div className="skeleton h-10 w-full" />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operator</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{profile?.name || "-"}</p>
                <p className="mt-0.5 text-xs text-slate-500">{profile?.email || "-"}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{profile?.phone || "-"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timezone</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{timezone}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="admin-surface p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h3 className="text-lg font-bold text-slate-900">Security & Access</h3>
          </div>

          {loading ? (
            <div className="mt-4 space-y-2">
              <div className="skeleton h-10 w-full" />
              <div className="skeleton h-10 w-full" />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">Role</p>
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  {String(profile?.role || "operator")}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">Recent booking activity</p>
                <span className="text-xs font-semibold text-slate-600">{snapshot.latestBookingAt}</span>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                Keep account credentials secure and rotate password regularly from the login recovery flow.
              </div>
            </div>
          )}
        </div>

        <div className="admin-surface p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-sky-600" />
            <h3 className="text-lg font-bold text-slate-900">Live Operational Snapshot</h3>
          </div>

          {loading ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`settings-skeleton-${index}`} className="skeleton h-20 w-full" />
              ))}
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Buses</p>
                <p className="mt-1 flex items-center gap-1.5 text-lg font-bold text-slate-900">
                  <BusFront className="h-4 w-4 text-orange-500" />
                  {buses.length}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Schedules</p>
                <p className="mt-1 flex items-center gap-1.5 text-lg font-bold text-slate-900">
                  <CalendarDays className="h-4 w-4 text-emerald-600" />
                  {snapshot.activeSchedules}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upcoming Trips</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{snapshot.upcomingSchedules}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today's Bookings</p>
                <p className="mt-1 flex items-center gap-1.5 text-lg font-bold text-slate-900">
                  <Ticket className="h-4 w-4 text-blue-600" />
                  {snapshot.todayBookings}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today's Revenue</p>
                <p className="mt-1 flex items-center gap-1.5 text-lg font-bold text-slate-900">
                  <Wallet className="h-4 w-4 text-emerald-600" />
                  {formatCurrency(snapshot.todayRevenue)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alerts</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{snapshot.pendingPayments + snapshot.cancelledBookings}</p>
                <p className="text-[11px] text-slate-500">{snapshot.pendingPayments} pending, {snapshot.cancelledBookings} cancelled</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

