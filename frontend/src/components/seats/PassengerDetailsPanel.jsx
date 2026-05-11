import { ArrowRight, CheckCircle2, ChevronDown, Circle, IdCard, Info, Mail, MapPin, Phone, UserRound, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const genderOptions = [
  { value: "", label: "Select" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const idTypeOptions = [
  { value: "", label: "Select ID type" },
  { value: "citizenship", label: "Citizenship" },
  { value: "passport", label: "Passport" },
  { value: "national_id", label: "National ID" },
  { value: "other", label: "Other" },
];

const pointOptionLabel = (point) => {
  const date = String(point?.date || "").trim();
  const time = String(point?.time || "").trim();
  const marker = [date, time].filter(Boolean).join(" ");
  return marker ? `${point.name} (${marker})` : point.name;
};

const seatTypeLabel = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "SLEEPER") return "Sleeper";
  if (normalized === "SHARED_SLEEPER") return "Shared sleeper";
  if (normalized === "SEATER") return "Seater";
  return normalized.replace(/_/g, " ") || "Seat";
};

const buildExpandedState = (seatDetails = []) => {
  const state = {};
  seatDetails.forEach((seat, index) => {
    state[seat.seatLabel] = index === 0;
  });
  return state;
};

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

    return selectedSeats.map((seatLabel) => ({
      seatLabel,
      seatNumber: seatLabel,
      seatType: "SEATER",
      deckName: "Seat",
    }));
  }, [selectedSeatDetails, selectedSeats]);

  const [expandedSeats, setExpandedSeats] = useState(() => buildExpandedState(seatDetails));

  useEffect(() => {
    setExpandedSeats(buildExpandedState(seatDetails));
  }, [seatDetails]);

  const inputClassName =
    "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100";

  const selectShellClassName =
    "group relative rounded-2xl border border-slate-200 bg-white px-3 py-3 transition hover:border-slate-300 focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-100";

  const fieldLabelClassName = "text-xs font-semibold text-slate-600";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Trip Points</h3>
        <p className="mt-1 text-xs text-slate-500">Select boarding and dropping points for this booking.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
          <label className="block">
            <span className={fieldLabelClassName}>Boarding point</span>
            <div className={`${selectShellClassName} mt-1`}>
              <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={boardingPoint}
                onChange={(event) => onBoardingPointChange(event.target.value)}
                className="h-11 w-full appearance-none rounded-xl border-0 bg-transparent pl-10 pr-10 text-sm font-medium text-slate-700 outline-none"
              >
                <option value="">Select boarding point</option>
                {boardingOptions.map((point) => (
                  <option key={`boarding-${point.name}`} value={point.name}>
                    {pointOptionLabel(point)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition group-focus-within:text-[rgb(var(--seat-primary))]" />
            </div>
          </label>

          <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 md:min-h-[4.5rem] md:flex-col md:px-3">
            <ArrowRight className="h-4 w-4 text-[rgb(var(--seat-primary))] md:rotate-90" />
            <span className="whitespace-nowrap">From → To</span>
          </div>

          <label className="block">
            <span className={fieldLabelClassName}>Dropping point</span>
            <div className={`${selectShellClassName} mt-1`}>
              <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={droppingPoint}
                onChange={(event) => onDroppingPointChange(event.target.value)}
                className="h-11 w-full appearance-none rounded-xl border-0 bg-transparent pl-10 pr-10 text-sm font-medium text-slate-700 outline-none"
              >
                <option value="">Select dropping point</option>
                {droppingOptions.map((point) => (
                  <option key={`dropping-${point.name}`} value={point.name}>
                    {pointOptionLabel(point)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition group-focus-within:text-[rgb(var(--seat-primary))]" />
            </div>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Contact Information</h3>
        <p className="mt-1 text-xs text-slate-500">E-ticket and trip notifications are sent to this contact.</p>

        <div className="mt-3 grid gap-3">
          <label className="text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3.5 w-3.5" /> Full Name
            </span>
            <input
              value={contactName}
              onChange={(event) => onContactChange("name", event.target.value)}
              placeholder="Contact full name"
              className={`mt-1 ${inputClassName}`}
            />
          </label>

          <label className="text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" /> Phone Number
            </span>
            <input
              value={contactPhone}
              onChange={(event) => onContactChange("phone", event.target.value)}
              placeholder="98xxxxxxxx"
              className={`mt-1 ${inputClassName}`}
            />
          </label>

          <label className="text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              Email address (optional)
              <span
                title="If this field is left empty, trip notifications and the e-ticket use the registered account email."
                className="inline-flex items-center text-slate-400"
              >
                <Info className="h-3.5 w-3.5" />
              </span>
            </span>
            <input
              value={contactEmail}
              onChange={(event) => onContactChange("email", event.target.value)}
              placeholder="name@example.com"
              inputMode="email"
              autoComplete="email"
              aria-invalid={Boolean(contactEmailError)}
              className={`mt-1 ${inputClassName} ${contactEmailError ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : ""}`}
            />
            <p className="mt-1 text-[11px] font-normal text-slate-500">
              E-ticket and trip notifications will be sent here. If left empty, notifications go to the registered account email.
            </p>
            {contactEmailError ? <p className="mt-1 text-[11px] font-medium text-rose-600">{contactEmailError}</p> : null}
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
          <Users className="h-4 w-4" /> Passenger Details by Seat
        </h3>
        <p className="mt-1 text-xs text-slate-500">Each selected seat stores its own passenger details and optional ID data.</p>

        {seatDetails.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
            Select seats to add passenger details.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {seatDetails.map((seat) => {
              const passenger = seatPassengers?.[seat.seatLabel] || {};
              const isExpanded = Boolean(expandedSeats?.[seat.seatLabel]);
              const hasNameFilled = Boolean(String(passenger.name || "").trim());

              return (
                <div key={`passenger-${seat.seatLabel}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm transition hover:border-slate-300">
                  <button
                    type="button"
                    onClick={() => setExpandedSeats((prev) => ({ ...prev, [seat.seatLabel]: !prev?.[seat.seatLabel] }))}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                    aria-expanded={isExpanded}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[rgba(249,115,22,0.12)] px-2.5 py-1 text-xs font-bold text-[rgb(var(--seat-primary))]">
                          Seat {seat.seatNumber}
                        </span>
                        <span className="truncate text-sm font-semibold text-slate-900">{seatTypeLabel(seat.seatType)}</span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                          {seat.deckName}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{seat.seatLabel}</p>
                    </div>

                    <div className="flex items-center gap-2 pt-0.5">
                      {hasNameFilled ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-slate-300" />}
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="border-t border-slate-200 bg-white px-4 py-4">
                      <div className="grid gap-3">
                        <label className="block text-xs font-semibold text-slate-600">
                          Full name <span className="text-rose-500">*</span>
                          <input
                            value={passenger.name || ""}
                            onChange={(event) => onSeatPassengerChange(seat.seatLabel, "name", event.target.value)}
                            placeholder="Passenger name"
                            className={`mt-1 ${inputClassName}`}
                          />
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-xs font-semibold text-slate-600">
                            Age
                            <input
                              type="number"
                              min={1}
                              max={120}
                              value={passenger.age || ""}
                              onChange={(event) => onSeatPassengerChange(seat.seatLabel, "age", event.target.value)}
                              placeholder="Age"
                              className={`mt-1 ${inputClassName}`}
                            />
                          </label>

                          <label className="block text-xs font-semibold text-slate-600">
                            Gender
                            <select
                              value={passenger.gender || ""}
                              onChange={(event) => onSeatPassengerChange(seat.seatLabel, "gender", event.target.value)}
                              className={`mt-1 ${inputClassName}`}
                            >
                              {genderOptions.map((option) => (
                                <option key={`gender-${seat.seatLabel}-${option.value || "none"}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-xs font-semibold text-slate-600">
                            ID type
                            <select
                              value={passenger.idType || ""}
                              onChange={(event) => onSeatPassengerChange(seat.seatLabel, "idType", event.target.value)}
                              className={`mt-1 ${inputClassName}`}
                            >
                              {idTypeOptions.map((option) => (
                                <option key={`id-type-${seat.seatLabel}-${option.value || "none"}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block text-xs font-semibold text-slate-600">
                            ID number
                            <div className="mt-1 inline-flex w-full items-center rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-100">
                              <IdCard className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <input
                                value={passenger.idNumber || ""}
                                onChange={(event) => onSeatPassengerChange(seat.seatLabel, "idNumber", event.target.value)}
                                placeholder="Citizenship, passport, etc."
                                className="h-10 w-full border-0 bg-transparent px-2 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                              />
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
