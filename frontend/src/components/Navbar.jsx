// Top navigation bar with logo, links, and role-aware menu items
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
	const navigate = useNavigate();
	const { currentUser, role, token, logout } = useAuth();

	const onLogout = () => {
		logout();
		navigate("/");
	};

	return (
		<div className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur">
			<div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
				<Link to="/" className="text-base font-extrabold text-orange-500">
					SmartBus
				</Link>

				<nav className="flex flex-wrap items-center gap-3 text-sm">
					<Link to="/" className="font-medium text-slate-700 hover:text-orange-500">
						Home
					</Link>
					<Link to="/search" className="font-medium text-slate-700 hover:text-orange-500">
						Search
					</Link>
					{role === "customer" ? (
						<Link to="/dashboard" className="font-medium text-slate-700 hover:text-orange-500">
							My Bookings
						</Link>
					) : null}
					{role === "admin" ? (
						<>
							<Link to="/admin" className="font-medium text-slate-700 hover:text-orange-500">Admin</Link>
							<Link to="/admin/buses" className="font-medium text-slate-700 hover:text-orange-500">Buses</Link>
							<Link to="/admin/routes" className="font-medium text-slate-700 hover:text-orange-500">Routes</Link>
							<Link to="/admin/schedules" className="font-medium text-slate-700 hover:text-orange-500">Schedules</Link>
							<Link to="/admin/users" className="font-medium text-slate-700 hover:text-orange-500">Users</Link>
						</>
					) : null}
					{role === "operator" ? (
						<>
							<Link to="/operator" className="font-medium text-slate-700 hover:text-orange-500">Operator</Link>
							<Link to="/operator/buses" className="font-medium text-slate-700 hover:text-orange-500">My Buses</Link>
						</>
					) : null}
				</nav>

				<div className="ml-auto flex items-center gap-3">
					{token ? (
						<>
							<span className="hidden text-xs text-slate-600 sm:inline">
								{currentUser?.email} ({role})
							</span>
							<button
								onClick={onLogout}
								className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
							>
								Logout
							</button>
						</>
					) : (
						<>
							<Link
								to="/login"
								className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
							>
								Login
							</Link>
							<Link
								to="/register"
								className="inline-flex items-center justify-center rounded-xl bg-orange-400 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
							>
								Register
							</Link>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
