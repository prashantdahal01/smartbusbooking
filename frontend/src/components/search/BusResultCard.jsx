import { AnimatePresence, motion } from "framer-motion";
import {
  Armchair,
  ArrowRight,
  CalendarDays,
  Clock3,
  FileText,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrency } from "../../utils/helpers";

const TABS = [
  { key: "amenities", label: "Amenities", icon: Sparkles },
  { key: "boarding", label: "Boarding & Dropping", icon: MapPin },
  { key: "policies", label: "Policies", icon: FileText },
];

const formatTokenLabel = (token) =>
  String(token || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");

export default function BusResultCard({ item }) {
  const [activeTab, setActiveTab] = useState("");

  if (!item) return null;

  const toggleTab = (tabKey) => {
    setActiveTab((prev) => (prev === tabKey ? "" : tabKey));
  };

  const renderAmenities = () => {
    if (!item.amenities?.length) {
      return <p className="text-sm text-slate-500">Amenities are not listed for this trip.</p>;
    }

    return (
      <div className="flex flex-wrap gap-2">
        {item.amenities.map((amenity) => (
          <span
            key={`${item.id}-amenity-${amenity}`}
            className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700"
          >
            {formatTokenLabel(amenity)}
          </span>
        ))}
      </div>
    );
  };

  const renderBoardingDropping = () => {
    const boarding = item.boardingPoints || [];
    const dropping = item.droppingPoints || [];

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Boarding Points</p>
          {boarding.length > 0 ? (
            <ul className="space-y-1 text-sm text-slate-700">
              {boarding.map((point) => (
                <li
                  key={`${item.id}-boarding-${point.name}-${point.time || "na"}`}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <span className="font-medium">{point.name}</span>
                  {point.time ? <span className="ml-2 text-slate-500">{point.time}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Boarding points not available.</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Dropping Points</p>
          {dropping.length > 0 ? (
            <ul className="space-y-1 text-sm text-slate-700">
              {dropping.map((point) => (
                <li
                  key={`${item.id}-dropping-${point.name}-${point.time || "na"}`}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <span className="font-medium">{point.name}</span>
                  {point.time ? <span className="ml-2 text-slate-500">{point.time}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Dropping points not available.</p>
          )}
        </div>
      </div>
    );
  };

  const renderPolicies = () => {
    const policies = item.policies || [];
    if (!policies.length) {
      return <p className="text-sm text-slate-500">No specific policies available for this trip.</p>;
    }

    return (
      <ul className="space-y-2 text-sm text-slate-700">
        {policies.map((policy) => (
          <li key={`${item.id}-policy-${policy}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            {policy}
          </li>
        ))}
      </ul>
    );
  };

  const renderTabContent = () => {
    if (!activeTab) return null;

    if (activeTab === "amenities") return renderAmenities();
    if (activeTab === "boarding") return renderBoardingDropping();
    return renderPolicies();
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.24 }}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[240px_1fr_auto]">
        <div className="relative h-44 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-40 lg:h-full">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.busName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">No image</div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-linear-to-t from-black/40 to-transparent" />
          <div className="absolute left-2 top-2 rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[11px] font-semibold text-slate-700">
            <CalendarDays className="mr-1 inline h-3 w-3" />
            {item.dateLabel}
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div>
            <h3 className="truncate text-lg font-bold text-slate-900 sm:text-xl">{item.busName}</h3>
            <p className="mt-0.5 text-sm text-slate-600">
              {item.source} -&gt; {item.destination}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px]">
            {item.busTypeLabels.slice(0, 3).map((label) => (
              <span
                key={`${item.id}-type-${label}`}
                className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-semibold text-violet-700"
              >
                {label}
              </span>
            ))}
            {item.shift === "night" ? (
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700">Night</span>
            ) : (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">Day</span>
            )}
            {item.refundable ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                <ShieldCheck className="h-3 w-3" />
                Refundable
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <div>
              <p className="text-lg font-bold text-slate-900">{item.departureLabel}</p>
              <p className="text-xs text-slate-500">Departure</p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock3 className="h-4 w-4 text-violet-600" />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 0.5 }}
                className="h-px flex-1 bg-linear-to-r from-violet-500 to-purple-600"
              />
              <span className="whitespace-nowrap rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 font-semibold text-violet-700">
                {item.durationLabel}
              </span>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 0.5, delay: 0.08 }}
                className="h-px flex-1 bg-linear-to-r from-purple-600 to-violet-500"
              />
            </div>

            <div className="text-left sm:text-right">
              <p className="text-lg font-bold text-slate-900">{item.arrivalLabel}</p>
              <p className="text-xs text-slate-500">Arrival</p>
            </div>
          </div>

          <div className="text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Armchair className="h-3.5 w-3.5 text-violet-600" />
              {item.availableSeats} seats available
            </span>
          </div>
        </div>

        <div className="flex min-w-44 flex-row items-end justify-between gap-3 sm:flex-col sm:items-end sm:justify-between">
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Starting from</p>
            <p className="bg-linear-to-r from-violet-600 to-purple-700 bg-clip-text text-2xl font-extrabold text-transparent">
              {formatCurrency(item.startingPrice || 0)}
            </p>
          </div>

          <Link
            to={`/seats/${item.id}`}
            className="inline-flex items-center gap-1 rounded-lg bg-linear-to-r from-violet-600 to-purple-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(124,58,237,0.32)] transition hover:from-violet-700 hover:to-purple-800"
          >
            View Seats
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={`${item.id}-${tab.key}`}
                type="button"
                onClick={() => toggleTab(tab.key)}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border border-violet-200 bg-violet-100 text-violet-700"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence initial={false}>
          {activeTab ? (
            <motion.div
              key={`${item.id}-${activeTab}`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="pt-3">{renderTabContent()}</div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}
