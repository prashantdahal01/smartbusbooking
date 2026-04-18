import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { searchAdminResources } from "../../services/admin.service";

const resultShape = { users: [], routes: [], bookings: [] };

export default function GlobalSearch() {
  const navigate = useNavigate();
  const wrapperRef = useRef(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(resultShape);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setResults(resultShape);
      setLoading(false);
      setError("");
      return undefined;
    }

    setLoading(true);
    setError("");

    const timer = setTimeout(async () => {
      try {
        const data = await searchAdminResources(value);
        setResults({
          users: Array.isArray(data?.users) ? data.users : [],
          routes: Array.isArray(data?.routes) ? data.routes : [],
          bookings: Array.isArray(data?.bookings) ? data.bookings : [],
        });
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Search failed");
      } finally {
        setLoading(false);
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [query]);

  const hasAnyResult = useMemo(() => {
    return results.users.length > 0 || results.routes.length > 0 || results.bookings.length > 0;
  }, [results]);

  const openResult = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="relative hidden w-full max-w-xl md:block" ref={wrapperRef}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search users, routes, bookings..."
        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-20 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-200 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-400 dark:focus:border-blue-700 dark:focus:bg-slate-900 dark:focus:ring-blue-900/50"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-900">
        Ctrl K
      </span>

      {open ? (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-104 overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {loading ? (
            <div className="grid place-items-center py-8 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          ) : query.trim().length < 2 ? (
            <div className="px-2 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Type at least 2 characters to search.
            </div>
          ) : !hasAnyResult ? (
            <div className="px-2 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No matching users, routes, or bookings.
            </div>
          ) : (
            <div className="space-y-3">
              {results.users.length > 0 ? (
                <div>
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Users</p>
                  <div className="space-y-1">
                    {results.users.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => openResult(`/admin/users?search=${encodeURIComponent(user.name || user.email || "")}`)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span className="truncate">{user.name || user.email}</span>
                        <span className="text-xs text-slate-400">{user.role}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {results.routes.length > 0 ? (
                <div>
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Routes</p>
                  <div className="space-y-1">
                    {results.routes.map((route) => (
                      <button
                        key={route.id}
                        type="button"
                        onClick={() => openResult(`/admin/routes?search=${encodeURIComponent(route.route || "")}`)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span className="truncate">{route.route}</span>
                        <span className="text-xs text-slate-400">{route.distance} km</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {results.bookings.length > 0 ? (
                <div>
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Bookings</p>
                  <div className="space-y-1">
                    {results.bookings.map((booking) => (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => openResult(`/admin/bookings?search=${encodeURIComponent(booking.id || "")}`)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span className="truncate">{booking.user} - {booking.route}</span>
                        <span className="text-xs text-slate-400">{booking.status}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
