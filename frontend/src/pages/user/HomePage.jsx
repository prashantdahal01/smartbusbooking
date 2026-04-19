import {
	Armchair,
  ArrowRight,
  BusFront,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  MapPinned,
  Search,
  ShieldCheck,
	Snowflake,
  Sparkles,
  Ticket,
	Wifi,
	Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import DatePicker from "../../components/search/DatePicker";
import LocationAutocompleteInput from "../../components/search/LocationAutocompleteInput";
import { getPopularRoutes, searchSchedules } from "../../services/booking.service";
import { getBusTypeLabels } from "../../utils/busTypeUtils";
import { formatCurrency, getBusImageUrl } from "../../utils/helpers";

const ROUTE_CARD_TONES = [
	"from-orange-500 to-amber-500",
	"from-sky-500 to-cyan-500",
	"from-emerald-500 to-teal-500",
	"from-fuchsia-500 to-rose-500",
	"from-indigo-500 to-violet-500",
	"from-rose-500 to-red-500",
];

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: "Secure Booking",
    text: "Payments and passenger data are protected with trusted encryption.",
  },
  {
    icon: Ticket,
    title: "Instant Confirmation",
    text: "Get e-ticket confirmation right after successful payment.",
  },
  {
    icon: BusFront,
    title: "Live Seat Selection",
    text: "Pick seats with real-time availability before checkout.",
  },
  {
    icon: MapPinned,
    title: "Multiple Boarding Points",
    text: "Flexible pickup and drop points across major cities.",
  },
];

const HOW_IT_WORKS = [
  {
    icon: Search,
    step: "1",
    title: "Search Route",
    text: "Choose source, destination and travel date.",
  },
  {
    icon: BusFront,
    step: "2",
    title: "Select Bus & Seats",
    text: "Compare available buses and reserve your preferred seats.",
  },
  {
    icon: CalendarDays,
    step: "3",
    title: "Enter Passenger Info",
    text: "Provide traveler details and boarding preferences.",
  },
  {
    icon: CreditCard,
    step: "4",
    title: "Pay & Travel",
    text: "Complete payment and receive your ticket instantly.",
  },
];

const TESTIMONIALS = [
  {
    quote: "Super smooth booking flow. I booked Kathmandu to Pokhara in under two minutes.",
    name: "Aarav Sharma",
    city: "Kathmandu",
  },
  {
    quote: "Seat selection is clear and fast. I could instantly see what was available.",
    name: "Priya Thapa",
    city: "Pokhara",
  },
  {
    quote: "Reliable platform with easy payment and clear trip details.",
    name: "Bijay Rai",
    city: "Biratnagar",
  },
];

