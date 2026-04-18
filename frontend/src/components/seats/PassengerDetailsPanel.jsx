import { IdCard, Phone, UserRound, Users } from "lucide-react";

const genderOptions = [
  { value: "", label: "Select" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const pointOptionLabel = (point) => {
  const date = String(point?.date || "").trim();
  const time = String(point?.time || "").trim();
  const marker = [date, time].filter(Boolean).join(" ");
  return marker ? `${point.name} (${marker})` : point.name;
};

export default function PassengerDetailsPanel({
  selectedSeats = [],
  seatPassengers = {},
  contactName,
  contactPhone,
  onContactChange,
  onSeatPassengerChange,
  boardingOptions = [],
  droppingOptions = [],
  boardingPoint,
  droppingPoint,
  onBoardingPointChange,
  onDroppingPointChange,
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Trip Points</h3>
        <p className="mt-1 text-xs text-slate-500">Select boarding and dropping points for this booking.</p>

        <div className="mt-3 grid gap-3">
          <label className="text-xs font-semibold text-slate-600">
            Boarding Point
            <select
              value={boardingPoint}
              onChange={(event) => onBoardingPointChange(event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">Select boarding point</option>
              {boardingOptions.map((point) => (
                <option key={`boarding-${point.name}`} value={point.name}>
                  {pointOptionLabel(point)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-600">
            Dropping Point
            <select
              value={droppingPoint}
              onChange={(event) => onDroppingPointChange(event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">Select dropping point</option>
              {droppingOptions.map((point) => (
                <option key={`dropping-${point.name}`} value={point.name}>
                  {pointOptionLabel(point)}
                </option>
              ))}
            </select>
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
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
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
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
          <Users className="h-4 w-4" /> Passenger Details by Seat
        </h3>
        <p className="mt-1 text-xs text-slate-500">Each selected seat can store passenger details and optional ID data.</p>

        {selectedSeats.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
            Select seats to add passenger details.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {selectedSeats.map((seatLabel) => {
              const passenger = seatPassengers?.[seatLabel] || {};

              return (
                <div key={`passenger-${seatLabel}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded-lg bg-[rgba(249,115,22,0.12)] px-2.5 py-1 text-xs font-bold text-[rgb(var(--seat-primary))]">
                      Seat {seatLabel}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">Passenger mapping</span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={passenger.name || ""}
                      onChange={(event) => onSeatPassengerChange(seatLabel, "name", event.target.value)}
                      placeholder="Passenger name"
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                    />

                    <input
                      value={passenger.phone || ""}
                      onChange={(event) => onSeatPassengerChange(seatLabel, "phone", event.target.value)}
                      placeholder="Phone number"
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                    />

                    <select
                      value={passenger.gender || ""}
                      onChange={(event) => onSeatPassengerChange(seatLabel, "gender", event.target.value)}
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                    >
                      {genderOptions.map((option) => (
                        <option key={`gender-${seatLabel}-${option.value || "none"}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={passenger.age || ""}
                      onChange={(event) => onSeatPassengerChange(seatLabel, "age", event.target.value)}
                      placeholder="Age"
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  <label className="mt-2 block text-xs font-semibold text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <IdCard className="h-3.5 w-3.5" /> Optional ID Number
                    </span>
                    <input
                      value={passenger.idNumber || ""}
                      onChange={(event) => onSeatPassengerChange(seatLabel, "idNumber", event.target.value)}
                      placeholder="Citizenship, passport, etc."
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
