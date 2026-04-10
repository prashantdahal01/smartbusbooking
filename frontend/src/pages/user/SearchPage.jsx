// Page for searching available buses by source, destination, and travel date
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getScheduleSearchOptions, searchSchedules } from "../../services/booking.service";
import BusCard from "../../components/BusCard";

export default function SearchPage() {
	const [searchParams, setSearchParams] = useSearchParams();

	const today = new Date();
	const yyyy = today.getFullYear();
	const mm = String(today.getMonth() + 1).padStart(2, "0");
	const dd = String(today.getDate()).padStart(2, "0");
	const defaultDate = `${yyyy}-${mm}-${dd}`;

	const initialSource = searchParams.get("source") || "";
	const initialDestination = searchParams.get("destination") || "";
	const initialDate = searchParams.get("date") || "";
	const initialHasAnyParam = Boolean(initialSource || initialDestination || initialDate);

	const [source, setSource] = useState(initialSource);
	const [destination, setDestination] = useState(initialDestination);
	const [date, setDate] = useState(initialDate);
	const [options, setOptions] = useState({ sources: [], destinations: [], pairs: [] });
	const [optionsError, setOptionsError] = useState("");
	const [results, setResults] = useState([]);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(initialHasAnyParam);
	const [hasSearched, setHasSearched] = useState(initialHasAnyParam);

	const normalized = (s) => String(s || "").trim().toLowerCase();
	const availableDestinations = useMemo(() => {
		const pairs = Array.isArray(options?.pairs) ? options.pairs : [];
		const dst = Array.isArray(options?.destinations) ? options.destinations : [];
		if (!source) return dst;
		const srcKey = normalized(source);
		const filtered = pairs
			.filter((p) => normalized(p?.source) === srcKey)
			.map((p) => String(p?.destination || "").trim())
			.filter(Boolean);
		return filtered.length ? [...new Set(filtered)] : dst;
	}, [options, source]);

	useEffect(() => {
		// load route options for dropdowns
		// eslint-disable-next-line no-void
		void (async () => {
			setOptionsError("");
			try {
				const data = await getScheduleSearchOptions();
				setOptions({
					sources: Array.isArray(data?.sources) ? data.sources : [],
					destinations: Array.isArray(data?.destinations) ? data.destinations : [],
					pairs: Array.isArray(data?.pairs) ? data.pairs : [],
				});
			} catch (e) {
				setOptionsError(e?.response?.data?.message || e.message || "Failed to load routes");
			}
		})();
	}, []);

	useEffect(() => {
		// If source changes, keep destination valid
		if (!destination) return;
		if (availableDestinations.includes(destination)) return;
		setDestination("");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [source]);

	const onSearch = async (e) => {
		e.preventDefault();
		setError("");
		setHasSearched(true);
		setLoading(true);
		try {
			const params = {};
			if (source.trim()) params.source = source.trim();
			if (destination.trim()) params.destination = destination.trim();
			if (date) params.date = date;
			setSearchParams(params, { replace: true });
			const data = await searchSchedules({
				source: source.trim(),
				destination: destination.trim(),
				date: date || undefined,
			});
			setResults(data);
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Search failed");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		const hasAnyParam = searchParams.has("source") || searchParams.has("destination") || searchParams.has("date");
		if (!hasAnyParam) return;
		setHasSearched(true);
		// auto-run search once when params are present
		// eslint-disable-next-line no-void
		void (async () => {
			setError("");
			setLoading(true);
				try {
					const data = await searchSchedules({
						source: source.trim(),
						destination: destination.trim(),
						date: date || undefined,
					});
				setResults(data);
			} catch (err) {
				setError(err?.response?.data?.message || err.message || "Search failed");
			} finally {
				setLoading(false);
			}
		})();
		// run only on first mount
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div className="mx-auto max-w-6xl px-4 py-10">
			<h2 className="text-2xl font-extrabold text-slate-900">Search Schedules</h2>
			<p className="mt-2 text-sm text-slate-600">Pick route and date to see available buses.</p>

			<div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
				{optionsError ? (
					<div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
						{optionsError}
					</div>
				) : null}
				<form onSubmit={onSearch} className="grid gap-4 sm:grid-cols-4 sm:items-end">
					<div>
						<label className="block text-sm font-medium text-slate-700">From</label>
						<select
							value={source}
							onChange={(e) => setSource(e.target.value)}
							required
							disabled={!options?.sources?.length}
							className="mt-2 w-full rounded-xl border border-slate-200 bg-white py-3 px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200 disabled:opacity-70"
						>
							<option value="">Select</option>
							{(options.sources || []).map((s) => (
								<option key={s} value={s}>{s}</option>
							))}
						</select>
					</div>
					<div>
						<label className="block text-sm font-medium text-slate-700">To</label>
						<select
							value={destination}
							onChange={(e) => setDestination(e.target.value)}
							required
							disabled={!availableDestinations.length}
							className="mt-2 w-full rounded-xl border border-slate-200 bg-white py-3 px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200 disabled:opacity-70"
						>
							<option value="">Select</option>
							{availableDestinations.map((d) => (
								<option key={d} value={d}>{d}</option>
							))}
						</select>
					</div>
					<div>
						<label className="block text-sm font-medium text-slate-700">Date</label>
						<input
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
							placeholder={defaultDate}
							className="mt-2 w-full rounded-xl border border-slate-200 bg-white py-3 px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
						/>
					</div>
					<button
						disabled={loading}
						type="submit"
						className="inline-flex items-center justify-center rounded-xl bg-orange-400 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 disabled:opacity-70"
					>
						{loading ? "Searching..." : "Search"}
					</button>
				</form>

				{error ? <div className="mt-4 text-sm">{error}</div> : null}
			</div>

			<div className="mt-8 grid gap-4">
				{results.map((s) => (
					<BusCard key={s._id} schedule={s} />
				))}
				{!loading && !error && results.length === 0 && hasSearched ? (
					<div className="text-sm text-slate-600">No buses found for the selected route/date.</div>
				) : null}
			</div>
		</div>
	);
}
