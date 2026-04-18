import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

export default function FilterSection({ title, icon: Icon, isOpen, onToggle, children, count }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
          {Icon ? <Icon className="h-4 w-4 text-violet-600" /> : null}
          {title}
          {count > 0 ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] text-violet-700">{count}</span>
          ) : null}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition ${isOpen ? "rotate-180 text-violet-600" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-2 px-3 pb-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
