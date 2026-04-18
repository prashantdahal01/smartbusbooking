import { NavLink } from "react-router-dom";
import {
  BusFront,
  CalendarDays,
  LayoutDashboard,
  Map,
  MapPin,
  Settings,
  Ticket,
  Users,
  X,
} from "lucide-react";

const menuItems = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "Buses", path: "/admin/buses", icon: BusFront },
  { label: "Routes", path: "/admin/routes", icon: Map },
  { label: "Stops", path: "/admin/stops", icon: MapPin },
  { label: "Schedules", path: "/admin/schedules", icon: CalendarDays },
  { label: "Bookings", path: "/admin/bookings", icon: Ticket },
  { label: "Users", path: "/admin/users", icon: Users },
  { label: "Settings", path: "/admin/settings", icon: Settings },
];

const baseLinkClass =
  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200";

export default function Sidebar({ isOpen, onClose }) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-60 border-r border-slate-200 bg-white transition-transform duration-300 dark:border-slate-800 dark:bg-slate-900 lg:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex h-20 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white shadow-sm">
            <BusFront className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">SmartBus</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Admin Panel</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 lg:hidden"
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 py-4">
        <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Menu</p>

        <nav className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/admin"}
                onClick={onClose}
                className={({ isActive }) =>
                  `${baseLinkClass} ${
                    isActive
                      ? "bg-blue-50 text-blue-600 shadow-sm dark:bg-blue-900/40 dark:text-blue-300"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  }`
                }
              >
                <Icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}