import { Loader2, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { searchLocations } from "../../services/booking.service";

const TYPE_LABELS = Object.freeze({
  city: "City",
  district: "District",
  stop: "Stop",
});

const normalizeText = (value) => String(value || "").trim();
const normalizeKey = (value) => normalizeText(value).toLowerCase();

const splitHighlight = (label, query) => {
  const safeLabel = String(label || "");
  const safeQuery = normalizeText(query);
  if (!safeQuery) {
    return { before: safeLabel, match: "", after: "" };
  }

  const labelLower = safeLabel.toLowerCase();
  const queryLower = safeQuery.toLowerCase();
  const index = labelLower.indexOf(queryLower);
  if (index === -1) {
    return { before: safeLabel, match: "", after: "" };
  }

  const before = safeLabel.slice(0, index);
  const match = safeLabel.slice(index, index + safeQuery.length);
  const after = safeLabel.slice(index + safeQuery.length);
  return { before, match, after };
};

export default function LocationAutocompleteInput({
  id,
  labelContent,
  value,
  onValueChange,
  placeholder,
  required = false,
  wrapperClassName = "block",
  labelClassName = "mb-1.5 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600",
  inputClassName,
  dropdownClassName = "absolute left-0 right-0 z-40 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg",
  debounceMs = 300,
  minChars = 1,
  limit = 10,
  loadingText = "Searching locations...",
  emptyHintText = "Type to search locations",
  noResultsText = "No results found",
  highlightClassName = "font-semibold text-violet-700",
  onSelect,
}) {
  const wrapperRef = useRef(null);
  const cacheRef = useRef(new Map());

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState([]);

  const query = normalizeText(value);
  const normalizedQuery = normalizeKey(query);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  useEffect(() => {
    if (query.length < minChars) {
      setSuggestions([]);
      setError("");
      setLoading(false);
      setHighlightedIndex(-1);
      return undefined;
    }

    const cacheKey = `${normalizedQuery}::${limit}`;
    const cachedSuggestions = cacheRef.current.get(cacheKey);
    if (cachedSuggestions) {
      setSuggestions(cachedSuggestions);
      setError("");
      setLoading(false);
      return undefined;
    }

    let isCancelled = false;
    setLoading(true);
    setError("");

    const timer = setTimeout(async () => {
      try {
        const data = await searchLocations({ q: query, limit });
        const safeSuggestions = Array.isArray(data) ? data.slice(0, limit) : [];
        if (isCancelled) return;
        cacheRef.current.set(cacheKey, safeSuggestions);
        setSuggestions(safeSuggestions);
      } catch (fetchError) {
        if (isCancelled) return;
        setSuggestions([]);
        setError(fetchError?.response?.data?.message || fetchError?.message || "Failed to load suggestions");
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [debounceMs, limit, minChars, normalizedQuery, query]);

  useEffect(() => {
    if (suggestions.length === 0) {
      setHighlightedIndex(-1);
      return;
    }

    if (highlightedIndex >= suggestions.length) {
      setHighlightedIndex(suggestions.length - 1);
    }
  }, [highlightedIndex, suggestions]);

  const suggestionRows = useMemo(() => {
    return suggestions.map((item) => {
      const name = normalizeText(item?.name);
      const type = normalizeKey(item?.type);
      const label = TYPE_LABELS[type] || "Location";
      return {
        name,
        type,
        typeLabel: label,
      };
    }).filter((item) => item.name);
  }, [suggestions]);

  const selectSuggestion = (item) => {
    const nextValue = normalizeText(item?.name);
    if (!nextValue) return;
    onValueChange(nextValue);
    setIsOpen(false);
    setHighlightedIndex(-1);
    if (typeof onSelect === "function") {
      onSelect(item);
    }
  };

  const onInputChange = (event) => {
    onValueChange(event.target.value);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const onInputKeyDown = (event) => {
    if (!isOpen) {
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestionRows.length > 0) {
        event.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      if (suggestionRows.length === 0) return;
      event.preventDefault();
      setHighlightedIndex((prev) => {
        if (prev < 0) return 0;
        return (prev + 1) % suggestionRows.length;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      if (suggestionRows.length === 0) return;
      event.preventDefault();
      setHighlightedIndex((prev) => {
        if (prev < 0) return suggestionRows.length - 1;
        return (prev - 1 + suggestionRows.length) % suggestionRows.length;
      });
      return;
    }

    if (event.key === "Enter") {
      if (!isOpen || suggestionRows.length === 0) return;
      if (highlightedIndex < 0 || highlightedIndex >= suggestionRows.length) return;
      event.preventDefault();
      selectSuggestion(suggestionRows[highlightedIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const shouldRenderDropdown = isOpen && (query.length > 0 || loading || Boolean(error));

  return (
    <label className={wrapperClassName} ref={wrapperRef}>
      {labelContent ? <span className={labelClassName}>{labelContent}</span> : null}
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={onInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onInputKeyDown}
          autoComplete="off"
          required={required}
          placeholder={placeholder}
          className={inputClassName}
        />

        {shouldRenderDropdown ? (
          <div className={dropdownClassName} role="listbox" aria-label="Location suggestions">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {loadingText}
              </div>
            ) : error ? (
              <div className="px-3 py-2 text-xs text-rose-600">{error}</div>
            ) : query.length < minChars ? (
              <div className="px-3 py-2 text-xs text-slate-500">{emptyHintText}</div>
            ) : suggestionRows.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500">{noResultsText}</div>
            ) : (
              <div className="space-y-1">
                {suggestionRows.map((item, index) => {
                  const isActive = index === highlightedIndex;
                  const parts = splitHighlight(item.name, query);
                  return (
                    <button
                      key={`${item.name}-${item.type}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSuggestion(item)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${isActive ? "bg-violet-50 text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">
                          {parts.before}
                          {parts.match ? <span className={highlightClassName}>{parts.match}</span> : null}
                          {parts.after}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {item.typeLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </label>
  );
}
