import {
  BedDouble,
  Building2,
  Bus,
  CircleDollarSign,
  Clock3,
  MapPin,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Ticket,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import FilterSection from "./FilterSection";
import PriceSlider from "./PriceSlider";

const checkboxClass =
  "h-4 w-4 rounded border-slate-300 bg-white text-violet-600 focus:ring-violet-500 focus:ring-offset-0";

export default function FilterSidebar({
  filters,
  options,
  onToggleMulti,
  onToggleDepartureWindow,
  onPriceChange,
  onToggleRefundable,
  onClearAll,
}) {
  const [openSections, setOpenSections] = useState({
    busTypes: true,
    shifts: true,
    departureWindows: true,
    operators: true,
    vehicleTypes: true,
    seatTypes: true,
    facilities: true,
    priceRange: true,
    refundable: true,
    boardingPoints: true,
    droppingPoints: true,
  });

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedCount = useMemo(() => {
    return Object.entries(filters).reduce((sum, [key, value]) => {
      if (key === "priceRange") return sum;
      if (Array.isArray(value)) return sum + value.length;
      if (typeof value === "boolean") return sum + (value ? 1 : 0);
      return sum;
    }, 0);
  }, [filters]);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <p className="text-sm font-semibold text-slate-900">Advanced Filters</p>
        {selectedCount > 0 ? (
          <button type="button" onClick={onClearAll} className="text-xs font-semibold text-violet-700 hover:text-violet-800">
            Reset
          </button>
        ) : null}
      </div>

      <FilterSection
        title="Bus Type"
        icon={Bus}
        isOpen={openSections.busTypes}
        onToggle={() => toggleSection("busTypes")}
        count={filters.busTypes.length}
      >
        {options.busTypes.map((option) => (
          <label key={option.value} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-700">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={filters.busTypes.includes(option.value)}
              onChange={() => onToggleMulti("busTypes", option.value)}
            />
            {option.label}
          </label>
        ))}
      </FilterSection>

      <FilterSection
        title="Shift"
        icon={Moon}
        isOpen={openSections.shifts}
        onToggle={() => toggleSection("shifts")}
        count={filters.shifts.length}
      >
        <div className="grid grid-cols-2 gap-2">
          {options.shifts.map((option) => {
            const active = filters.shifts.includes(option.value);
            const Icon = option.value === "day" ? Sun : Moon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onToggleMulti("shifts", option.value)}
                className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${
                  active
                    ? "bg-violet-100 text-violet-700"
                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-200 hover:text-violet-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            );
          })}
        </div>
      </FilterSection>

      <FilterSection
        title="Departure Time"
        icon={Clock3}
        isOpen={openSections.departureWindows}
        onToggle={() => toggleSection("departureWindows")}
        count={filters.departureWindows.length}
      >
        <div className="grid gap-2">
          {options.departureWindows.map((window) => {
            const active = filters.departureWindows.includes(window.value);
            return (
              <button
                key={window.value}
                type="button"
                onClick={() => onToggleDepartureWindow(window.value)}
                className={`rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition ${
                  active
                    ? "border-violet-300 bg-violet-50 text-violet-700"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-200 hover:text-violet-700"
                }`}
              >
                {window.label}
              </button>
            );
          })}
        </div>
      </FilterSection>

      <FilterSection
        title="Operators"
        icon={UserRound}
        isOpen={openSections.operators}
        onToggle={() => toggleSection("operators")}
        count={filters.operators.length}
      >
        <div className="max-h-44 space-y-1 overflow-auto pr-1">
          {options.operators.map((operator) => (
            <label key={operator} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-700">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={filters.operators.includes(operator)}
                onChange={() => onToggleMulti("operators", operator)}
              />
              <span className="truncate">{operator}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      <FilterSection
        title="Vehicle Type"
        icon={Building2}
        isOpen={openSections.vehicleTypes}
        onToggle={() => toggleSection("vehicleTypes")}
        count={filters.vehicleTypes.length}
      >
        {options.vehicleTypes.map((option) => (
          <label key={option.value} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-700">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={filters.vehicleTypes.includes(option.value)}
              onChange={() => onToggleMulti("vehicleTypes", option.value)}
            />
            {option.label}
          </label>
        ))}
      </FilterSection>

      <FilterSection
        title="Seat Type"
        icon={BedDouble}
        isOpen={openSections.seatTypes}
        onToggle={() => toggleSection("seatTypes")}
        count={filters.seatTypes.length}
      >
        {options.seatTypes.map((option) => (
          <label key={option.value} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-700">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={filters.seatTypes.includes(option.value)}
              onChange={() => onToggleMulti("seatTypes", option.value)}
            />
            {option.label}
          </label>
        ))}
      </FilterSection>

      <FilterSection
        title="Facilities"
        icon={Sparkles}
        isOpen={openSections.facilities}
        onToggle={() => toggleSection("facilities")}
        count={filters.facilities.length}
      >
        {options.facilities.map((option) => (
          <label key={option.value} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-700">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={filters.facilities.includes(option.value)}
              onChange={() => onToggleMulti("facilities", option.value)}
            />
            {option.label}
          </label>
        ))}
      </FilterSection>

      <FilterSection
        title="Price Range"
        icon={CircleDollarSign}
        isOpen={openSections.priceRange}
        onToggle={() => toggleSection("priceRange")}
      >
        <PriceSlider min={options.priceBounds.min} max={options.priceBounds.max} value={filters.priceRange} onChange={onPriceChange} />
      </FilterSection>

      <FilterSection
        title="Refundable"
        icon={ShieldCheck}
        isOpen={openSections.refundable}
        onToggle={() => toggleSection("refundable")}
        count={filters.refundableOnly ? 1 : 0}
      >
        <button
          type="button"
          onClick={onToggleRefundable}
          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition ${
            filters.refundableOnly
              ? "border border-violet-200 bg-violet-50 text-violet-700"
              : "border border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          <span>Show refundable only</span>
          <span
            className={`h-5 w-10 rounded-full border transition ${
              filters.refundableOnly ? "border-violet-300 bg-violet-500" : "border-slate-300 bg-slate-200"
            }`}
          >
            <span
              className={`mt-0.5 block h-4 w-4 rounded-full bg-white transition ${
                filters.refundableOnly ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>
      </FilterSection>

      <FilterSection
        title="Boarding Points"
        icon={MapPin}
        isOpen={openSections.boardingPoints}
        onToggle={() => toggleSection("boardingPoints")}
        count={filters.boardingPoints.length}
      >
        <div className="max-h-44 space-y-1 overflow-auto pr-1">
          {options.boardingPoints.map((point) => (
            <label key={`boarding-${point}`} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-700">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={filters.boardingPoints.includes(point)}
                onChange={() => onToggleMulti("boardingPoints", point)}
              />
              <span className="truncate">{point}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      <FilterSection
        title="Dropping Points"
        icon={Ticket}
        isOpen={openSections.droppingPoints}
        onToggle={() => toggleSection("droppingPoints")}
        count={filters.droppingPoints.length}
      >
        <div className="max-h-44 space-y-1 overflow-auto pr-1">
          {options.droppingPoints.map((point) => (
            <label key={`dropping-${point}`} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-700">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={filters.droppingPoints.includes(point)}
                onChange={() => onToggleMulti("droppingPoints", point)}
              />
              <span className="truncate">{point}</span>
            </label>
          ))}
        </div>
      </FilterSection>
    </div>
  );
}
