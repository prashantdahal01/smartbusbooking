import {
  BarChart3,
  BusFront,
  LayoutDashboard,
  Map,
  Settings,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { NavLink } from "react-router-dom";

const menuItems = [
  { label: "Dashboard", path: "/operator/dashboard", icon: LayoutDashboard },
  { label: "Bookings", path: "/operator/bookings", icon: Ticket },
  { label: "Routes", path: "/operator/routes", icon: Map },
  { label: "Buses", path: "/operator/buses", icon: BusFront },
  { label: "Passengers", path: "/operator/passengers", icon: Users },
  { label: "Reports", path: "/operator/reports", icon: BarChart3 },
  { label: "Settings", path: "/operator/settings", icon: Settings },
];

const baseLinkClass = "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200";

export default function Sidebar({ isOpen, onClose }) {
	return (
		<aside
			className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white transition-transform duration-300 lg:translate-x-0 ${
				isOpen ? "translate-x-0" : "-translate-x-full"
			}`}
		>
			<div className="flex h-20 items-center justify-between border-b border-slate-200 px-4">
				<div className="flex items-center gap-3">
					<div className="grid h-10 w-10 place-items-center rounded-xl bg-linear-to-br from-orange-500 to-amber-600 text-white shadow-sm">
						<BusFront className="h-5 w-5" />
					</div>
					<div>
						<p className="text-lg font-bold text-slate-900">SmartBus</p>
						<p className="text-xs text-slate-400">Operator Panel</p>
					</div>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:hidden"
					aria-label="Close sidebar"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			<div className="px-3 py-4">
				<p className="px-2 pb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Menu</p>

				<nav className="space-y-1">
					{menuItems.map((item) => {
						const Icon = item.icon;

						return (
							<NavLink
								key={item.path}
								to={item.path}
								onClick={onClose}
								className={({ isActive }) =>
									`${baseLinkClass} ${
										isActive
											? "bg-orange-50 text-orange-700 shadow-sm ring-1 ring-orange-100"
											: "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
