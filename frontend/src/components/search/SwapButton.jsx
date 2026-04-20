import { ArrowLeftRight } from "lucide-react";

export default function SwapButton({ onClick, disabled = false, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Swap locations"
      className={[
        "inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition",
        "hover:border-violet-300 hover:text-violet-700 active:scale-95",
        "focus:outline-none focus:ring-4 focus:ring-violet-100",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      ].join(" ")}
    >
      <ArrowLeftRight className="h-4.5 w-4.5" />
    </button>
  );
}

