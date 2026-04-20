import { ChevronDown, LogOut, Menu, UserCircle2 } from "lucide-react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const routeTitleByPrefix = {
	"/operator/dashboard": "Operator Dashboard",
	"/operator/bookings": "Bookings",
	"/operator/routes": "Routes",
	"/operator/buses": "Buses",
	"/operator/passengers": "Passengers",
	"/operator/reports": "Reports",
	"/operator/settings": "Settings",
};

const resolveTitle = (pathname) => {
	const found = Object.entries(routeTitleByPrefix).find(([prefix]) => pathname.startsWith(prefix));
	return found ? found[1] : "Operator Panel";
};

export default function Topbar({ onToggleSidebar }) {
	const navigate = useNavigate();
	const location = useLocation();
	const { currentUser, logout } = useAuth();

	const title = useMemo(() => resolveTitle(location.pathname), [location.pathname]);
	const operatorName = String(currentUser?.name || currentUser?.email || "Operator").trim() || "Operator";
	const operatorEmail = String(currentUser?.email || "").trim();
	const initials = operatorName
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((t) => t[0]?.toUpperCase())
		.join("") || "OP";

	const onLogout = () => {
		logout();
		navigate("/");
	};

	return (
		<header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
			<div className="flex h-20 items-center gap-3 px-4 sm:px-6">
				<button
					type="button"
					onClick={onToggleSidebar}
					className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 lg:hidden"
					aria-label="Open sidebar"
				>
					<Menu className="h-5 w-5" />
				</button>

				<div className="min-w-0">
					<p className="truncate text-lg font-bold text-slate-900">{title}</p>
					<p className="truncate text-xs text-slate-500">Manage your routes, buses, and bookings</p>
				</div>

				<div className="ml-auto flex items-center gap-3">
					<div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left sm:flex">
						<div className="grid h-9 w-9 place-items-center rounded-xl bg-orange-100 text-xs font-bold text-orange-700">
							{initials}
						</div>
						<div className="min-w-0">
							<p className="truncate text-sm font-semibold text-slate-900">{operatorName}</p>
							<p className="truncate text-xs text-slate-500">{operatorEmail || "Operator account"}</p>
						</div>
						<ChevronDown className="h-4 w-4 text-slate-400" />
					</div>

					<button
						type="button"
						onClick={() => navigate("/operator/settings")}
						className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
					>
						<UserCircle2 className="h-4 w-4" />
						Profile
					</button>
					<button
						type="button"
						onClick={onLogout}
						className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
					>
						<LogOut className="h-4 w-4" />
						Logout
					</button>
				</div>
			</div>
		</header>
	);
}
