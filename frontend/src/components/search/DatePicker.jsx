import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addDays = (date, amount) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);

const parseDateKey = (value) => {
  const raw = String(value || "").trim();
  if (!DATE_RE.test(raw)) return null;

  const [yearRaw, monthRaw, dayRaw] = raw.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;

  return startOfDay(parsed);
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (date) =>
  date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const isSameDay = (left, right) =>
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate();

const isBeforeDay = (left, right) => left.getTime() < right.getTime();

const buildCalendarGrid = (currentMonth) => {
  const monthStart = startOfMonth(currentMonth);
  const firstWeekday = monthStart.getDay();
  const gridStart = addDays(monthStart, -firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      key: formatDateKey(date),
      date,
      dayLabel: date.getDate(),
      inCurrentMonth: date.getMonth() === monthStart.getMonth(),
    };
  });
};

const resolveMinDate = (minDate, today) => {
  const parsedMin = parseDateKey(minDate);
  if (!parsedMin) return today;
  return isBeforeDay(parsedMin, today) ? today : parsedMin;
};

export default function DatePicker({ value, onChange, minDate }) {
  const rootRef = useRef(null);
  const popupRef = useRef(null);
  const triggerRef = useRef(null);
  const dayButtonRefs = useRef(new Map());

  const today = useMemo(() => startOfDay(new Date()), []);
  const minAllowedDate = useMemo(() => resolveMinDate(minDate, today), [minDate, today]);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => parseDateKey(value));
  const [currentMonth, setCurrentMonth] = useState(() => {
    const initial = parseDateKey(value) || minAllowedDate || today;
    return startOfMonth(initial);
  });
  const [focusedDate, setFocusedDate] = useState(() => parseDateKey(value) || minAllowedDate || today);
  const [desktopPopupStyle, setDesktopPopupStyle] = useState(null);

  useEffect(() => {
    const parsed = parseDateKey(value);
    setSelectedDate(parsed);

    if (parsed) {
      setFocusedDate(parsed);
      setCurrentMonth(startOfMonth(parsed));
    }
  }, [value]);

  useEffect(() => {
    if (!selectedDate) return;
    if (!isBeforeDay(selectedDate, minAllowedDate)) return;

    setSelectedDate(null);
    if (typeof onChange === "function") {
      onChange("");
    }
  }, [minAllowedDate, onChange, selectedDate]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target) && !popupRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setDesktopPopupStyle(null);
      return;
    }

    const updatePosition = () => {
      const triggerEl = triggerRef.current;
      if (!triggerEl) return;

      const rect = triggerEl.getBoundingClientRect();
      const viewportW = window.innerWidth || 0;
      const viewportH = window.innerHeight || 0;

      const basePopupWidth = 352; // Tailwind w-88
      const popupWidth = Math.max(240, Math.min(basePopupWidth, viewportW - 24));
      const popupHeight = 430; // approximate; enough to decide flip
      const gap = 8;

      const preferBelowTop = rect.bottom + gap;
      const preferAboveTop = rect.top - gap - popupHeight;
      const fitsBelow = preferBelowTop + popupHeight <= viewportH - 12;

      const top = fitsBelow ? preferBelowTop : Math.max(12, preferAboveTop);
      const alignLeft = rect.left;
      const alignRight = rect.right - popupWidth;
      const idealLeft = (alignLeft + popupWidth <= viewportW - 12) ? alignLeft : alignRight;
      const left = Math.min(Math.max(12, idealLeft), Math.max(12, viewportW - popupWidth - 12));

      setDesktopPopupStyle({
        position: "fixed",
        top,
        left,
        width: popupWidth,
        zIndex: 60,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const targetDate = focusedDate || selectedDate || minAllowedDate;
    const targetKey = formatDateKey(targetDate);
    const targetButton = dayButtonRefs.current.get(targetKey);

    if (targetButton) {
      requestAnimationFrame(() => {
        targetButton.focus();
      });
    }
  }, [focusedDate, isOpen, minAllowedDate, selectedDate]);

  const calendarDays = useMemo(() => buildCalendarGrid(currentMonth), [currentMonth]);
  const monthLabel = useMemo(
    () => currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    [currentMonth]
  );

  const isDateDisabled = (date) => isBeforeDay(date, minAllowedDate);

  const openCalendar = () => {
    const baseDate = selectedDate && !isDateDisabled(selectedDate) ? selectedDate : minAllowedDate;
    setFocusedDate(baseDate);
    setCurrentMonth(startOfMonth(baseDate));
    setIsOpen(true);
  };

  const closeCalendar = ({ focusTrigger = true } = {}) => {
    setIsOpen(false);
    if (focusTrigger) {
      requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }
  };

  const selectDate = (date, { closeAfterSelect = true } = {}) => {
    if (isDateDisabled(date)) return;

    const normalized = startOfDay(date);
    setSelectedDate(normalized);
    setFocusedDate(normalized);
    setCurrentMonth(startOfMonth(normalized));

    if (typeof onChange === "function") {
      onChange(formatDateKey(normalized));
    }

    if (closeAfterSelect) {
      closeCalendar({ focusTrigger: true });
    }
  };

  const goToPreviousMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const clearDate = () => {
    setSelectedDate(null);
    if (typeof onChange === "function") {
      onChange("");
    }
    closeCalendar({ focusTrigger: true });
  };

  const moveFocusBy = (dayOffset) => {
    const baseDate = focusedDate || selectedDate || minAllowedDate;
    let candidate = addDays(baseDate, dayOffset);

    if (isDateDisabled(candidate)) {
      candidate = minAllowedDate;
    }

    setFocusedDate(candidate);
    setCurrentMonth(startOfMonth(candidate));
  };

  const handleKeyDown = (event) => {
    const { key } = event;

    if (!isOpen) {
      if (key === "Enter" || key === " " || key === "ArrowDown") {
        event.preventDefault();
        openCalendar();
      }
      return;
    }

    if (key === "Escape") {
      event.preventDefault();
      closeCalendar({ focusTrigger: true });
      return;
    }

    if (key === "ArrowLeft") {
      event.preventDefault();
      moveFocusBy(-1);
      return;
    }

    if (key === "ArrowRight") {
      event.preventDefault();
      moveFocusBy(1);
      return;
    }

    if (key === "ArrowUp") {
      event.preventDefault();
      moveFocusBy(-7);
      return;
    }

    if (key === "ArrowDown") {
      event.preventDefault();
      moveFocusBy(7);
      return;
    }

    if (key === "PageUp") {
      event.preventDefault();
      setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
      return;
    }

    if (key === "PageDown") {
      event.preventDefault();
      setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
      return;
    }

    if (key === "Enter") {
      event.preventDefault();
      const targetDate = focusedDate || selectedDate || minAllowedDate;
      selectDate(targetDate, { closeAfterSelect: true });
    }
  };

  const quickOptions = useMemo(() => {
    const dates = [today, addDays(today, 1), addDays(today, 2)];
    return [
      { label: "Today", date: dates[0] },
      { label: "Tomorrow", date: dates[1] },
      { label: "Day after tomorrow", date: dates[2] },
    ];
  }, [today]);

  const renderCalendarBody = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goToPreviousMonth}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-orange-300 hover:text-orange-600"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <p className="display-title text-sm font-bold tracking-tight text-slate-900">{monthLabel}</p>

        <button
          type="button"
          onClick={goToNextMonth}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-orange-300 hover:text-orange-600"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {WEEKDAY_LABELS.map((weekday) => (
          <span key={weekday} className="py-1">
            {weekday}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Calendar dates">
        {calendarDays.map((cell) => {
          const isToday = isSameDay(cell.date, today);
          const isSelected = selectedDate ? isSameDay(cell.date, selectedDate) : false;
          const isFocused = focusedDate ? isSameDay(cell.date, focusedDate) : false;
          const isDisabled = isDateDisabled(cell.date);

          return (
            <button
              key={cell.key}
              ref={(node) => {
                if (!node) {
                  dayButtonRefs.current.delete(cell.key);
                  return;
                }
                dayButtonRefs.current.set(cell.key, node);
              }}
              type="button"
              role="gridcell"
              tabIndex={isFocused ? 0 : -1}
              aria-selected={isSelected}
              disabled={isDisabled}
              onClick={() => selectDate(cell.date, { closeAfterSelect: true })}
              className={[
                "h-10 rounded-xl text-sm font-semibold transition-all duration-150",
                cell.inCurrentMonth ? "text-slate-800" : "text-slate-400",
                isToday ? "ring-1 ring-orange-300" : "",
                isSelected ? "bg-orange-500 text-white shadow-md shadow-orange-200" : "",
                !isSelected && !isDisabled ? "hover:bg-orange-50 hover:text-orange-700" : "",
                isDisabled ? "cursor-not-allowed text-slate-300 opacity-60" : "",
                isFocused && !isSelected ? "ring-2 ring-orange-200" : "",
              ].join(" ")}
            >
              <span>{cell.dayLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick Dates</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {quickOptions.map((option) => {
            const disabled = isDateDisabled(option.date);
            const active = selectedDate ? isSameDay(option.date, selectedDate) : false;

            return (
              <button
                key={option.label}
                type="button"
                disabled={disabled}
                onClick={() => selectDate(option.date, { closeAfterSelect: true })}
                className={[
                  "rounded-lg border px-3 py-2 text-xs font-semibold transition",
                  active ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-700",
                  !active && !disabled ? "hover:border-orange-300 hover:text-orange-700" : "",
                  disabled ? "cursor-not-allowed opacity-50" : "",
                ].join(" ")}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? closeCalendar({ focusTrigger: false }) : openCalendar())}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="inline-flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 pr-12 text-left text-sm text-slate-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
      >
        <span className="inline-flex items-center gap-2 text-slate-700">
          <CalendarDays className="h-4 w-4 text-orange-500" />
          <span>{selectedDate ? formatDisplayDate(selectedDate) : "Select travel date"}</span>
        </span>

        {selectedDate ? (
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
            {formatDateKey(selectedDate)}
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500" />
        )}
      </button>

      {selectedDate ? (
        <button
          type="button"
          onClick={clearDate}
          className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
          aria-label="Clear selected date"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {isOpen ? (
        (typeof document !== "undefined"
          ? createPortal(
            <div
              ref={popupRef}
              className="hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-300/60 md:block"
              style={desktopPopupStyle || undefined}
            >
              {renderCalendarBody()}
            </div>,
            document.body
          )
          : null)
      ) : null}

      {isOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => closeCalendar({ focusTrigger: true })}
            aria-label="Close date picker"
          />

          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-slate-200 bg-white p-4 shadow-[0_-12px_48px_rgba(15,23,42,0.22)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="display-title text-base font-bold text-slate-900">Select travel date</p>
              <button
                type="button"
                onClick={() => closeCalendar({ focusTrigger: true })}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-orange-300 hover:text-orange-600"
                aria-label="Close date picker"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto pb-2">{renderCalendarBody()}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
