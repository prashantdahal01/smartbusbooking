// Interactive seat selection component displaying the bus seating layout
// Shows available, booked, and selected seats with color indicators
export default function SeatMap({
	totalSeats,
	bookedSeats = [],
	lockedSeats = [],
	selectedSeats = [],
	myUserId,
	onToggleSeat,
	showLegend = true,
}) {
	const normalizeSeatNumber = (value) => {
		const n = Number(value);
		return Number.isInteger(n) && n > 0 ? n : null;
	};

	const bookedSet = new Set(
		(Array.isArray(bookedSeats) ? bookedSeats : [])
			.map(normalizeSeatNumber)
			.filter((n) => n != null)
	);

	const lockedBySeat = new Map();
	(Array.isArray(lockedSeats) ? lockedSeats : []).forEach((l) => {
		const seatNumber = normalizeSeatNumber(l?.seatNumber);
		if (seatNumber == null) return;
		const lockedBy = l?.lockedBy?._id ?? l?.lockedBy;
		if (lockedBy == null) return;
		lockedBySeat.set(seatNumber, String(lockedBy));
	});

	const selectedSet = new Set(
		(Array.isArray(selectedSeats) ? selectedSeats : [])
			.map(normalizeSeatNumber)
			.filter((n) => n != null)
	);

	const canToggle = (n) => {
		const lockedBy = lockedBySeat.get(n);
		const isBooked = bookedSet.has(n);
		if (isBooked) return false;
		if (lockedBy && String(lockedBy) !== String(myUserId)) return false;
		return true;
	};

	const seats = [];
	for (let i = 1; i <= totalSeats; i += 1) seats.push(i);

	const rows = [];
	for (let i = 0; i < seats.length; i += 4) rows.push(seats.slice(i, i + 4));

	const seatClasses = (n) => {
		const lockedBy = lockedBySeat.get(n);
		const isLockedByMe = lockedBy && String(lockedBy) === String(myUserId);
		const isLockedByOther = lockedBy && !isLockedByMe;
		const isBooked = bookedSet.has(n);
		const isSelected = selectedSet.has(n);

		if (isBooked) return "bg-slate-950/60 text-slate-500 cursor-not-allowed";
		if (isLockedByOther) return "bg-slate-900/60 text-slate-500 cursor-not-allowed";
		if (isSelected) return "bg-emerald-500 text-slate-950 hover:bg-emerald-400";
		if (isLockedByMe) return "bg-emerald-500/20 text-emerald-100 ring-2 ring-emerald-400/50 hover:ring-emerald-300/60";
		return "bg-slate-800 text-slate-100 hover:bg-slate-700";
	};

	return (
		<div className="text-slate-200">
			{showLegend ? (
				<div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-slate-300">
					<span className="inline-flex items-center gap-2">
						<span className="h-3 w-3 rounded bg-slate-700 ring-1 ring-slate-600" /> Available
					</span>
					<span className="inline-flex items-center gap-2">
						<span className="h-3 w-3 rounded bg-emerald-500" /> Selected
					</span>
					<span className="inline-flex items-center gap-2">
						<span className="h-3 w-3 rounded bg-slate-950/60 ring-1 ring-slate-800" /> Booked
					</span>
				</div>
			) : null}

			<div className="flex flex-col items-center space-y-2">
				{rows.map((row, idx) => (
					<div key={idx} className="flex items-center gap-2 sm:gap-3">
						<div className="flex gap-2">
							{[row[0], row[1]].map((n, i) =>
								n ? (
									<button
										key={n}
										type="button"
										disabled={!canToggle(n)}
										onClick={() => (canToggle(n) ? onToggleSeat?.(n) : undefined)}
										title={`Seat ${n}`}
										className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold shadow-sm ring-1 ring-slate-700/60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 sm:h-10 sm:w-10 ${seatClasses(n)}`}
									>
										{n}
									</button>
								) : (
									<div key={`l-${idx}-${i}`} className="h-9 w-9 sm:h-10 sm:w-10" />
								)
							)}
						</div>

						<div className="h-9 w-5 sm:h-10 sm:w-6" />

						<div className="flex gap-2">
							{[row[2], row[3]].map((n, i) =>
								n ? (
									<button
										key={n}
										type="button"
										disabled={!canToggle(n)}
										onClick={() => (canToggle(n) ? onToggleSeat?.(n) : undefined)}
										title={`Seat ${n}`}
										className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold shadow-sm ring-1 ring-slate-700/60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 sm:h-10 sm:w-10 ${seatClasses(n)}`}
									>
										{n}
									</button>
								) : (
								<div key={`r-${idx}-${i}`} className="h-9 w-9 sm:h-10 sm:w-10" />
								)
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
