import { ArrowDown, CheckCircle2, ChevronDown, Circle, Clock, IdCard, Info, Mail, MapPin, Phone, UserRound, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const genderOptions = [
  { value: "", label: "Select" },
  { value: "male", label: "♂ Male" },
  { value: "female", label: "♀ Female" },
  { value: "other", label: "⚥ Other" },
];

const idTypeOptions = [
  { value: "", label: "Select ID type" },
  { value: "citizenship", label: "Citizenship" },
  { value: "passport", label: "Passport" },
  { value: "national_id", label: "National ID" },
  { value: "other", label: "Other" },
];

const formatPointTime = (point) => {
  const time = String(point?.time || "").trim();
  if (!time) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time;
  const h = Number(match[1]);
  const m = match[2];
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${suffix}`;
};

const seatTypeLabel = (value) => {
  const n = String(value || "").trim().toUpperCase();
  if (n === "SLEEPER") return "Sleeper";
  if (n === "SHARED_SLEEPER") return "Shared sleeper";
  if (n === "SEATER") return "Seater";
  return n.replace(/_/g, " ") || "Seat";
};

const buildExpandedState = (seatDetails = []) => {
  const state = {};
  seatDetails.forEach((seat, index) => { state[seat.seatLabel] = index === 0; });
  return state;
};

/* ── Custom Dropdown ── */
const ACCENT_STYLES = {
  emerald: {
    openBorder: "border-emerald-400 ring-2 ring-emerald-100 shadow-sm",
    iconActive: "bg-emerald-50 text-emerald-500",
    selectedItem: "bg-emerald-50 font-semibold text-emerald-700",
  },
  orange: {
    openBorder: "border-orange-400 ring-2 ring-orange-100 shadow-sm",
    iconActive: "bg-orange-50 text-orange-500",
    selectedItem: "bg-orange-50 font-semibold text-orange-700",
  },
};

function CustomSelect({ value, options, onChange, placeholder, icon: Icon, accentColor = "orange" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((o) => o.value === value);
  const accent = ACCENT_STYLES[accentColor] || ACCENT_STYLES.orange;

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          flex w-full items-center gap-2.5 rounded-xl border bg-white px-3.5 py-3 text-left text-sm transition-all duration-200
          ${open ? accent.openBorder : "border-slate-200 hover:border-slate-300 hover:shadow-sm"}
        `}
      >
        {Icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            value ? accent.iconActive : "bg-slate-100 text-slate-400"
          }`}>
            <Icon className="h-4 w-4" />
          </span>
        )}
        <span className={`flex-1 truncate font-medium ${value ? "text-slate-800" : "text-slate-400"}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/60 animate-in">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`
                flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors
                ${opt.value === value ? accent.selectedItem : "text-slate-700 hover:bg-slate-50"}
              `}
            >
              {opt.value === value && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
              <span className={opt.value === value ? "" : "pl-6"}>{opt.label}</span>
              {opt.time && (
                <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" /> {opt.time}
                </span>
              )}
            </button>
          ))}
          {options.length === 0 && (
            <div className="px-4 py-3 text-center text-xs text-slate-400">No options available</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Floating Label Input ── */
function FloatingInput({ icon: Icon, label, error, children }) {
  return (
    <div className="group relative">
      <div className={`
        flex items-center gap-2.5 rounded-xl border bg-white px-3.5 py-2 transition-all duration-200
        focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 focus-within:shadow-sm
        ${error ? "border-rose-300 focus-within:border-rose-400 focus-within:ring-rose-100" : "border-slate-200 hover:border-slate-300"}
      `}>
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 transition group-focus-within:bg-orange-50 group-focus-within:text-orange-500">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 transition group-focus-within:text-orange-500">{label}</span>
          {children}
        </div>
      </div>
      {error && <p className="mt-1 pl-1 text-[11px] font-medium text-rose-500">{error}</p>}
    </div>
  );
}

export default function PassengerDetailsPanel({
  selectedSeats = [],
  selectedSeatDetails = [],
  seatPassengers = {},
  contactName,
  contactPhone,
  contactEmail,
  contactEmailError = "",
  onContactChange,
  onSeatPassengerChange,
  boardingOptions = [],
  droppingOptions = [],
  boardingPoint,
  droppingPoint,
  onBoardingPointChange,
  onDroppingPointChange,
}) {
  const seatDetails = useMemo(() => {
    if (Array.isArray(selectedSeatDetails) && selectedSeatDetails.length > 0) return selectedSeatDetails;
    return selectedSeats.map((seatLabel) => ({ seatLabel, seatNumber: seatLabel, seatType: "SEATER", deckName: "Seat" }));
  }, [selectedSeatDetails, selectedSeats]);

  const [expandedSeats, setExpandedSeats] = useState(() => buildExpandedState(seatDetails));

  useEffect(() => { setExpandedSeats(buildExpandedState(seatDetails)); }, [seatDetails]);

  const boardingSelectOptions = useMemo(() => [
    { value: "", label: "Select boarding point" },
    ...boardingOptions.map((p) => ({ value: p.name, label: p.name, time: formatPointTime(p) })),
  ], [boardingOptions]);

  const droppingSelectOptions = useMemo(() => [
    { value: "", label: "Select dropping point" },
    ...droppingOptions.map((p) => ({ value: p.name, label: p.name, time: formatPointTime(p) })),
  ], [droppingOptions]);

  const inputClassName =
    "h-8 w-full border-0 bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400";

  const filledCount = seatDetails.filter((s) => String(seatPassengers?.[s.seatLabel]?.name || "").trim()).length;

  return (
    <div className="space-y-4">

      {/* ── TRIP POINTS ── */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3 rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-emerald-50/60 to-teal-50/40 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <MapPin className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">Trip Points</h3>
            <p className="text-[11px] text-slate-500">Select where you'll board and exit</p>
          </div>
        </div>

        <div className="p-4">
          {/* Visual route timeline */}
          <div className="relative space-y-3 pl-6">
            {/* Vertical line */}
            <div className="absolute left-[9px] top-5 bottom-12 w-0.5 bg-gradient-to-b from-emerald-400 via-emerald-300 to-orange-400" />

            {/* Boarding */}
            <div>
              <div className="relative flex items-center gap-2 mb-2">
                <span className="absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full border-2 border-emerald-400 bg-white">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Boarding Point</span>
              </div>
              <CustomSelect
                value={boardingPoint}
                options={boardingSelectOptions}
                onChange={onBoardingPointChange}
                placeholder="Select boarding point"
                icon={MapPin}
                accentColor="emerald"
              />
            </div>

            {/* Direction indicator */}
            <div className="relative flex items-center gap-2 py-1">
              <span className="absolute -left-6 text-slate-300">
                <ArrowDown className="h-4 w-4" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Travel direction</span>
            </div>

            {/* Dropping */}
            <div>
              <div className="relative flex items-center gap-2 mb-2">
                <span className="absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full border-2 border-orange-400 bg-white">
                  <span className="h-2 w-2 rounded-full bg-orange-500" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-orange-600">Dropping Point</span>
              </div>
              <CustomSelect
                value={droppingPoint}
                options={droppingSelectOptions}
                onChange={onDroppingPointChange}
                placeholder="Select dropping point"
                icon={MapPin}
                accentColor="orange"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT INFORMATION ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50/60 to-indigo-50/40 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <Phone className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">Contact Information</h3>
            <p className="text-[11px] text-slate-500">E-ticket and notifications go here</p>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <FloatingInput icon={UserRound} label="Full Name">
            <input
              value={contactName}
              onChange={(e) => onContactChange("name", e.target.value)}
              placeholder="Enter contact name"
              className={inputClassName}
            />
          </FloatingInput>

          <FloatingInput icon={Phone} label="Phone Number">
            <input
              value={contactPhone}
              onChange={(e) => onContactChange("phone", e.target.value)}
              placeholder="98xxxxxxxx"
              className={inputClassName}
            />
          </FloatingInput>

          <FloatingInput icon={Mail} label="Email (optional)" error={contactEmailError}>
            <input
              value={contactEmail}
              onChange={(e) => onContactChange("email", e.target.value)}
              placeholder="name@example.com"
              inputMode="email"
              autoComplete="email"
              aria-invalid={Boolean(contactEmailError)}
              className={inputClassName}
            />
          </FloatingInput>

          <div className="flex items-start gap-2 rounded-lg bg-blue-50/70 px-3 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
            <p className="text-[11px] leading-relaxed text-blue-600/80">
              E-ticket and trip notifications will be sent here. If left empty, notifications go to the registered account email.
            </p>
          </div>
        </div>
      </section>

      {/* ── PASSENGER DETAILS ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-purple-50/60 to-fuchsia-50/40 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
              <Users className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">Passenger Details</h3>
              <p className="text-[11px] text-slate-500">Info for each selected seat</p>
            </div>
          </div>
          {seatDetails.length > 0 && (
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
              filledCount === seatDetails.length
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}>
              {filledCount}/{seatDetails.length} filled
            </span>
          )}
        </div>

        <div className="p-4">
          {seatDetails.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center">
              <Users className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-xs font-semibold text-slate-500">No seats selected</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Select seats to add passenger details</p>
            </div>
          ) : (
            <div className="space-y-3">
              {seatDetails.map((seat, idx) => {
                const passenger = seatPassengers?.[seat.seatLabel] || {};
                const isExpanded = Boolean(expandedSeats?.[seat.seatLabel]);
                const hasNameFilled = Boolean(String(passenger.name || "").trim());

                return (
                  <div
                    key={`passenger-${seat.seatLabel}`}
                    className={`overflow-hidden rounded-xl border transition-all duration-200 ${
                      isExpanded
                        ? "border-purple-200 bg-white shadow-md shadow-purple-100/40"
                        : hasNameFilled
                          ? "border-emerald-200 bg-emerald-50/30 hover:border-emerald-300"
                          : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
                    }`}
                  >
                    {/* Accordion header */}
                    <button
                      type="button"
                      onClick={() => setExpandedSeats((prev) => ({ ...prev, [seat.seatLabel]: !prev?.[seat.seatLabel] }))}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
                      aria-expanded={isExpanded}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold ${
                          hasNameFilled
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-orange-100 text-orange-700"
                        }`}>
                          {seat.seatNumber}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-slate-800">{seatTypeLabel(seat.seatType)}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{seat.deckName}</span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            {hasNameFilled ? String(passenger.name).trim() : "Tap to fill details"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {hasNameFilled ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-slate-300" />}
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-white px-3.5 py-4">
                        <div className="grid gap-3">
                          {/* Name */}
                          <FloatingInput icon={UserRound} label="Passenger Name *">
                            <input
                              value={passenger.name || ""}
                              onChange={(e) => onSeatPassengerChange(seat.seatLabel, "name", e.target.value)}
                              placeholder="Full name"
                              className={inputClassName}
                            />
                          </FloatingInput>

                          {/* Age + Gender row */}
                          <div className="grid gap-3 grid-cols-2">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Age</label>
                              <input
                                type="number"
                                min={1}
                                max={120}
                                value={passenger.age || ""}
                                onChange={(e) => onSeatPassengerChange(seat.seatLabel, "age", e.target.value)}
                                placeholder="Age"
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Gender</label>
                              <div className="flex gap-1">
                                {genderOptions.filter(o => o.value).map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => onSeatPassengerChange(seat.seatLabel, "gender", opt.value)}
                                    className={`flex-1 rounded-lg border px-1 py-2 text-xs font-semibold transition-all ${
                                      passenger.gender === opt.value
                                        ? "border-orange-300 bg-orange-50 text-orange-700 shadow-sm"
                                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* ID section */}
                          <div className="grid gap-3 grid-cols-2">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">ID Type</label>
                              <select
                                value={passenger.idType || ""}
                                onChange={(e) => onSeatPassengerChange(seat.seatLabel, "idType", e.target.value)}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                              >
                                {idTypeOptions.map((opt) => (
                                  <option key={`id-${seat.seatLabel}-${opt.value || "n"}`} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                            <FloatingInput icon={IdCard} label="ID Number">
                              <input
                                value={passenger.idNumber || ""}
                                onChange={(e) => onSeatPassengerChange(seat.seatLabel, "idNumber", e.target.value)}
                                placeholder="ID number"
                                className={inputClassName}
                              />
                            </FloatingInput>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-in-from-top-1 { from { transform: translateY(-4px); } to { transform: translateY(0); } }
        .animate-in { animation: fade-in 150ms ease, slide-in-from-top-1 150ms ease; }
      `}</style>
    </div>
  );
}