export default function HomePage() {
	const navigate = useNavigate();
	const today = new Date();
	const yyyy = today.getFullYear();
	const mm = String(today.getMonth() + 1).padStart(2, "0");
	const dd = String(today.getDate()).padStart(2, "0");
	const todayDate = `${yyyy}-${mm}-${dd}`;

	const [source, setSource] = useState("");
	const [destination, setDestination] = useState("");
	const [date, setDate] = useState("");
	const [popularRoutes, setPopularRoutes] = useState([]);
	const [popularLoading, setPopularLoading] = useState(true);
	const [popularError, setPopularError] = useState("");
	const [featuredSchedules, setFeaturedSchedules] = useState([]);
	const [featuredLoading, setFeaturedLoading] = useState(true);
	const [featuredError, setFeaturedError] = useState("");

	const normalized = (value) => String(value || "").trim().toLowerCase();
	const normalizeDateKey = (value) => {
		const raw = String(value || "").trim();
		if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
		return raw;
	};

	const formatDateLabel = (dateKey) => {
		const safeKey = normalizeDateKey(dateKey);
		if (!safeKey) return "Date TBD";
		const date = new Date(`${safeKey}T00:00:00`);
		if (Number.isNaN(date.getTime())) return safeKey;
		return date.toLocaleDateString(undefined, {
			day: "2-digit",
			month: "short",
			year: "numeric",
		});
	};

	const formatDurationLabel = (minutes) => {
		const value = Number(minutes);
		if (!Number.isFinite(value) || value <= 0) return "N/A";
		const hours = Math.floor(value / 60);
		const mins = Math.round(value % 60);
		if (hours <= 0) return `${mins}m`;
		if (mins <= 0) return `${hours}h`;
		return `${hours}h ${mins}m`;
	};

	const toTitleLabel = (value) => String(value || "")
		.trim()
		.replace(/[\s_-]+/g, " ")
		.split(" ")
		.filter(Boolean)
		.map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
		.join(" ");

	const parseTimeToMinutes = (value) => {
		const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
		if (!match) return null;
		const hour = Number(match[1]);
		const minute = Number(match[2]);
		if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
		if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
		return (hour * 60) + minute;
	};

	const formatMinutesAsTime = (minutes) => {
		const dayMinutes = 24 * 60;
		const safe = ((Math.round(minutes) % dayMinutes) + dayMinutes) % dayMinutes;
		const hour24 = Math.floor(safe / 60);
		const minute = safe % 60;
		const suffix = hour24 >= 12 ? "PM" : "AM";
		const hour12 = hour24 % 12 || 12;
		return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
	};

	const formatTimeLabel = (value) => {
		const raw = String(value || "").trim();
		if (!raw) return "--";
		if (/(am|pm)$/i.test(raw)) {
			return raw.replace(/\s+/g, " ").toUpperCase();
		}
		const minutes = parseTimeToMinutes(raw);
		if (minutes === null) return raw;
		return formatMinutesAsTime(minutes);
	};

	const getArrivalTimeLabel = (schedule) => {
		if (schedule?.arrivalTime) return formatTimeLabel(schedule.arrivalTime);

		const departureMinutes = parseTimeToMinutes(schedule?.time);
		const durationMinutes = Number(schedule?.durationMinutes);
		if (departureMinutes === null || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
			return "--";
		}

		return formatMinutesAsTime(departureMinutes + durationMinutes);
	};

	const getStartingPrice = (schedule) => {
		const directPrice = Number(schedule?.price);
		if (Number.isFinite(directPrice) && directPrice > 0) return directPrice;

		const deckPrices = (Array.isArray(schedule?.bus?.decks) ? schedule.bus.decks : [])
			.flatMap((deck) => (Array.isArray(deck?.seats) ? deck.seats : []))
			.map((seat) => Number(seat?.price))
			.filter((price) => Number.isFinite(price) && price > 0);

		if (deckPrices.length > 0) return Math.min(...deckPrices);
		return null;
	};

	const getAmenityLabels = (schedule) => {
		const labels = [];
		const seen = new Set();

		const addLabel = (raw) => {
			const label = toTitleLabel(raw);
			const key = normalized(label);
			if (!label || !key || seen.has(key)) return;
			seen.add(key);
			labels.push(label);
		};

		getBusTypeLabels(schedule?.bus).forEach(addLabel);
		(Array.isArray(schedule?.amenities) ? schedule.amenities : []).forEach(addLabel);

		return labels.slice(0, 3);
	};

	const buildRouteKey = (sourceValue, destinationValue) => `${normalized(sourceValue)}__${normalized(destinationValue)}`;

	const routePreviewImageByKey = useMemo(() => {
		const map = new Map();

		(Array.isArray(featuredSchedules) ? featuredSchedules : []).forEach((schedule) => {
			const key = buildRouteKey(schedule?.route?.source, schedule?.route?.destination);
			if (!key || map.has(key)) return;

			const image = getBusImageUrl(schedule?.bus, "bus");
			if (!image) return;

			map.set(key, image);
		});

		return map;
	}, [featuredSchedules]);

	useEffect(() => {
		// Load popular routes based on admin-created routes and real bookings/schedules.
		// eslint-disable-next-line no-void
		void (async () => {
			setPopularLoading(true);
			setPopularError("");
			try {
				const data = await getPopularRoutes(4);
				setPopularRoutes(Array.isArray(data) ? data : []);
			} catch (error) {
				setPopularRoutes([]);
				setPopularError(error?.response?.data?.message || error?.message || "Unable to load popular routes");
			} finally {
				setPopularLoading(false);
			}
		})();
	}, []);

	useEffect(() => {
		// Load upcoming schedules (all future dates) so visitors can browse beyond today's buses.
		// eslint-disable-next-line no-void
		void (async () => {
			setFeaturedLoading(true);
			setFeaturedError("");
			try {
				const data = await searchSchedules({});
				const allSchedules = Array.isArray(data) ? data : [];

				const upcomingSchedules = allSchedules
					.filter((schedule) => {
						const scheduleDate = normalizeDateKey(schedule?.date);
						if (!scheduleDate) return false;
						return scheduleDate >= todayDate;
					})
					.sort((a, b) => {
						const dateA = normalizeDateKey(a?.date);
						const dateB = normalizeDateKey(b?.date);
						if (dateA !== dateB) return dateA.localeCompare(dateB);

						const timeA = parseTimeToMinutes(a?.time);
						const timeB = parseTimeToMinutes(b?.time);
						const safeA = Number.isFinite(timeA) ? timeA : Number.MAX_SAFE_INTEGER;
						const safeB = Number.isFinite(timeB) ? timeB : Number.MAX_SAFE_INTEGER;
						return safeA - safeB;
					});

				setFeaturedSchedules(upcomingSchedules);
			} catch (error) {
				setFeaturedSchedules([]);
				setFeaturedError(error?.response?.data?.message || error?.message || "Unable to load featured buses");
			} finally {
				setFeaturedLoading(false);
			}
		})();
	}, [todayDate]);

	const onSearch = (event) => {
		event.preventDefault();
		const params = new URLSearchParams();
		if (source.trim()) params.set("source", source.trim());
		if (destination.trim()) params.set("destination", destination.trim());
		if (date) params.set("date", date);
		navigate(`/search?${params.toString()}`);
	};

	const openPopularRoute = (route) => {
		const params = new URLSearchParams();
		params.set("source", route.source);
		params.set("destination", route.destination);
		if (date) params.set("date", date);
		navigate(`/search?${params.toString()}`);
	};

	return (
		<div className="relative min-h-screen overflow-hidden bg-[#f6f9ff] text-slate-900">
			<div className="public-grid-bg pointer-events-none absolute inset-0 opacity-75" />
			<div className="public-float-slow pointer-events-none absolute -left-16 -top-20 h-72 w-72 rounded-full bg-orange-300/50 blur-3xl" />
			<div className="public-float-slow pointer-events-none absolute -bottom-10 right-0 h-72 w-72 rounded-full bg-sky-200/60 blur-3xl [animation-delay:1.2s]" />

			<main className="relative mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
				<section className="grid items-start gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
					<div className="public-fade-up space-y-6">
						<div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-700 shadow-sm backdrop-blur">
							<Sparkles className="h-3.5 w-3.5" />
							Public Booking Portal
						</div>

						<h1 className="display-title max-w-2xl text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl lg:text-6xl">
							Book Bus Tickets Across Nepal Easily
						</h1>

						<p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
							Fast, secure, and reliable seat booking with real-time availability.
							 Explore routes, compare buses, and book from anywhere.
						</p>

						<div className="flex flex-wrap gap-3">
							<Link
								to="/search"
								className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-300/60 transition hover:-translate-y-0.5 hover:bg-slate-800"
							>
								Browse Buses
								<ArrowRight className="h-4 w-4" />
							</Link>
							<Link
								to="/register"
								className="inline-flex items-center rounded-xl border border-slate-300 bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400"
							>
								Create Account
							</Link>
						</div>

						<div className="grid gap-3 pt-1 sm:grid-cols-3">
							<div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
								<div className="text-lg font-extrabold text-slate-900">50+</div>
								<div className="text-xs text-slate-600">Cities Covered</div>
							</div>
							<div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
								<div className="text-lg font-extrabold text-slate-900">Live</div>
								<div className="text-xs text-slate-600">Seat Availability</div>
							</div>
							<div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
								<div className="text-lg font-extrabold text-slate-900">24/7</div>
								<div className="text-xs text-slate-600">Booking Access</div>
							</div>
						</div>
					</div>

					<div className="public-fade-up rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-xl shadow-slate-200/70 backdrop-blur [animation-delay:0.12s] sm:p-7">
						<div className="mb-4 flex items-center justify-between">
							<div>
								<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Plan Your Trip</p>
								<h2 className="display-title mt-1 text-2xl font-bold text-slate-900">Search Buses</h2>
							</div>
							<Clock3 className="h-5 w-5 text-orange-500" />
						</div>

						<form onSubmit={onSearch} autoComplete="off" className="space-y-3">
							<div className="grid gap-3 sm:grid-cols-2">
								<LocationAutocompleteInput
									id="home-source"
									labelContent="From"
									labelClassName="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
									value={source}
									onValueChange={setSource}
									required
									placeholder="Kathmandu"
									debounceMs={300}
									limit={10}
									inputClassName="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
									highlightClassName="font-semibold text-orange-600"
								/>

								<LocationAutocompleteInput
									id="home-destination"
									labelContent="To"
									labelClassName="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
									value={destination}
									onValueChange={setDestination}
									required
									placeholder="Pokhara"
									debounceMs={300}
									limit={10}
									inputClassName="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
									highlightClassName="font-semibold text-orange-600"
								/>
							</div>

							<div>
								<span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
									Travel Date
								</span>
								<DatePicker
									value={date}
									onChange={setDate}
									minDate={todayDate}
								/>
							</div>

							<button
								type="submit"
								className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-300/60 transition hover:-translate-y-0.5 hover:bg-orange-600"
							>
								<Search className="h-4 w-4" />
								Search Buses
							</button>
						</form>

						<p className="mt-4 text-xs text-slate-500">
							Guests can browse schedules and seats. Login is needed only for final booking and payment.
						</p>
					</div>
				</section>

				<section className="mt-16 public-fade-up [animation-delay:0.2s]">
					<div className="flex flex-wrap items-end justify-between gap-3">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Popular Routes</p>
							<h2 className="display-title mt-1 text-3xl font-bold text-slate-900">Most Booked Routes Across Nepal</h2>
						</div>
					</div>

					{popularLoading ? (
						<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<div className="skeleton h-72" />
							<div className="skeleton h-72" />
							<div className="skeleton h-72" />
							<div className="skeleton h-72" />
						</div>
					) : null}

					{!popularLoading && popularError ? (
						<div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
							{popularError}
						</div>
					) : null}

					{!popularLoading && !popularError ? (
						<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							{popularRoutes.length > 0 ? (
								popularRoutes.map((route, index) => {
									const tone = ROUTE_CARD_TONES[index % ROUTE_CARD_TONES.length];
									const fareText = route?.minSeatPrice
										? formatCurrency(route.minSeatPrice)
										: "No fare data";
									const imageKey = buildRouteKey(route?.source, route?.destination);
									const previewImage = routePreviewImageByKey.get(imageKey);

									return (
										<article
											key={route.routeId || `${route.source}-${route.destination}`}
											className="group overflow-hidden rounded-[18px] border border-[#d9d9e8] bg-white shadow-[0_8px_24px_rgba(33,39,70,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(93,55,235,0.16)]"
										>
											<div className="relative h-40 overflow-hidden bg-slate-100">
												{previewImage ? (
													<img
														src={previewImage}
														alt={`${route.source} to ${route.destination}`}
														loading="lazy"
														decoding="async"
														className="h-full w-full object-cover"
													/>
												) : (
													<div className={`h-full w-full bg-linear-to-r ${tone}`} />
												)}
												<div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-white via-white/70 to-transparent" />
												<div className="absolute left-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-[#4d4978] backdrop-blur">
													{fareText}
												</div>
												<div className="absolute right-3 top-3 rounded-full bg-[#d8f7c8] px-2.5 py-1 text-[11px] font-semibold text-[#217a36]">
													{formatDurationLabel(route?.avgDurationMinutes)}
												</div>
											</div>

											<div className="space-y-2 px-4 pb-4 pt-3">
												<div className="text-base font-bold text-[#1b1743]">{route.source} -&gt; {route.destination}</div>
												<p className="text-xs text-[#67648b]">
												{route?.bookingCount > 0
													? `${route.bookingCount} confirmed bookings`
													: `${route?.scheduleCount || 0} active schedules`}
												</p>

												<div className="flex flex-wrap gap-2 text-[11px] text-[#5f5b83]">
												{route?.distance ? (
														<span className="rounded-full bg-[#f2f1fb] px-2 py-1">{route.distance} km</span>
												) : null}
													<span className="rounded-full bg-[#f2f1fb] px-2 py-1">{route?.scheduleCount || 0} schedules</span>
											</div>

												<button
												type="button"
												onClick={() => openPopularRoute(route)}
													className="inline-flex items-center gap-2 rounded-lg bg-linear-to-r from-[#7c46ff] to-[#5935e9] px-3 py-2 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(103,60,255,0.35)] transition hover:from-[#6f3fff] hover:to-[#4d2fe0]"
											>
												Search
												<ArrowRight className="h-3.5 w-3.5" />
											</button>
											</div>
										</article>
									);
								})
							) : (
								<div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 sm:col-span-2 lg:col-span-4">
									No routes available yet. Add routes from the admin panel to show them here.
								</div>
							)}
						</div>
					) : null}
				</section>

				<section className="mt-16 public-fade-up [animation-delay:0.28s]">
					<div className="text-center">
						<p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Available Buses</p>
						<h2 className="display-title mt-1 text-4xl font-extrabold text-[#15193d]">Available Buses</h2>
						<p className="mt-2 text-lg text-[#625f87]">Browse and book from our wide selection</p>
						<Link to="/search" className="mt-3 inline-block text-sm font-semibold text-[#6843f6] hover:text-[#5330de]">
							View all schedules
						</Link>
					</div>

					{featuredLoading ? (
						<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							<div className="skeleton h-96" />
							<div className="skeleton h-96" />
							<div className="skeleton h-96" />
						</div>
					) : null}

					{!featuredLoading && featuredError ? (
						<div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
							{featuredError}
						</div>
					) : null}

					{!featuredLoading && !featuredError ? (
						<div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
							{featuredSchedules.length > 0 ? (
								featuredSchedules.map((schedule) => {
									const busImage = getBusImageUrl(schedule?.bus, "bus");
									const title = String(schedule?.bus?.name || "Bus Service").trim();
									const sourceLabel = String(schedule?.route?.source || "").trim();
									const destinationLabel = String(schedule?.route?.destination || "").trim();
									const travelDateLabel = formatDateLabel(schedule?.date);
									const departureTimeLabel = formatTimeLabel(schedule?.time);
									const arrivalTimeLabel = getArrivalTimeLabel(schedule);
									const seatCount = Number(schedule?.bus?.totalSeats);
									const badgeLabel = getBusTypeLabels(schedule?.bus)[0] || toTitleLabel(schedule?.bus?.type) || "Bus";
									const amenityLabels = getAmenityLabels(schedule).slice(0, 2);
									const startingPrice = getStartingPrice(schedule);

									return (
										<article
											key={schedule._id}
											className="flex min-h-107.5 flex-col overflow-hidden rounded-[18px] border border-[#d9d9e8] bg-white shadow-[0_8px_24px_rgba(33,39,70,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(93,55,235,0.16)]"
										>
											<div className="relative h-42.5 overflow-hidden bg-slate-100">
												{busImage ? (
													<img
														src={busImage}
														alt={title}
														loading="lazy"
														decoding="async"
														className="h-full w-full object-cover"
													/>
												) : (
													<div className="flex h-full w-full items-center justify-center bg-linear-to-br from-slate-300 to-slate-200 text-slate-600">
														<BusFront className="h-8 w-8" />
													</div>
												)}
												<div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-white via-white/70 to-transparent" />
												<div className="absolute left-3 top-3 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-[#4d4978] backdrop-blur">
													{travelDateLabel}
												</div>
												<div className="absolute right-3 top-3 rounded-full bg-[#d4f7bf] px-3 py-1 text-xs font-semibold text-[#227936]">
													{badgeLabel}
												</div>
											</div>

											<div className="flex flex-1 flex-col space-y-3 px-5 pb-5 pt-4">
												<div>
													<h3 className="text-[clamp(1.38rem,1.3rem+0.32vw,1.72rem)] font-extrabold leading-tight text-[#1a1742]">{title}</h3>
													<p className="mt-1 text-[15px] text-[#66638a]">{sourceLabel} -&gt; {destinationLabel}</p>
												</div>

												<div className="border-y border-[#e7e6f2] py-3 text-sm text-[#2c2852]">
													<div className="flex items-center gap-2">
														<Clock3 className="h-4 w-4 text-[#6a668d]" />
														<span className="font-semibold">{departureTimeLabel}</span>
														<ArrowRight className="h-4 w-4 text-[#8f8aac]" />
														<span className="font-semibold">{arrivalTimeLabel}</span>
													</div>
												</div>

												<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#5c587d]">
													{Number.isFinite(seatCount) && seatCount > 0 ? (
														<span className="inline-flex items-center gap-1.5"><Armchair className="h-3.5 w-3.5" />{seatCount} seats</span>
													) : null}

													{amenityLabels.map((label) => {
														const icon = /wifi/i.test(label)
															? <Wifi className="h-3.5 w-3.5" />
															: /ac/i.test(label)
																? <Snowflake className="h-3.5 w-3.5" />
																: <Zap className="h-3.5 w-3.5" />;

														return (
															<span key={`${schedule._id}-${label}`} className="inline-flex items-center gap-1.5">
																{icon}
																{label}
															</span>
														);
													})}
												</div>

												<div className="mt-auto flex items-center justify-between gap-3 pt-1">
													<div>
														<p className="text-xs font-semibold uppercase tracking-wide text-[#7f7a9f]">Starting from</p>
														<div className="text-[clamp(1.72rem,1.64rem+0.5vw,2.12rem)] font-extrabold text-[#6a3ff6]">
															{startingPrice ? formatCurrency(startingPrice) : "Price on seat map"}
														</div>
													</div>

													<Link
														to={`/seats/${schedule._id}`}
														className="inline-flex items-center justify-center rounded-xl bg-linear-to-r from-[#7c46ff] to-[#5935e9] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(103,60,255,0.35)] transition hover:from-[#6f3fff] hover:to-[#4d2fe0]"
													>
														View Seats
													</Link>
												</div>
											</div>
										</article>
									);
								})
							) : (
								<div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 sm:col-span-2 lg:col-span-3">
									No schedules found for today. Try searching by route and date.
								</div>
							)}
						</div>
					) : null}
				</section>

				<section className="mt-16 grid gap-6 lg:grid-cols-2">
					<div className="public-fade-up rounded-3xl border border-slate-200 bg-white p-6 shadow-md shadow-slate-200/60 sm:p-7">
						<p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Why Choose Us</p>
						<h2 className="display-title mt-1 text-3xl font-bold text-slate-900">Trusted by Travelers Across Nepal</h2>
						<div className="mt-6 space-y-4">
							{TRUST_POINTS.map((point) => {
								const Icon = point.icon;
								return (
									<div key={point.title} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
										<div className="mt-0.5 rounded-lg bg-white p-2 text-orange-500 shadow-sm">
											<Icon className="h-4 w-4" />
										</div>
										<div>
											<div className="text-sm font-semibold text-slate-800">{point.title}</div>
											<p className="mt-1 text-xs leading-relaxed text-slate-600">{point.text}</p>
										</div>
									</div>
								);
							})}
						</div>
					</div>

					<div className="public-fade-up rounded-3xl border border-slate-200 bg-slate-900 p-6 text-slate-100 shadow-md shadow-slate-300/40 [animation-delay:0.12s] sm:p-7">
						<p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">How It Works</p>
						<h2 className="display-title mt-1 text-3xl font-bold text-white">Book in 4 Simple Steps</h2>
						<div className="mt-6 space-y-3">
							{HOW_IT_WORKS.map((item) => {
								const Icon = item.icon;
								return (
									<div key={item.step} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
										<div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-400 text-xs font-bold text-white">
											{item.step}
										</div>
										<div className="flex-1">
											<div className="flex items-center gap-2 text-sm font-semibold text-white">
												<Icon className="h-4 w-4 text-orange-300" />
												{item.title}
											</div>
											<p className="mt-1 text-xs text-slate-300">{item.text}</p>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				</section>

				<section className="mt-16 public-fade-up [animation-delay:0.32s]">
					<div className="flex flex-wrap items-end justify-between gap-3">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">What Travelers Say</p>
							<h2 className="display-title mt-1 text-3xl font-bold text-slate-900">Real Reviews from Real Passengers</h2>
						</div>
					</div>

					<div className="mt-6 grid gap-4 lg:grid-cols-3">
						{TESTIMONIALS.map((item) => (
							<article key={item.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
								<div className="mb-3 flex gap-1 text-orange-500">
									{Array.from({ length: 5 }).map((_, index) => (
										<CheckCircle2 key={`${item.name}-${index}`} className="h-4 w-4" />
									))}
								</div>
								<p className="text-sm leading-relaxed text-slate-600">"{item.quote}"</p>
								<div className="mt-4 text-sm font-semibold text-slate-800">{item.name}</div>
								<div className="text-xs text-slate-500">{item.city}</div>
							</article>
						))}
					</div>
				</section>

				<section className="public-fade-up mt-16 rounded-3xl bg-linear-to-r from-slate-900 via-slate-800 to-slate-900 p-8 text-center text-white shadow-xl shadow-slate-300/50 [animation-delay:0.4s] sm:p-10">
					<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Ready to Travel?</p>
					<h2 className="display-title mt-2 text-3xl font-bold sm:text-4xl">Book Your Bus Ticket Now</h2>
					<p className="mx-auto mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
						Plan your trip in seconds and reserve your seat before it is gone.
					</p>
					<div className="mt-6 flex flex-wrap items-center justify-center gap-3">
						<Link
							to="/search"
							className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 transition hover:-translate-y-0.5 hover:bg-orange-600"
						>
							Book Your Ticket Now
							<ArrowRight className="h-4 w-4" />
						</Link>
						<Link
							to="/login"
							className="inline-flex items-center rounded-xl border border-slate-500 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-400 hover:bg-slate-700"
						>
							Login to Manage Bookings
						</Link>
					</div>
				</section>

				<footer className="mt-14 border-t border-slate-200 pt-6">
					<div className="flex flex-wrap items-center justify-between gap-4 text-sm text-slate-600">
						<div>
							<div className="display-title text-lg font-bold text-slate-900">SmartBus</div>
							<p className="text-xs text-slate-500">Public bus booking system for Nepal travelers.</p>
						</div>
						<div className="flex flex-wrap gap-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
							<Link to="/">Home</Link>
							<Link to="/search">Routes</Link>
							<Link to="/register">Create Account</Link>
							<Link to="/login">Login</Link>
						</div>
					</div>
				</footer>
			</main>
		</div>
	);
}