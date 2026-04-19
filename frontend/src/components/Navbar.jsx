// Top navigation bar with logo, links, and role-aware menu items
import { ChevronDown, LogOut, Settings, Ticket, UserPen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
	const navigate = useNavigate();
	const { currentUser, role, token, logout } = useAuth();
	const [menuOpen, setMenuOpen] = useState(false);
	const [isScrolled, setIsScrolled] = useState(false);
	const menuRef = useRef(null);

	const userName = String(currentUser?.name || "User").trim() || "User";
	const userEmail = String(currentUser?.email || "").trim();
	const initials = useMemo(() => {
		const fromName = userName
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join("");

		if (fromName) return fromName;
		return userEmail ? userEmail[0].toUpperCase() : "U";
	}, [userEmail, userName]);

	useEffect(() => {
		const onScroll = () => {
			setIsScrolled(window.scrollY > 6);
		};

		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			window.removeEventListener("scroll", onScroll);
		};
	}, []);

	useEffect(() => {
		const onDocumentClick = (event) => {
			if (!menuRef.current || menuRef.current.contains(event.target)) return;
			setMenuOpen(false);
		};

		document.addEventListener("mousedown", onDocumentClick);
		return () => {
			document.removeEventListener("mousedown", onDocumentClick);
		};
	}, []);

	const onLogout = () => {
		setMenuOpen(false);
		logout();
		navigate("/");
	};

	const closeMenu = () => {
		setMenuOpen(false);
	};

	const profileLink = role === "operator" ? "/operator/profile" : "/dashboard?view=profile";
	const settingsLink = role === "operator" ? "/operator/schedules" : "/dashboard?view=settings";
	const bookingsLink = role === "operator" ? "/operator/bookings" : "/dashboard?view=bookings";

	return (
		<div className={`sticky top-0 z-50 border-b border-violet-100/80 bg-white/90 backdrop-blur transition-shadow duration-300 ${isScrolled ? "shadow-[0_10px_26px_rgba(76,29,149,0.15)]" : ""}`}>
			<div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
				<Link to="/" className="text-base font-extrabold text-violet-700">
					SmartBus
				</Link>

				<nav className="flex flex-wrap items-center gap-3 text-sm">
					<Link to="/" className="font-medium text-slate-700 transition hover:text-violet-700">
						Home
					</Link>
					<Link to="/search" className="font-medium text-slate-700 transition hover:text-violet-700">
						Search
					</Link>
					{role === "customer" ? (
						<Link to="/dashboard?view=bookings" className="font-medium text-slate-700 transition hover:text-violet-700">
							My Bookings
						</Link>
					) : null}
					{role === "admin" ? (
						<>
							<Link to="/admin" className="font-medium text-slate-700 transition hover:text-violet-700">Admin</Link>
							<Link to="/admin/buses" className="font-medium text-slate-700 transition hover:text-violet-700">Buses</Link>
							<Link to="/admin/routes" className="font-medium text-slate-700 transition hover:text-violet-700">Routes</Link>
							<Link to="/admin/schedules" className="font-medium text-slate-700 transition hover:text-violet-700">Schedules</Link>
							<Link to="/admin/users" className="font-medium text-slate-700 transition hover:text-violet-700">Users</Link>
						</>
					) : null}
					{role === "operator" ? (
						<>
							<Link to="/operator/dashboard" className="font-medium text-slate-700 transition hover:text-violet-700">Operator</Link>
							<Link to="/operator/buses" className="font-medium text-slate-700 transition hover:text-violet-700">My Buses</Link>
							<Link to="/operator/schedules" className="font-medium text-slate-700 transition hover:text-violet-700">Schedules</Link>
						</>
					) : null}
				</nav>

				<div className="ml-auto flex items-center gap-3">
					{token ? (
						<div className="relative" ref={menuRef}>
							<button
								type="button"
								onClick={() => setMenuOpen((prev) => !prev)}
								className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm transition hover:border-violet-300"
							>
								<span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-sm font-extrabold text-violet-700">
									{initials}
								</span>

								<span className="hidden min-w-0 sm:block">
									<span className="block max-w-32 truncate text-sm font-semibold text-slate-900">{userName}</span>
									<span className="block max-w-40 truncate text-xs text-slate-500">{userEmail || role}</span>
								</span>

								<ChevronDown
									className={`h-4 w-4 text-slate-500 transition ${menuOpen ? "rotate-180 text-violet-600" : ""}`}
								/>
							</button>

							{menuOpen ? (
								<div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_40px_rgba(15,23,42,0.14)]">
									<div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
										<p className="truncate text-sm font-bold text-slate-900">{userName}</p>
										<p className="truncate text-xs text-slate-500">{userEmail || role}</p>
									</div>

									<div className="p-2">
										<Link
											to={profileLink}
											onClick={closeMenu}
											className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-violet-50 hover:text-violet-700"
										>
											<UserPen className="h-4 w-4" />
											Edit Profile
										</Link>

										<Link
											to={settingsLink}
											onClick={closeMenu}
											className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-violet-50 hover:text-violet-700"
										>
											<Settings className="h-4 w-4" />
											{role === "operator" ? "Manage Schedules" : "Account Settings"}
										</Link>

										<Link
											to={bookingsLink}
											onClick={closeMenu}
											className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-violet-50 hover:text-violet-700"
										>
											<Ticket className="h-4 w-4" />
											{role === "operator" ? "Operator Bookings" : "My Bookings"}
										</Link>

										<button
											type="button"
											onClick={onLogout}
											className="inline-flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
										>
											<LogOut className="h-4 w-4" />
											Logout
										</button>
									</div>
								</div>
							) : null}
						</div>
					) : (
						<>
							<Link
								to="/login"
								className="inline-flex items-center justify-center rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-800 shadow-sm transition hover:bg-violet-50"
							>
								Login
							</Link>
							<Link
								to="/register"
								className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
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
