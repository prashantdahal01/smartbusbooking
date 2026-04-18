import { Armchair } from "lucide-react";

// Interactive seat selection component displaying lower/upper deck style layouts
export default function SeatMap({
	totalSeats,
	seatLayout = [],
	bookedSeats = [],
	lockedSeats = [],
	selectedSeats = [],
	myUserId,
	onToggleSeat,
	showLegend = true,
}) {
	const normalizeSeatLabel = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");
	const normalizeSeatType = (value) => {
		const normalized = String(value || "SEATER").trim().toUpperCase().replace(/[\s-]+/g, "_");
		if (normalized === "SLEEPER") return "SLEEPER";
		if (normalized === "SHARED_SLEEPER") return "SHARED_SLEEPER";
		return "SEATER";
	};
	const sortSeatLabels = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });

	const bookedSet = new Set(
		(Array.isArray(bookedSeats) ? bookedSeats : [])
			.map(normalizeSeatLabel)
			.filter(Boolean)
	);

	const lockedBySeat = new Map();
	(Array.isArray(lockedSeats) ? lockedSeats : []).forEach((lock) => {
		const seatLabel = normalizeSeatLabel(lock?.seatLabel ?? lock?.seatNumber);
		if (!seatLabel) return;
		const lockedBy = lock?.lockedBy?._id ?? lock?.lockedBy;
		if (lockedBy == null) return;
		lockedBySeat.set(seatLabel, String(lockedBy));
	});

	const selectedSet = new Set(
		(Array.isArray(selectedSeats) ? selectedSeats : [])
			.map(normalizeSeatLabel)
			.filter(Boolean)
	);

	const normalizedDecks = Array.isArray(seatLayout) && seatLayout.length > 0
		? seatLayout
			.map((deck, deckIndex) => {
				const deckNumber = Number.isFinite(Number(deck?.deckNumber)) && Number(deck.deckNumber) > 0
					? Math.trunc(Number(deck.deckNumber))
					: deckIndex + 1;
				const deckName = String(deck?.deckName || deck?.name || "").trim() || (deckNumber === 1 ? "Lower Deck" : deckNumber === 2 ? "Upper Deck" : `Deck ${deckNumber}`);
				const isUpperDeck = /upper/.test(deckName.toLowerCase());

				const seats = Array.isArray(deck?.seats)
					? deck.seats
						.map((seat, seatIndex) => {
							const seatLabel = normalizeSeatLabel(seat?.seatLabel ?? seat?.seatNumber);
							if (!seatLabel) return null;

							const rowRaw = Number(seat?.row);
							const columnRaw = Number(seat?.column);
							const rowSpanRaw = Number(seat?.rowSpan ?? seat?.rowspan);
							const columnSpanRaw = Number(seat?.columnSpan ?? seat?.colSpan ?? seat?.colspan);
							const inferredUpperSpan = isUpperDeck && /^UPSHARINGSLEEPER/.test(seatLabel) ? 2 : 1;

							return {
								seatLabel,
								seatNumber: String(seat?.seatNumber || seatLabel).trim() || seatLabel,
								seatType: normalizeSeatType(seat?.seatType),
								price: Number.isFinite(Number(seat?.price)) ? Number(seat.price) : 0,
								isAvailable: seat?.isAvailable !== false,
								row: Number.isFinite(rowRaw) && rowRaw > 0 ? Math.trunc(rowRaw) : Math.floor(seatIndex / 4) + 1,
								column: Number.isFinite(columnRaw) && columnRaw > 0 ? Math.trunc(columnRaw) : (seatIndex % 4) + 1,
								rowSpan: Number.isFinite(rowSpanRaw) && rowSpanRaw > 1 ? Math.trunc(rowSpanRaw) : inferredUpperSpan,
								columnSpan: Number.isFinite(columnSpanRaw) && columnSpanRaw > 1 ? Math.trunc(columnSpanRaw) : 1,
							};
						})
						.filter(Boolean)
						.sort((a, b) => {
							if (a.row !== b.row) return a.row - b.row;
							if (a.column !== b.column) return a.column - b.column;
							return sortSeatLabels(a.seatLabel, b.seatLabel);
						})
					: [];

				return { deckNumber, deckName, seats };
			})
			.sort((a, b) => a.deckNumber - b.deckNumber)
		: [
			{
				deckNumber: 1,
				deckName: "Main Deck",
				seats: Array.from({ length: Number.isFinite(Number(totalSeats)) && Number(totalSeats) > 0 ? Math.trunc(Number(totalSeats)) : 0 }, (_, index) => ({
					seatLabel: String(index + 1),
					seatNumber: String(index + 1),
					seatType: "SEATER",
					price: 0,
					isAvailable: true,
					row: Math.floor(index / 4) + 1,
					column: (index % 4) + 1,
					rowSpan: 1,
					columnSpan: 1,
				})),
			},
		];

	const canToggle = (seatLabel, isAvailable) => {
		const lockedBy = lockedBySeat.get(seatLabel);
		const isBooked = bookedSet.has(seatLabel);
		if (isBooked) return false;
		if (!isAvailable) return false;
		if (lockedBy && String(lockedBy) !== String(myUserId)) return false;
		return true;
	};

	const getSeatStatus = (seat) => {
		const lockedBy = lockedBySeat.get(seat.seatLabel);
		const isLockedByMe = lockedBy && String(lockedBy) === String(myUserId);
		const isLockedByOther = lockedBy && !isLockedByMe;
		const isBooked = bookedSet.has(seat.seatLabel);
		const isSelected = selectedSet.has(seat.seatLabel);

		if (isBooked || isLockedByOther) return "booked";
		if (seat.isAvailable === false) return "reserved";
		if (isSelected) return "selected";
		if (isLockedByMe) return "locked";
		return "available";
	};

	const getSeatClass = (seat, status) => {
		const base = "seat-btn relative flex items-center justify-center text-[10px] sm:text-xs font-semibold transition-all duration-200 overflow-hidden w-full h-full rounded-md";
		if (status === "selected") return `${base} seat-selected border border-violet-300/70 bg-violet-600 text-white shadow-[0_0_0_1px_rgba(196,181,253,0.55)]`;
		if (status === "locked") return `${base} seat-locked border border-emerald-300/40 bg-emerald-500/15 text-emerald-100`;
		if (status === "booked") return `${base} seat-booked border border-slate-700 bg-slate-950/55 text-slate-500 cursor-not-allowed`;
		if (status === "reserved") return `${base} seat-reserved border border-dashed border-slate-500/70 bg-white/0 text-slate-400 cursor-not-allowed`;
		if (seat.seatType === "SHARED_SLEEPER") return `${base} seat-available border border-fuchsia-500/50 bg-fuchsia-500/20 text-fuchsia-100 hover:bg-fuchsia-500/30`;
		if (seat.seatType === "SLEEPER") return `${base} seat-available border border-blue-500/50 bg-blue-500/20 text-blue-100 hover:bg-blue-500/30`;
		return `${base} seat-available border border-slate-500/60 bg-slate-800/70 text-slate-100 hover:bg-slate-700/80`;
	};

	const getGridShape = (deck) => {
		const safeSeats = Array.isArray(deck?.seats) ? deck.seats : [];
		const deckName = String(deck?.deckName || "").toLowerCase();
		if (/lower|upper/.test(deckName)) {
			return { columns: 5, rows: 11 };
		}

		let maxColumn = 4;
		let maxRow = 4;
		safeSeats.forEach((seat) => {
			maxColumn = Math.max(maxColumn, seat.column + Math.max(1, seat.columnSpan || 1) - 1);
			maxRow = Math.max(maxRow, seat.row + Math.max(1, seat.rowSpan || 1) - 1);
		});

		return { columns: maxColumn, rows: maxRow };
	};

	return (
		<div className="text-slate-200">
			{showLegend ? (
				<div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-300">
					<span className="inline-flex items-center gap-2">
						<span className="h-3.5 w-3.5 rounded border border-slate-500/60 bg-slate-800/70" /> Available
					</span>
					<span className="inline-flex items-center gap-2">
						<span className="h-3.5 w-3.5 rounded bg-violet-600" /> Selected
					</span>
					<span className="inline-flex items-center gap-2">
						<span className="h-3.5 w-3.5 rounded border border-slate-700 bg-slate-950/55" /> Booked
					</span>
					<span className="inline-flex items-center gap-2">
						<span className="h-3.5 w-3.5 rounded border border-dashed border-slate-500/80 bg-transparent" /> Reserved
					</span>
				</div>
			) : null}

			<div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible">
				{normalizedDecks.map((deck) => {
					const shape = getGridShape(deck);
					const isLowerDeck = /lower/.test(String(deck?.deckName || "").toLowerCase());

					return (
						<div
							key={`deck-${deck.deckNumber}`}
							className="seat-inner-card rounded-xl px-2 py-3 sm:p-4 shrink-0 snap-start flex flex-col h-[calc(100dvh-240px)] max-h-[calc(100dvh-240px)] min-h-70 md:h-full md:max-h-full md:min-h-0 w-[82%] md:w-[calc(50%-8px)] border border-slate-700/60 bg-slate-900/35"
						>
							<div className="flex items-center justify-between mb-2 shrink-0">
								<div className="flex items-center gap-2">
									<div className="w-1.5 h-5 bg-linear-to-b from-violet-400 to-violet-600 rounded-full" />
									<p className="text-sm font-bold text-slate-100 uppercase tracking-wide">{deck.deckName}</p>
								</div>
								<span className="text-[10px] text-slate-400 px-2 py-1 bg-white/5 rounded-md">Tap to select</span>
							</div>

							<div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
								<div
									className="grid gap-0.5 sm:gap-1 w-full h-full"
									style={{
										gridTemplateColumns: `repeat(${shape.columns}, minmax(0px, 1fr))`,
										gridTemplateRows: `repeat(${shape.rows}, minmax(0px, 1fr))`,
										aspectRatio: `${shape.columns} / ${shape.rows}`,
										maxHeight: "100%",
										maxWidth: "100%",
										width: "100%",
										height: "100%",
									}}
								>
									{isLowerDeck ? (
										<button
											disabled
											className="seat-btn relative flex items-center justify-center text-[10px] sm:text-xs font-semibold transition-all duration-200 overflow-hidden w-full h-full rounded-md invisible"
											style={{ gridArea: "1 / 5 / span 1 / span 1", aspectRatio: "1 / 1" }}
										>
											<Armchair className="h-4 w-4 sm:h-5 sm:w-5" />
										</button>
									) : null}

									{deck.seats.map((seat) => {
										const status = getSeatStatus(seat);
										const selectable = canToggle(seat.seatLabel, seat.isAvailable);
										return (
											<button
												key={`${deck.deckNumber}-${seat.seatLabel}`}
												disabled={!selectable}
												onClick={() => (selectable ? onToggleSeat?.(seat.seatLabel) : undefined)}
												className={getSeatClass(seat, status)}
												style={{
													gridArea: `${seat.row} / ${seat.column} / span ${Math.max(1, seat.rowSpan || 1)} / span ${Math.max(1, seat.columnSpan || 1)}`,
													aspectRatio: "1 / 1",
												}}
												title={`${seat.seatNumber} • ${seat.seatType} • Rs. ${seat.price}`}
											>
												<div className="flex flex-col items-center z-10 w-full px-0.5">
													<span className="font-bold wrap-break-word text-center leading-tight hyphens-auto">{seat.seatNumber}</span>
													{status === "available" || status === "selected" || status === "locked" ? (
														<span className="text-[8px] sm:text-[9px] font-medium leading-tight">Rs. {seat.price}</span>
													) : null}
												</div>
											</button>
										);
									})}
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
