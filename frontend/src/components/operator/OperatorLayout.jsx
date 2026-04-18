import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function OperatorLayout() {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const location = useLocation();

	useEffect(() => {
		setSidebarOpen(false);
	}, [location.pathname]);

	return (
		<div className="min-h-screen bg-slate-100">
			<Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

			{sidebarOpen ? (
				<button
					type="button"
					onClick={() => setSidebarOpen(false)}
					className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
					aria-label="Close sidebar backdrop"
				/>
			) : null}

			<div className="lg:pl-64">
				<Topbar onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />

				<main className="px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-6">
					<div className="mx-auto max-w-7xl">
						<Outlet />
					</div>
				</main>
			</div>
		</div>
	);
}
