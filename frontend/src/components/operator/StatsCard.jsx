import { ArrowUpRight } from "lucide-react";

const accentMap = {
	blue: "bg-blue-100 text-blue-700",
	emerald: "bg-emerald-100 text-emerald-700",
	amber: "bg-amber-100 text-amber-700",
	rose: "bg-rose-100 text-rose-700",
	slate: "bg-slate-100 text-slate-700",
};

export default function StatsCard({ label, value, helper = "", icon: Icon, accent = "blue" }) {
	const accentClass = accentMap[accent] || accentMap.blue;

	return (
		<article className="admin-surface admin-surface-hover p-5">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-sm font-medium text-slate-500">{label}</p>
					<p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
					{helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
				</div>
				<div className={`grid h-11 w-11 place-items-center rounded-xl ${accentClass}`}>
					{Icon ? <Icon className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
				</div>
			</div>
		</article>
	);
}
