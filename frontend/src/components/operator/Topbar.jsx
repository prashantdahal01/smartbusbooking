import { LogOut, Menu } from "lucide-react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const routeTitleByPrefix = {
	"/operator/dashboard": "Operator Dashboard",
	"/operator/buses": "Bus Management",
	"/operator/schedules": "Schedule Management",
	"/operator/bookings": "Booking Insights",
	"/operator/profile": "Profile",
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
					<p className="truncate text-xs text-slate-500">Signed in as {operatorName}</p>
				</div>

				<div className="ml-auto flex items-center gap-3">
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
