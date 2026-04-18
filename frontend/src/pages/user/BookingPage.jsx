import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import BookingSummaryPanel from "../../components/seats/BookingSummaryPanel";
import BusImageGalleryModal from "../../components/seats/BusImageGalleryModal";
import PassengerDetailsPanel from "../../components/seats/PassengerDetailsPanel";
import SeatDeckMap from "../../components/seats/SeatDeckMap";
import { useAuth } from "../../context/AuthContext";
import { getSeatStatus, initiateEsewaPayment, lockSeats, unlockSeats } from "../../services/booking.service";
import { formatCurrency, toAbsoluteAssetUrl } from "../../utils/helpers";

const stopKey = (value) => String(value || "").trim().toLowerCase();

const parseIsoDateTimeMs = (date, time) => {
  const normalizedDate = String(date || "").trim();
  const normalizedTime = String(time || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || !/^\d{2}:\d{2}$/.test(normalizedTime)) return NaN;
  return new Date(`${normalizedDate}T${normalizedTime}:00`).getTime();
};

const normalizeSeatLabel = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");

const normalizeSeatType = (value) => {
  const normalized = String(value || "SEATER").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "SLEEPER") return "SLEEPER";
  if (normalized === "SHARED_SLEEPER") return "SHARED_SLEEPER";
  return "SEATER";
};

const normalizeSeatLabels = (seats) => {
  if (!Array.isArray(seats)) return [];
  const normalized = seats.map((seat) => normalizeSeatLabel(seat)).filter(Boolean);
  return Array.from(new Set(normalized)).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }));
};

const extractSeatLabels = (seats) => {
  if (!Array.isArray(seats)) return [];

  return normalizeSeatLabels(
    seats.map((seat) => {
      if (typeof seat === "string" || typeof seat === "number") return seat;
      if (seat && typeof seat === "object") return seat.seatLabel ?? seat.seatNumber;
      return "";
    })
  );
};

const getMyLockedSeatLabels = (locks, userId) => {
  if (!userId) return [];

  return normalizeSeatLabels(
    (Array.isArray(locks) ? locks : [])
      .filter((lock) => String(lock?.lockedBy?._id ?? lock?.lockedBy) === String(userId))
      .map((lock) => lock?.seatLabel ?? lock?.seatNumber)
  );
};

const parseLockResult = (payload, requestedSeats = []) => {
  const requested = normalizeSeatLabels(requestedSeats);
  const lockedSeats = extractSeatLabels(payload?.lockedSeats ?? payload?.seats);
  const failedSeats = extractSeatLabels(payload?.failedSeats);

  // Backward compatibility: older API returned only { seats: [...] }.
  if (lockedSeats.length === 0 && failedSeats.length === 0 && requested.length > 0) {
    return { lockedSeats: requested, failedSeats: [] };
  }

  return { lockedSeats, failedSeats };
};

const parseLockFailureSeats = (error) => {
  const data = error?.response?.data || {};

  const failedSeats = normalizeSeatLabels([
    ...extractSeatLabels(data?.failedSeats),
    ...extractSeatLabels(data?.conflictSeats),
    ...extractSeatLabels(data?.missingLocks),
    ...extractSeatLabels(data?.bookedSeats),
    ...extractSeatLabels(data?.unavailableSeats),
    ...extractSeatLabels(data?.invalidSeats),
  ]);

  if (failedSeats.length > 0) return failedSeats;

  // Legacy lock API used `lockedSeats` for conflicting seats.
  return extractSeatLabels(data?.lockedSeats);
};

const normalizeGender = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["male", "female", "other"].includes(normalized)) return normalized;
  return "";
};

const validateContact = ({ name, phone }) => {
  const normalizedName = String(name || "").trim();
  const digits = String(phone || "").replace(/\D/g, "");

  if (!normalizedName) return { ok: false, message: "Contact name is required" };
  if (digits.length < 7) return { ok: false, message: "Enter a valid phone number" };
  return { ok: true };
};

