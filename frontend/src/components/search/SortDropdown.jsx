import { ArrowDownWideNarrow } from "lucide-react";

export default function SortDropdown({ value, options = [], onChange }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
      <ArrowDownWideNarrow className="h-4 w-4 text-violet-600" />
      <span className="font-semibold text-slate-700">Sort</span>
      <select
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        className="min-w-48 appearance-none bg-transparent text-sm font-semibold text-slate-800 outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-white text-slate-800">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
