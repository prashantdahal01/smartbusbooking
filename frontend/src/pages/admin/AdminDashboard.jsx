// Admin overview page with system-wide statistics and quick-action links
import { Link } from "react-router-dom";

export default function AdminDashboard() {
	return (
		<div className="mx-auto max-w-6xl px-4 py-10">
			<div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
				<h2 className="text-2xl font-extrabold text-slate-900">Admin Dashboard</h2>
				<p className="mt-1 text-sm text-slate-600">Use these pages to manage system data.</p>

				<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<Link className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-900 hover:bg-slate-100" to="/admin/buses">
						Manage buses
					</Link>
					<Link className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-900 hover:bg-slate-100" to="/admin/routes">
						Manage routes
					</Link>
					<Link className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-900 hover:bg-slate-100" to="/admin/stops">
						Manage stops
					</Link>
					<Link className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-900 hover:bg-slate-100" to="/admin/schedules">
						Manage schedules
					</Link>
					<Link className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-900 hover:bg-slate-100" to="/admin/users">
						View users
					</Link>
				</div>

				<p className="mt-6 text-xs text-slate-500">
					Tip: run backend seed to create demo admin/operator/customer accounts and sample schedules.
				</p>
			</div>
		</div>
	);
}
