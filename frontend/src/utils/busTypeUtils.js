export const BUS_TYPE_OPTIONS = [
  { value: "SLEEPER", label: "Sleeper" },
  { value: "SINGLE_SLEEPER", label: "Single Sleeper" },
  { value: "DOUBLE_SLEEPER", label: "Double Sleeper" },
  { value: "CABIN_SLEEPER", label: "Cabin Sleeper" },
  { value: "SINGLE_SEATER", label: "Single Seater" },
  { value: "AC", label: "AC" },
  { value: "SOFA_SEATER", label: "Sofa Seater" },
];

const BUS_TYPE_SET = new Set(BUS_TYPE_OPTIONS.map((item) => item.value));
const BUS_TYPE_LABEL_BY_VALUE = BUS_TYPE_OPTIONS.reduce((map, item) => {
  map[item.value] = item.label;
  return map;
}, {});

const SLEEPER_TYPE_SET = new Set(["SLEEPER", "SINGLE_SLEEPER", "DOUBLE_SLEEPER", "CABIN_SLEEPER"]);

const LEGACY_CATEGORY_TO_TYPES = {
  AC_SLEEPER: ["AC", "SLEEPER"],
  AC_SEATER: ["AC", "SINGLE_SEATER"],
  NON_AC_SEATER: ["SINGLE_SEATER"],
};

const LEGACY_TYPE_TO_TYPES = {
  sleeper: ["AC", "SLEEPER"],
  ac: ["AC", "SINGLE_SEATER"],
  "non-ac": ["SINGLE_SEATER"],
  nonac: ["SINGLE_SEATER"],
};

const normalizeBusTypeValue = (value) => String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");

export const normalizeBusTypes = (value) => {
  const rawList = Array.isArray(value) ? value : [];
  const seen = new Set();
  const normalized = [];

  rawList.forEach((item) => {
    const token = normalizeBusTypeValue(item);
    if (!BUS_TYPE_SET.has(token) || seen.has(token)) return;
    seen.add(token);
    normalized.push(token);
  });

  return normalized;
};

export const getBusTypesFromBus = (bus) => {
  const directTypes = normalizeBusTypes(bus?.busTypes);
  if (directTypes.length > 0) return directTypes;

  const category = String(bus?.busCategory || "").trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(LEGACY_CATEGORY_TO_TYPES, category)) {
    return [...LEGACY_CATEGORY_TO_TYPES[category]];
  }

  const legacyType = String(bus?.type || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (Object.prototype.hasOwnProperty.call(LEGACY_TYPE_TO_TYPES, legacyType)) {
    return [...LEGACY_TYPE_TO_TYPES[legacyType]];
  }

  return ["SINGLE_SEATER"];
};

export const deriveBusCategoryFromBusTypes = (busTypes) => {
  const normalized = normalizeBusTypes(busTypes);
  if (normalized.some((type) => SLEEPER_TYPE_SET.has(type))) return "AC_SLEEPER";
  if (normalized.includes("AC")) return "AC_SEATER";
  return "NON_AC_SEATER";
};

export const formatBusTypeLabel = (value) => {
  const token = normalizeBusTypeValue(value);
  return BUS_TYPE_LABEL_BY_VALUE[token] || token.replace(/_/g, " ");
};

export const getBusTypeLabels = (busOrBusTypes) => {
  const types = Array.isArray(busOrBusTypes)
    ? normalizeBusTypes(busOrBusTypes)
    : getBusTypesFromBus(busOrBusTypes);

  return types.map((type) => formatBusTypeLabel(type));
};

export const getBusTypeSummary = (busOrBusTypes, maxItems = 3) => {
  const labels = getBusTypeLabels(busOrBusTypes);
  if (labels.length === 0) return "Single Seater";
  if (labels.length <= maxItems) return labels.join(" • ");
  return `${labels.slice(0, maxItems).join(" • ")} +${labels.length - maxItems}`;
};

export const isSleeperBusType = (value) => SLEEPER_TYPE_SET.has(normalizeBusTypeValue(value));