const createPlaceholderImage = ({ title, subtitle, gradientStart, gradientEnd }) => {
  const safeTitle = String(title || "Bus View").slice(0, 40);
  const safeSubtitle = String(subtitle || "SmartBus Booking").slice(0, 60);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 750'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='${gradientStart}'/>
        <stop offset='100%' stop-color='${gradientEnd}'/>
      </linearGradient>
    </defs>
    <rect width='1200' height='750' fill='url(#g)'/>
    <rect x='80' y='90' width='1040' height='570' rx='42' fill='rgba(255,255,255,0.16)' stroke='rgba(255,255,255,0.4)' stroke-width='3'/>
    <text x='600' y='350' text-anchor='middle' fill='white' font-size='62' font-family='Segoe UI, Arial, sans-serif' font-weight='700'>${safeTitle}</text>
    <text x='600' y='410' text-anchor='middle' fill='rgba(255,255,255,0.92)' font-size='30' font-family='Segoe UI, Arial, sans-serif'>${safeSubtitle}</text>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const LOCK_TTL_MS = 10 * 60 * 1000;

const formatHoldCountdown = (ms) => {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export default function BookingPage() {
  const { scheduleId, busId } = useParams();
  const activeScheduleId = scheduleId || busId || "";
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();

  const [seatStatus, setSeatStatus] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [lockedSeatLabels, setLockedSeatLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [seatSyncing, setSeatSyncing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [seatPassengers, setSeatPassengers] = useState({});

  const [boardingPoint, setBoardingPoint] = useState("");
  const [droppingPoint, setDroppingPoint] = useState("");

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const selectedSeatsRef = useRef([]);
  const pendingSeatOpsRef = useRef(0);
  const isRedirectingToPaymentRef = useRef(false);
  const holdExpiryNotifiedRef = useRef(false);
  const [holdNowMs, setHoldNowMs] = useState(() => Date.now());

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);

  const showToast = (kind, text) => {
    setToast({ kind, text, id: Date.now() });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
  };

  const redirectToLogin = (nextSelectedSeats = selectedSeats) => {
    if (!activeScheduleId) return;

    try {
      const pendingPayload = {
        scheduleId: activeScheduleId,
        selectedSeats: nextSelectedSeats,
        boardingPoint,
        droppingPoint,
        contact: {
          name: contactName,
          phone: contactPhone,
        },
        seatPassengers,
      };
      sessionStorage.setItem("pendingBooking", JSON.stringify(pendingPayload));
    } catch {
      // ignore storage errors
    }

    const redirectPath = `${location.pathname || ""}${location.search || ""}`;
    navigate(`/login?redirect=${encodeURIComponent(redirectPath || `/seats/${activeScheduleId}`)}`);
  };

  const submitEsewaForm = (formUrl, fields) => {
    if (!formUrl || !fields || typeof fields !== "object") {
      throw new Error("Payment gateway response missing form details");
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = String(formUrl);

    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = String(name);
      input.value = String(value);
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  };

  const refresh = async ({ silent = false, syncSelectionWithLocks = false } = {}) => {
    if (!activeScheduleId) return null;

    if (!silent) {
      setLoading(true);
      setLoadError("");
    }

    try {
      const data = await getSeatStatus(activeScheduleId);
      setSeatStatus(data);

      const myLockedSeats = getMyLockedSeatLabels(data?.lockedSeats, currentUser?.id);
      setLockedSeatLabels(myLockedSeats);

      if (currentUser?.id && syncSelectionWithLocks) {
        setSelectedSeats(myLockedSeats);
      }

      return data;
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || "Failed to load seat status";
      if (!silent) setLoadError(message);
      else showToast("error", message);
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const releaseSelectedSeats = async ({ silent = true } = {}) => {
    const seatsToRelease = normalizeSeatLabels(selectedSeatsRef.current);
    if (!activeScheduleId || seatsToRelease.length === 0) return true;

    if (!currentUser?.id) {
      setSelectedSeats([]);
      setLockedSeatLabels([]);
      selectedSeatsRef.current = [];
      setSeatPassengers({});
      return true;
    }

    try {
      await unlockSeats({ scheduleId: activeScheduleId, seats: seatsToRelease });
      setSelectedSeats([]);
      setLockedSeatLabels([]);
      selectedSeatsRef.current = [];
      setSeatPassengers({});
      await refresh({ silent: true });
      if (!silent) showToast("success", "Seat hold cancelled. Seats are now free.");
      return true;
    } catch (error) {
      if (!silent) {
        const message = error?.response?.data?.message || error?.message || "Failed to release selected seats";
        showToast("error", message);
      }
      return false;
    }
  };

  const removeSeatsFromSelection = (seatsToRemove) => {
    const normalizedToRemove = normalizeSeatLabels(seatsToRemove);
    if (normalizedToRemove.length === 0) return [];

    const removeSet = new Set(normalizedToRemove);

    setSelectedSeats((prev) => {
      const next = normalizeSeatLabels(prev.filter((seat) => !removeSet.has(normalizeSeatLabel(seat))));
      selectedSeatsRef.current = next;
      return next;
    });

    setLockedSeatLabels((prev) => normalizeSeatLabels(prev.filter((seat) => !removeSet.has(normalizeSeatLabel(seat)))));

    setSeatPassengers((prev) => {
      if (!prev || typeof prev !== "object") return prev;
      const next = { ...prev };
      normalizedToRemove.forEach((seatLabel) => {
        delete next[seatLabel];
      });
      return next;
    });

    return normalizedToRemove;
  };

  const ensureSelectedSeatsLocked = async () => {
    const seatsToLock = normalizeSeatLabels(selectedSeatsRef.current);

    if (!activeScheduleId || seatsToLock.length === 0) {
      return { ok: false, message: "Select at least one seat" };
    }

    if (!currentUser?.id) {
      return { ok: false, message: "Please login to continue booking" };
    }

    const classifyUnavailableSeats = (statusData, missingSeats) => {
      const normalizedMissing = normalizeSeatLabels(missingSeats);
      const bookedSet = new Set(normalizeSeatLabels(statusData?.bookedSeats || []));
      const lockedByOtherSet = new Set(
        (Array.isArray(statusData?.lockedSeats) ? statusData.lockedSeats : [])
          .filter((lock) => {
            const lockOwnerId = lock?.lockedBy?._id ?? lock?.lockedBy;
            if (lockOwnerId == null) return false;
            return String(lockOwnerId) !== String(currentUser?.id || "");
          })
          .map((lock) => lock?.seatLabel ?? lock?.seatNumber)
          .map((seat) => normalizeSeatLabel(seat))
          .filter(Boolean)
      );

      return normalizedMissing.filter((seatLabel) => bookedSet.has(seatLabel) || lockedByOtherSet.has(seatLabel));
    };

    const reconcileSeatLocks = async (requestedSeats) => {
      const latest = await refresh({ silent: true });
      const latestLocks = getMyLockedSeatLabels(latest?.lockedSeats, currentUser?.id);
      const latestLockSet = new Set(latestLocks);
      const lockedForSelection = requestedSeats.filter((seatLabel) => latestLockSet.has(seatLabel));
      const missingLocks = requestedSeats.filter((seatLabel) => !latestLockSet.has(seatLabel));

      setLockedSeatLabels(lockedForSelection);

      return {
        latest,
        lockedForSelection,
        missingLocks,
      };
    };

    let lockRequestError = null;
    let lockPayload = null;

    try {
      lockPayload = await lockSeats({ scheduleId: activeScheduleId, seats: seatsToLock });
    } catch (error) {
      lockRequestError = error;
    }

    let reconciliation = await reconcileSeatLocks(seatsToLock);
    if (reconciliation.missingLocks.length > 0) {
      try {
        await lockSeats({ scheduleId: activeScheduleId, seats: reconciliation.missingLocks });
      } catch (retryError) {
        if (!lockRequestError) lockRequestError = retryError;
      }

      reconciliation = await reconcileSeatLocks(seatsToLock);
    }

    if (reconciliation.missingLocks.length > 0) {
      const unavailableSeats = classifyUnavailableSeats(reconciliation.latest, reconciliation.missingLocks);
      if (unavailableSeats.length > 0) {
        removeSeatsFromSelection(unavailableSeats);
        return {
          ok: false,
          failedSeats: unavailableSeats,
          message: `Some seats are no longer available: ${unavailableSeats.join(", ")}`,
        };
      }

      const fallbackFailed = lockRequestError ? parseLockFailureSeats(lockRequestError) : [];
      const missingLabelText = normalizeSeatLabels(
        fallbackFailed.length > 0 ? fallbackFailed : reconciliation.missingLocks
      ).join(", ");

      return {
        ok: false,
        failedSeats: reconciliation.missingLocks,
        message: missingLabelText
          ? `Unable to secure seat lock for: ${missingLabelText}. Please try again.`
          : "Seat lock required before payment",
      };
    }

    const lockResult = parseLockResult(lockPayload, seatsToLock);
    const lockedSeatSet = new Set(reconciliation.lockedForSelection);
    const payloadMissingSeats = lockResult.failedSeats.length > 0
      ? lockResult.failedSeats
      : seatsToLock.filter((seatLabel) => !lockedSeatSet.has(seatLabel));

    if (payloadMissingSeats.length > 0) {
      return {
        ok: false,
        failedSeats: payloadMissingSeats,
        message: "Seat lock required before payment",
      };
    }

    return { ok: true, lockedSeats: reconciliation.lockedForSelection };
  };

  useEffect(() => {
    refresh({ syncSelectionWithLocks: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScheduleId]);

  useEffect(() => {
    selectedSeatsRef.current = selectedSeats;
  }, [selectedSeats]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHoldNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (isRedirectingToPaymentRef.current) return;

      const seatsToRelease = normalizeSeatLabels(selectedSeatsRef.current);
      if (!activeScheduleId || !currentUser?.id || seatsToRelease.length === 0) return;

      // Best-effort unlock when leaving seat page.
      void unlockSeats({ scheduleId: activeScheduleId, seats: seatsToRelease });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScheduleId, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id || !activeScheduleId) return;

    try {
      const raw = sessionStorage.getItem("pendingBooking");
      if (!raw) return;

      const pending = JSON.parse(raw);
      if (!pending || String(pending.scheduleId) !== String(activeScheduleId)) return;

      if (Array.isArray(pending.selectedSeats) && pending.selectedSeats.length > 0) {
        setSelectedSeats(normalizeSeatLabels(pending.selectedSeats));
      }

      const contact = pending.contact || {};
      if (contact.name) setContactName(String(contact.name));
      if (contact.phone) setContactPhone(String(contact.phone));

      if (pending.boardingPoint) setBoardingPoint(String(pending.boardingPoint));
      if (pending.droppingPoint) setDroppingPoint(String(pending.droppingPoint));

      if (pending.seatPassengers && typeof pending.seatPassengers === "object") {
        setSeatPassengers(pending.seatPassengers);
      }

      sessionStorage.removeItem("pendingBooking");
      showToast("success", "Login successful. Continue your booking.");
    } catch {
      // ignore pending parsing failures
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScheduleId, currentUser?.id]);

  useEffect(() => {
    setSeatPassengers((prev) => {
      const next = {};
      selectedSeats.forEach((seatLabel, index) => {
        const existing = prev?.[seatLabel] || {};
        next[seatLabel] = {
          name: existing.name || (index === 0 ? String(contactName || "").trim() : ""),
          phone: existing.phone || String(contactPhone || "").trim(),
          gender: normalizeGender(existing.gender) || "",
          age: existing.age || "",
          idNumber: existing.idNumber || "",
        };
      });
      return next;
    });
  }, [selectedSeats, contactName, contactPhone]);

  const toggleSeat = async (seatLabel) => {
    if (!activeScheduleId) return;

    const normalizedSeatLabel = normalizeSeatLabel(seatLabel);
    if (!normalizedSeatLabel) return;

    const isSelected = selectedSeatsRef.current.includes(normalizedSeatLabel);

    const updateLocalSeatLock = (shouldLock) => {
      setSeatStatus((prev) => {
        if (!prev || typeof prev !== "object") return prev;

        const existingLocks = Array.isArray(prev.lockedSeats) ? prev.lockedSeats : [];
        const cleanedLocks = existingLocks.filter(
          (lock) => normalizeSeatLabel(lock?.seatLabel ?? lock?.seatNumber) !== normalizedSeatLabel
        );

        if (!shouldLock) {
          return {
            ...prev,
            lockedSeats: cleanedLocks,
          };
        }

        return {
          ...prev,
          lockedSeats: [
            ...cleanedLocks,
            {
              seatLabel: normalizedSeatLabel,
              seatNumber: normalizedSeatLabel,
              lockedBy: currentUser?.id || null,
              lockedAt: new Date().toISOString(),
            },
          ],
        };
      });

      setLockedSeatLabels((prev) => {
        const cleaned = prev.filter((seat) => normalizeSeatLabel(seat) !== normalizedSeatLabel);
        if (!shouldLock) return cleaned;
        return normalizeSeatLabels([...cleaned, normalizedSeatLabel]);
      });
    };

    if (!currentUser?.id) {
      const nextSeats = isSelected
        ? selectedSeatsRef.current.filter((seat) => seat !== normalizedSeatLabel)
        : normalizeSeatLabels([...selectedSeatsRef.current, normalizedSeatLabel]);
      redirectToLogin(nextSeats);
      return;
    }

    setSelectedSeats((prev) => {
      const next = prev.includes(normalizedSeatLabel)
        ? prev.filter((seat) => seat !== normalizedSeatLabel)
        : normalizeSeatLabels([...prev, normalizedSeatLabel]);
      selectedSeatsRef.current = next;
      return next;
    });
    updateLocalSeatLock(!isSelected);

    pendingSeatOpsRef.current += 1;
    setSeatSyncing(true);

    try {
      if (isSelected) await unlockSeats({ scheduleId: activeScheduleId, seats: [normalizedSeatLabel] });
      else await lockSeats({ scheduleId: activeScheduleId, seats: [normalizedSeatLabel] });
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || (isSelected ? "Unlock failed" : "Lock failed");
      showToast("error", message);

      // Revert local optimistic state on failure.
      setSelectedSeats((prev) => {
        const next = isSelected
          ? normalizeSeatLabels([...prev, normalizedSeatLabel])
          : prev.filter((seat) => seat !== normalizedSeatLabel);
        selectedSeatsRef.current = next;
        return next;
      });
      updateLocalSeatLock(isSelected);
      await refresh({ silent: true });
    } finally {
      pendingSeatOpsRef.current = Math.max(0, pendingSeatOpsRef.current - 1);
      if (pendingSeatOpsRef.current === 0) {
        setSeatSyncing(false);
      }
    }
  };

  const handleContactChange = (field, value) => {
    if (field === "name") setContactName(value);
    if (field === "phone") setContactPhone(value);

    setSeatPassengers((prev) => {
      if (!selectedSeats.length) return prev;
      const firstSeat = selectedSeats[0];
      const existing = prev?.[firstSeat] || {};

      if (field === "name" && !String(existing.name || "").trim()) {
        return {
          ...prev,
          [firstSeat]: {
            ...existing,
            name: value,
          },
        };
      }

      if (field === "phone" && !String(existing.phone || "").trim()) {
        return {
          ...prev,
          [firstSeat]: {
            ...existing,
            phone: value,
          },
        };
      }

      return prev;
    });
  };

  const handleSeatPassengerChange = (seatLabel, field, value) => {
    setSeatPassengers((prev) => ({
      ...prev,
      [seatLabel]: {
        ...(prev?.[seatLabel] || {}),
        [field]: value,
      },
    }));
  };

  const schedule = seatStatus?.schedule;

  const boardingOptions = useMemo(() => {
    const points = Array.isArray(schedule?.boardingPoints) ? schedule.boardingPoints : [];

    return points
      .map((point) => ({
        name: String(point?.name || "").trim(),
        date: String(point?.date || "").trim(),
        time: String(point?.time || "").trim(),
        order: Number.isFinite(Number(point?.order)) && Number(point.order) > 0
          ? Math.trunc(Number(point.order))
          : null,
      }))
      .filter((point) => point.name)
      .map((point, idx) => ({
        ...point,
        idx: Number.isFinite(point.order) ? point.order - 1 : idx,
      }))
      .sort((a, b) => a.idx - b.idx || a.name.localeCompare(b.name));
  }, [schedule?.boardingPoints]);

  const droppingOptions = useMemo(() => {
    const points = Array.isArray(schedule?.droppingPoints) ? schedule.droppingPoints : [];
    const boardingMaxIdx = boardingOptions.reduce((max, point) => Math.max(max, Number(point?.idx) || 0), 0);

    return points
      .map((point) => ({
        name: String(point?.name || "").trim(),
        date: String(point?.date || "").trim(),
        time: String(point?.time || "").trim(),
        order: Number.isFinite(Number(point?.order)) && Number(point.order) > 0
          ? Math.trunc(Number(point.order))
          : null,
      }))
      .filter((point) => point.name)
      .map((point, idx) => ({
        ...point,
        idx: Number.isFinite(point.order) ? point.order - 1 : boardingMaxIdx + idx + 1,
      }))
      .sort((a, b) => a.idx - b.idx || a.name.localeCompare(b.name));
  }, [boardingOptions, schedule?.droppingPoints]);

  const selectedBoarding = useMemo(() => {
    const key = stopKey(boardingPoint);
    return boardingOptions.find((point) => stopKey(point.name) === key) || null;
  }, [boardingPoint, boardingOptions]);

  const validDroppingOptions = useMemo(() => {
    const boardingIdx = selectedBoarding?.idx;
    if (boardingIdx === undefined) return droppingOptions;
    return droppingOptions.filter((point) => point.idx > boardingIdx);
  }, [droppingOptions, selectedBoarding?.idx]);

  const selectedDropping = useMemo(() => {
    const key = stopKey(droppingPoint);
    return validDroppingOptions.find((point) => stopKey(point.name) === key) || null;
  }, [droppingPoint, validDroppingOptions]);

  useEffect(() => {
    if (!droppingPoint) return;
    const exists = validDroppingOptions.some((point) => stopKey(point.name) === stopKey(droppingPoint));
    if (!exists) setDroppingPoint("");
  }, [droppingPoint, validDroppingOptions]);

  const seatLayout = useMemo(() => (Array.isArray(seatStatus?.seatLayout) ? seatStatus.seatLayout : []), [seatStatus?.seatLayout]);

  const seatPriceMap = useMemo(() => {
    if (!seatStatus?.seatPriceMap || typeof seatStatus.seatPriceMap !== "object") return {};
    return seatStatus.seatPriceMap;
  }, [seatStatus?.seatPriceMap]);

  const seatMetaByLabel = useMemo(() => {
    const map = new Map();

    seatLayout.forEach((deck, deckIndex) => {
      const deckNumber = Number.isFinite(Number(deck?.deckNumber)) && Number(deck.deckNumber) > 0
        ? Math.trunc(Number(deck.deckNumber))
        : deckIndex + 1;
      const deckName = String(deck?.deckName || deck?.name || "").trim() || (deckNumber === 1 ? "Lower Deck" : `Deck ${deckNumber}`);

      (Array.isArray(deck?.seats) ? deck.seats : []).forEach((seat) => {
        const seatLabel = normalizeSeatLabel(seat?.seatLabel ?? seat?.seatNumber);
        if (!seatLabel || map.has(seatLabel)) return;

        const price = Number(seat?.price);
        map.set(seatLabel, {
          seatLabel,
          seatNumber: String(seat?.seatNumber || seatLabel).trim() || seatLabel,
          seatType: normalizeSeatType(seat?.seatType),
          deckName,
          price: Number.isFinite(price) ? price : undefined,
        });
      });
    });

    return map;
  }, [seatLayout]);

  const selectedSeatDetails = useMemo(() => {
    return selectedSeats.map((seatLabel) => {
      const normalizedLabel = normalizeSeatLabel(seatLabel);
      const meta = seatMetaByLabel.get(normalizedLabel);
      const mappedPrice = Number(seatPriceMap?.[normalizedLabel]);
      const resolvedPrice = Number.isFinite(meta?.price)
        ? Number(meta.price)
        : Number.isFinite(mappedPrice)
          ? mappedPrice
          : 0;

      return {
        seatLabel: normalizedLabel,
        seatNumber: meta?.seatNumber || normalizedLabel,
        seatType: meta?.seatType || "SEATER",
        deckName: meta?.deckName || "Deck",
        price: resolvedPrice,
      };
    });
  }, [seatMetaByLabel, seatPriceMap, selectedSeats]);

  const totalPrice = useMemo(
    () => selectedSeatDetails.reduce((sum, seat) => sum + (Number.isFinite(seat.price) ? seat.price : 0), 0),
    [selectedSeatDetails]
  );

  const averagePrice = selectedSeatDetails.length > 0 ? Number((totalPrice / selectedSeatDetails.length).toFixed(2)) : 0;

  const selectedSeatLockParity = useMemo(() => {
    const selected = normalizeSeatLabels(selectedSeats);
    if (selected.length === 0) return true;

    const lockedSet = new Set(normalizeSeatLabels(lockedSeatLabels));
    return selected.every((seatLabel) => lockedSet.has(seatLabel));
  }, [selectedSeats, lockedSeatLabels]);

  const continueActionLabel = seatSyncing
    ? "Syncing seats..."
    : selectedSeatLockParity
      ? "Continue"
      : "Lock seats to continue";

  const myLockedSeatEntries = useMemo(() => {
    const locks = Array.isArray(seatStatus?.lockedSeats) ? seatStatus.lockedSeats : [];

    return locks
      .filter((lock) => String(lock?.lockedBy?._id ?? lock?.lockedBy) === String(currentUser?.id || ""))
      .map((lock) => {
        const seatLabel = normalizeSeatLabel(lock?.seatLabel ?? lock?.seatNumber);
        const lockedAtMs = new Date(lock?.lockedAt || 0).getTime();
        return {
          seatLabel,
          lockedAtMs,
        };
      })
      .filter((lock) => lock.seatLabel && Number.isFinite(lock.lockedAtMs));
  }, [seatStatus?.lockedSeats, currentUser?.id]);

  const holdExpiresAtMs = useMemo(() => {
    if (!myLockedSeatEntries.length) return NaN;
    const earliestLockedAt = Math.min(...myLockedSeatEntries.map((lock) => lock.lockedAtMs));
    return earliestLockedAt + LOCK_TTL_MS;
  }, [myLockedSeatEntries]);

  const holdRemainingMs = Number.isFinite(holdExpiresAtMs)
    ? Math.max(0, holdExpiresAtMs - holdNowMs)
    : 0;

  const hasActiveHold = selectedSeats.length > 0 && Number.isFinite(holdExpiresAtMs) && holdRemainingMs > 0;
  const holdTimerText = formatHoldCountdown(holdRemainingMs);

  useEffect(() => {
    if (!selectedSeats.length || !Number.isFinite(holdExpiresAtMs) || holdRemainingMs > 0) {
      holdExpiryNotifiedRef.current = false;
      return;
    }

    if (holdExpiryNotifiedRef.current) return;
    holdExpiryNotifiedRef.current = true;

    showToast("error", "Seat hold expired. Please reselect seats to continue booking.");
    void refresh({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdExpiresAtMs, holdRemainingMs, selectedSeats.length]);

  const passengerManifest = useMemo(() => {
    return selectedSeats.map((seatLabel, index) => {
      const passenger = seatPassengers?.[seatLabel] || {};
      const gender = normalizeGender(passenger.gender) || "other";
      const ageRaw = Number(passenger.age);
      const age = Number.isFinite(ageRaw) && ageRaw >= 1 && ageRaw <= 120 ? Math.trunc(ageRaw) : 30;

      return {
        seatLabel,
        name: String(passenger.name || (index === 0 ? contactName : "")).trim(),
        phone: String(passenger.phone || contactPhone).trim(),
        gender,
        age,
        idNumber: String(passenger.idNumber || "").trim(),
      };
    });
  }, [contactName, contactPhone, seatPassengers, selectedSeats]);

  const busImage = schedule?.bus?.imageUrl ? toAbsoluteAssetUrl(schedule.bus.imageUrl) : "";

  const hasUpperDeck = useMemo(() => {
    return seatLayout.some((deck, index) => {
      const deckNumber = Number.isFinite(Number(deck?.deckNumber)) ? Number(deck.deckNumber) : index + 1;
      const name = String(deck?.deckName || deck?.name || "").toLowerCase();
      return deckNumber > 1 || name.includes("upper");
    });
  }, [seatLayout]);

  const galleryImages = useMemo(() => {
    const exterior = busImage || createPlaceholderImage({
      title: "Bus Exterior",
      subtitle: "SmartBus departure view",
      gradientStart: "#fb923c",
      gradientEnd: "#f97316",
    });

    const interior = createPlaceholderImage({
      title: "Seat Interior",
      subtitle: "Aisle and seat comfort view",
      gradientStart: "#14b8a6",
      gradientEnd: "#0ea5e9",
    });

    const sleeper = createPlaceholderImage({
      title: hasUpperDeck ? "Upper Deck Sleeper" : "Passenger Cabin",
      subtitle: hasUpperDeck ? "Sleeper deck perspective" : "Cabin perspective",
      gradientStart: "#a78bfa",
      gradientEnd: "#7c3aed",
    });

    return [
      {
        src: exterior,
        label: "Exterior bus image",
        description: "Main profile of your selected bus",
      },
      {
        src: interior,
        label: "Seat interior layout",
        description: "Interior seat arrangement overview",
      },
      {
        src: sleeper,
        label: hasUpperDeck ? "Sleeper upper deck view" : "Passenger cabin view",
        description: hasUpperDeck ? "Dedicated sleeper deck perspective" : "Cabin arrangement and comfort zone",
      },
    ];
  }, [busImage, hasUpperDeck]);

  const onProceed = async () => {
    if (!activeScheduleId) {
      showToast("error", "Invalid schedule selected");
      return;
    }

    if (seatSyncing) {
      showToast("error", "Seat changes are still syncing. Please wait a moment.");
      return;
    }

    if (selectedSeats.length === 0) {
      showToast("error", "Select at least one seat");
      return;
    }

    if (!selectedBoarding?.name) {
      showToast("error", "Select a boarding point");
      return;
    }

    if (!selectedDropping?.name) {
      showToast("error", "Select a dropping point");
      return;
    }

    if (selectedDropping.idx <= selectedBoarding.idx) {
      showToast("error", "Dropping point must be after boarding point");
      return;
    }

    const boardingMs = parseIsoDateTimeMs(selectedBoarding.date, selectedBoarding.time);
    const droppingMs = parseIsoDateTimeMs(selectedDropping.date, selectedDropping.time);

    if (!Number.isFinite(boardingMs) || !Number.isFinite(droppingMs) || droppingMs <= boardingMs) {
      showToast("error", "Invalid boarding and dropping schedule times");
      return;
    }

    const contactValidation = validateContact({ name: contactName, phone: contactPhone });
    if (!contactValidation.ok) {
      showToast("error", contactValidation.message);
      return;
    }

    if (!currentUser?.id) {
      redirectToLogin(selectedSeats);
      return;
    }

    const primaryPassenger = passengerManifest[0] || {};
    const passengerName = String(primaryPassenger.name || contactName).trim();
    const passengerPhone = String(primaryPassenger.phone || contactPhone).trim();
    const passengerGender = normalizeGender(primaryPassenger.gender) || "other";
    const ageRaw = Number(primaryPassenger.age);
    const passengerAge = Number.isFinite(ageRaw) && ageRaw >= 1 && ageRaw <= 120 ? Math.trunc(ageRaw) : 30;

    if (!passengerName) {
      showToast("error", "Passenger name is required for at least one selected seat");
      return;
    }

    if (String(passengerPhone).replace(/\D/g, "").length < 7) {
      showToast("error", "Passenger phone is invalid");
      return;
    }

    setActionLoading(true);
    isRedirectingToPaymentRef.current = false;

    try {
      const lockCheck = await ensureSelectedSeatsLocked();
      if (!lockCheck.ok) {
        showToast("error", lockCheck.message || "Failed to secure seat lock for payment");
        return;
      }

      const seatsForPayment = normalizeSeatLabels(lockCheck.lockedSeats || selectedSeatsRef.current);
      if (seatsForPayment.length === 0) {
        showToast("error", "Seat lock required before payment");
        return;
      }

      const selectedSnapshot = normalizeSeatLabels(selectedSeatsRef.current);
      const paymentSeatSet = new Set(seatsForPayment);
      const lockMismatch = selectedSnapshot.length !== seatsForPayment.length
        || selectedSnapshot.some((seatLabel) => !paymentSeatSet.has(seatLabel));
      if (lockMismatch) {
        showToast("error", "Seat lock required before payment");
        return;
      }

      const passengersPayload = passengerManifest.map((item, index) => {
        const ageCandidate = Number(item?.age);
        const normalizedAge = Number.isFinite(ageCandidate) && ageCandidate >= 1 && ageCandidate <= 120
          ? Math.trunc(ageCandidate)
          : passengerAge;

        const fallbackName = index === 0 ? passengerName : `Passenger ${index + 1}`;
        const normalizedName = String(item?.name || fallbackName).trim() || fallbackName;
        const normalizedPhone = String(item?.phone || passengerPhone).trim() || passengerPhone;
        const normalizedGender = normalizeGender(item?.gender) || passengerGender;
        const normalizedSeat = String(item?.seatLabel || seatsForPayment[index] || "").trim().toUpperCase();
        const idNumber = String(item?.idNumber || "").trim();

        return {
          seatLabel: normalizedSeat,
          name: normalizedName,
          phone: normalizedPhone,
          gender: normalizedGender,
          age: normalizedAge,
          ...(idNumber ? { idNumber } : {}),
        };
      });

      const paymentPayload = {
        scheduleId: activeScheduleId,
        seats: seatsForPayment,
        passenger: {
          name: passengerName,
          age: passengerAge,
          gender: passengerGender,
          phone: passengerPhone,
        },
        passengers: passengersPayload,
        boardingPoint: selectedBoarding.name,
        droppingPoint: selectedDropping.name,
      };

      let payment;

      try {
        payment = await initiateEsewaPayment(paymentPayload);
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || "Booking failed";
        if (!String(message).toLowerCase().includes("seat lock required")) {
          throw error;
        }

        const retryLockCheck = await ensureSelectedSeatsLocked();
        if (!retryLockCheck.ok) {
          showToast("error", retryLockCheck.message || message);
          return;
        }

        payment = await initiateEsewaPayment(paymentPayload);
      }

      isRedirectingToPaymentRef.current = true;
      showToast("success", "Redirecting to payment gateway...");
      submitEsewaForm(payment.formUrl, payment.fields);
    } catch (error) {
      isRedirectingToPaymentRef.current = false;

      if (error?.response?.status === 401) {
        redirectToLogin(selectedSeats);
        return;
      }

      const message = error?.response?.data?.message || error?.message || "Booking failed";
      showToast("error", message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBackToSearch = async () => {
    await releaseSelectedSeats({ silent: true });
    navigate("/search");
  };

  const handleCancelHold = async () => {
    if (!selectedSeatsRef.current.length) {
      showToast("error", "No selected seats to cancel");
      return;
    }

    setActionLoading(true);
    try {
      await releaseSelectedSeats({ silent: false });
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  if (!activeScheduleId) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">
          Invalid seat selection URL.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-10">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="skeleton h-12 w-2/3" />
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_340px]">
            <div className="skeleton h-130 w-full" />
            <div className="skeleton h-130 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError && !seatStatus) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">
          <p className="font-semibold">{loadError}</p>
          <button
            type="button"
            onClick={() => refresh()}
            className="mt-3 inline-flex items-center rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-28 md:pb-6">
      {toast ? (
        <div
          key={toast.id}
          className={`fixed right-4 top-4 z-50 max-w-[92vw] rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg ${
            toast.kind === "success" ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          {toast.text}
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBackToSearch}
            disabled={actionLoading || seatSyncing}
            className="inline-flex items-center text-sm font-semibold text-slate-600 transition hover:text-slate-900 disabled:opacity-60"
          >
            ← Back to Search
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelHold}
              disabled={actionLoading || seatSyncing || selectedSeats.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
            >
              Cancel Hold
            </button>

            <button
              type="button"
              onClick={() => refresh({ silent: true })}
              disabled={actionLoading || seatSyncing}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh Seats
            </button>
          </div>
        </div>

        <header className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">{schedule?.bus?.name || "Seat Selection"}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {schedule?.route?.source || "Source"} to {schedule?.route?.destination || "Destination"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {schedule?.date || ""} {schedule?.time ? `at ${schedule.time}` : ""}
          </p>
        </header>

        <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Choose Your Seats</h2>
                  <p className="text-xs text-slate-500">Real-time seat availability with deck-aware selection. Seat hold is valid for 10 minutes.</p>
                </div>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {selectedSeats.length} selected
                </span>
                {seatSyncing ? (
                  <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    Syncing...
                  </span>
                ) : null}
                {selectedSeats.length > 0 ? (
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${hasActiveHold ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    Hold: {hasActiveHold ? holdTimerText : "syncing"}
                  </span>
                ) : null}
              </div>

              <SeatDeckMap
                totalSeats={seatStatus?.totalSeats || 0}
                seatLayout={seatStatus?.seatLayout || []}
                bookedSeats={seatStatus?.bookedSeats || []}
                lockedSeats={seatStatus?.lockedSeats || []}
                selectedSeats={selectedSeats}
                myUserId={currentUser?.id}
                onToggleSeat={toggleSeat}
              />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Bus Image Gallery</h2>
                  <p className="text-xs text-slate-500">Tap any image to open full-screen preview.</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {galleryImages.map((image, index) => (
                  <button
                    key={`gallery-preview-${image.label}`}
                    type="button"
                    onClick={() => {
                      setGalleryStartIndex(index);
                      setGalleryOpen(true);
                    }}
                    className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm"
                  >
                    <img
                      src={image.src}
                      alt={image.label}
                      className="h-24 w-full object-cover transition duration-300 group-hover:scale-105 sm:h-28"
                    />
                    <div className="border-t border-slate-200 bg-white px-2 py-1 text-left text-[11px] font-semibold text-slate-600">
                      {image.label}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </section>

          <aside className="space-y-4">
            <div className="hidden md:block">
              <BookingSummaryPanel
                selectedSeatDetails={selectedSeatDetails}
                averagePrice={averagePrice}
                totalPrice={totalPrice}
                actionLoading={actionLoading || seatSyncing}
                actionLabel={continueActionLabel}
                onContinue={onProceed}
                showDesktopAction
              />
            </div>

            <PassengerDetailsPanel
              selectedSeats={selectedSeats}
              seatPassengers={seatPassengers}
              contactName={contactName}
              contactPhone={contactPhone}
              onContactChange={handleContactChange}
              onSeatPassengerChange={handleSeatPassengerChange}
              boardingOptions={boardingOptions}
              droppingOptions={validDroppingOptions}
              boardingPoint={boardingPoint}
              droppingPoint={droppingPoint}
              onBoardingPointChange={setBoardingPoint}
              onDroppingPointChange={setDroppingPoint}
            />

            <div className="md:hidden">
              <BookingSummaryPanel
                selectedSeatDetails={selectedSeatDetails}
                averagePrice={averagePrice}
                totalPrice={totalPrice}
                actionLoading={actionLoading || seatSyncing}
                actionLabel={continueActionLabel}
                onContinue={onProceed}
                showDesktopAction={false}
              />
            </div>
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <div className="mx-auto max-w-7xl">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <p className="font-semibold text-slate-500">Seats Selected</p>
              <p className="truncate font-bold text-slate-900">
                {selectedSeatDetails.length ? selectedSeatDetails.map((seat) => seat.seatNumber).join(", ") : "None"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-slate-500">Total</p>
              <p className="text-base font-extrabold text-[rgb(var(--seat-primary))]">{formatCurrency(totalPrice)}</p>
            </div>
          </div>

          <button
            type="button"
            disabled={selectedSeatDetails.length === 0 || actionLoading || seatSyncing}
            onClick={onProceed}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[rgb(var(--seat-primary))] px-4 text-sm font-bold text-white transition hover:bg-[rgb(var(--seat-primary-strong))] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionLoading ? "Processing..." : continueActionLabel}
          </button>
        </div>
      </div>

      <BusImageGalleryModal
        open={galleryOpen}
        images={galleryImages}
        startIndex={galleryStartIndex}
        onClose={() => setGalleryOpen(false)}
      />
    </div>
  );
}
