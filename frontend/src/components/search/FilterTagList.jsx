import { X } from "lucide-react";

export default function FilterTagList({ tags = [], onRemove, onClearAll }) {
  if (!tags.length) return null;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Filters</p>
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-semibold text-violet-700 hover:text-violet-800"
        >
          Clear all
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <button
            key={tag.key}
            type="button"
            onClick={() => onRemove?.(tag)}
            className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
          >
            {tag.label}
            <X className="h-3 w-3" />
          </button>
        ))}
      </div>
    </div>
  );
}
