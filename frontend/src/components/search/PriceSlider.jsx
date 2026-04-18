import { formatCurrency } from "../../utils/helpers";

export default function PriceSlider({ min, max, value, onChange }) {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  const rangeMin = Number.isFinite(value?.[0]) ? value[0] : safeMin;
  const rangeMax = Number.isFinite(value?.[1]) ? value[1] : safeMax;

  const updateMin = (nextMin) => {
    const bounded = Math.max(safeMin, Math.min(Number(nextMin), rangeMax));
    onChange?.([bounded, rangeMax]);
  };

  const updateMax = (nextMax) => {
    const bounded = Math.min(safeMax, Math.max(Number(nextMax), rangeMin));
    onChange?.([rangeMin, bounded]);
  };

  const ratioStart = safeMax > safeMin ? ((rangeMin - safeMin) / (safeMax - safeMin)) * 100 : 0;
  const ratioEnd = safeMax > safeMin ? ((rangeMax - safeMin) / (safeMax - safeMin)) * 100 : 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
        <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">{formatCurrency(rangeMin)}</span>
        <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">{formatCurrency(rangeMax)}</span>
      </div>

      <div className="relative pt-4">
        <div className="h-1.5 rounded-full bg-slate-200" />
        <div
          className="absolute top-4 h-1.5 rounded-full bg-linear-to-r from-violet-500 to-purple-600"
          style={{ left: `${ratioStart}%`, width: `${Math.max(0, ratioEnd - ratioStart)}%` }}
        />

        <input
          type="range"
          min={safeMin}
          max={safeMax}
          value={rangeMin}
          onChange={(event) => updateMin(event.target.value)}
          className="pointer-events-auto absolute inset-x-0 top-2 h-6 w-full cursor-pointer appearance-none bg-transparent"
        />
        <input
          type="range"
          min={safeMin}
          max={safeMax}
          value={rangeMax}
          onChange={(event) => updateMax(event.target.value)}
          className="pointer-events-auto absolute inset-x-0 top-2 h-6 w-full cursor-pointer appearance-none bg-transparent"
        />
      </div>

      <div className="text-[11px] text-slate-500">
        Showing fares between {formatCurrency(rangeMin)} and {formatCurrency(rangeMax)}
      </div>
    </div>
  );
}
