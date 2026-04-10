import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getScheduleSearchOptions } from "../../services/booking.service";

export default function HomePage() {
	const navigate = useNavigate();
	const [source, setSource] = useState("");
	const [destination, setDestination] = useState("");
	const [date, setDate] = useState("");
	const [options, setOptions] = useState({ sources: [], destinations: [], pairs: [] });
	const [optionsError, setOptionsError] = useState("");

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

	const onSearch = (e) => {
		e.preventDefault();
		const params = new URLSearchParams();
		if (source.trim()) params.set("source", source.trim());
		if (destination.trim()) params.set("destination", destination.trim());
		if (date) params.set("date", date);
		navigate(`/search?${params.toString()}`);
	};

	return (
		<div className="min-h-screen bg-gray-50">

			{/* HERO */}
			<div className="text-center py-16 px-4 bg-linear-to-r from-orange-500 to-orange-600 text-white">
				<h1 className="text-3xl sm:text-5xl font-bold">
					Book Your Bus, Smarter
				</h1>
				<p className="mt-4 text-sm sm:text-lg">
					Search, compare, and book bus tickets across Nepal easily.
				</p>
			</div>

			{/* SEARCH BOX */}
			<div className="max-w-4xl mx-auto -mt-10 px-4">
				<div className="bg-white shadow-lg rounded-xl p-6">
					{optionsError ? (
						<div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
							{optionsError}
						</div>
					) : null}

					<form onSubmit={onSearch} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<select
							value={source}
							onChange={(e) => setSource(e.target.value)}
							required
							disabled={!options?.sources?.length}
							className="p-3 border rounded-lg focus:ring-2 focus:ring-orange-400 disabled:opacity-70"
						>
							<option value="">From</option>
							{(options.sources || []).map((s) => (
								<option key={s} value={s}>{s}</option>
							))}
						</select>

						<select
							value={destination}
							onChange={(e) => setDestination(e.target.value)}
							required
							disabled={!availableDestinations.length}
							className="p-3 border rounded-lg focus:ring-2 focus:ring-orange-400 disabled:opacity-70"
						>
							<option value="">To</option>
							{availableDestinations.map((d) => (
								<option key={d} value={d}>{d}</option>
							))}
						</select>

						<input
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
							className="p-3 border rounded-lg focus:ring-2 focus:ring-orange-400"
						/>

						<button type="submit" className="bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-semibold">
							Search
						</button>
					</form>

					<div className="mt-4 text-center text-sm">
						New here?{" "}
						<Link className="text-orange-500 font-semibold" to="/register">
							Create Account
						</Link>{" "}
						or{" "}
						<Link className="text-orange-500 font-semibold" to="/login">
							Login
						</Link>
					</div>
				</div>
			</div>

			{/* FEATURES */}
			<div className="max-w-6xl mx-auto px-4 py-16">
				<h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
					Why SmartBus?
				</h2>

				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">

					<div className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition">
						<h3 className="font-semibold text-lg text-orange-500 mb-2">
							Real-time Availability
						</h3>
						<p className="text-gray-600 text-sm">
							Get instant updates on available seats.
						</p>
					</div>

					<div className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition">
						<h3 className="font-semibold text-lg text-orange-500 mb-2">
							Smart Search
						</h3>
						<p className="text-gray-600 text-sm">
							Find best routes quickly and easily.
						</p>
					</div>

					<div className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition">
						<h3 className="font-semibold text-lg text-orange-500 mb-2">
							Secure Payments
						</h3>
						<p className="text-gray-600 text-sm">
							Safe and reliable booking system.
						</p>
					</div>

				</div>
			</div>

		</div>
	);
}