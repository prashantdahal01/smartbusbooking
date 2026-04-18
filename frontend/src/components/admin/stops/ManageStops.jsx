import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  MapPin,
  Plus,
  RefreshCw,
  Route,
  Search,
} from "lucide-react";
import {
  addCityToDistrict,
  createDistrictWithCities,
  createStop,
  deleteCity,
  deleteDistrict,
  deleteStop,
  getDistricts,
  getRouteStops,
  getRoutes,
  updateCity,
  updateDistrict,
  updateStop,
} from "../../../services/admin.service";
import CityModal from "./CityModal";
import CityList from "./CityList";
import ConfirmDialog from "./ConfirmDialog";
import DistrictList from "./DistrictList";
import DistrictModal from "./DistrictModal";
import StopCard from "./StopCard";
import StopModal from "./StopModal";

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const normalizeStopType = (value) => {
  const type = String(value || "pickup").trim().toLowerCase();
  if (type === "drop") return "drop";
  if (type === "both") return "both";
  return "pickup";
};

const stopTypeUsesPickupLane = (value) => {
  const type = normalizeStopType(value);
  return type === "pickup" || type === "both";
};

const stopTypeUsesDropLane = (value) => {
  const type = normalizeStopType(value);
  return type === "drop" || type === "both";
};

const sharesOrderLane = (leftType, rightType) => {
  if (stopTypeUsesPickupLane(leftType) && stopTypeUsesPickupLane(rightType)) return true;
  if (stopTypeUsesDropLane(leftType) && stopTypeUsesDropLane(rightType)) return true;
  return false;
};

const describeStopLane = (value) => {
  const type = normalizeStopType(value);
  if (type === "pickup") return "pickup";
  if (type === "drop") return "drop";
  return "pickup/drop";
};

const mergeStopType = (a, b) => {
  const left = normalizeStopType(a);
  const right = normalizeStopType(b);
  if (left === right) return left;
  if (left === "both" || right === "both") return "both";
  return "both";
};

const toStopName = (raw) => {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") return raw.name;
  return "";
};

const toStopKm = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const value = raw.kmFromSource ?? raw.distanceFromSourceKm ?? raw.km;
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDistrict = (district) => {
  if (!district || typeof district !== "object") return null;

  const cityObjects = Array.isArray(district.cityObjects)
    ? district.cityObjects
    : Array.isArray(district.populatedCities)
    ? district.populatedCities
    : Array.isArray(district.cities)
    ? district.cities.map((cityName) => {
        const name = String(cityName || "").trim();
        return {
          _id: `${normalizeKey(district._id || district.name)}-${normalizeKey(name)}`,
          name,
          key: normalizeKey(name),
          district: {
            _id: district._id,
            name: district.name,
            key: district.key || normalizeKey(district.name),
          },
        };
      })
    : [];

  return {
    ...district,
    name: String(district.name || "").trim(),
    key: String(district.key || normalizeKey(district.name)),
    cityObjects,
    cities: cityObjects.map((city) => city.name),
  };
};

const getDistrictFromPayload = (payload) => {
  if (payload?.district) return normalizeDistrict(payload.district);
  return normalizeDistrict(payload);
};

const sortDistrictsByName = (districts) =>
  [...districts].sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));

const getCityList = (district) => {
  const normalized = normalizeDistrict(district);
  return Array.isArray(normalized?.cityObjects) ? normalized.cityObjects : [];
};

const upsertDistrict = (districts, district) => {
  if (!district) return districts;
  const next = normalizeDistrict(district);
  if (!next?._id) return districts;

  const index = districts.findIndex((item) => String(item?._id) === String(next._id));
  if (index === -1) {
    return sortDistrictsByName([...districts, next]);
  }

  const updated = [...districts];
  updated[index] = next;
  return sortDistrictsByName(updated);
};

const routeTimelineFromStops = (routeStops, kmByCityKey = new Map()) => {
  const byCityKey = new Map();

  (Array.isArray(routeStops) ? routeStops : [])
    .map((stop, index) => {
      const name = String(stop?.cityName || stop?.city || "").trim();
      const key = normalizeKey(stop?.cityKey || name);
      const orderRaw = Number(stop?.order);
      const order = Number.isFinite(orderRaw) && Number.isInteger(orderRaw) && orderRaw > 0 ? orderRaw : index + 1;
      const km = kmByCityKey.get(key);

      return {
        name,
        key,
        order,
        sequence: index,
        type: normalizeStopType(stop?.type),
        km: Number.isFinite(km) ? km : null,
      };
    })
    .filter((stop) => stop.name && stop.key)
    .sort((a, b) => a.order - b.order || a.sequence - b.sequence)
    .forEach((stop) => {
      const existing = byCityKey.get(stop.key);
      if (!existing) {
        byCityKey.set(stop.key, stop);
        return;
      }

      existing.type = mergeStopType(existing.type, stop.type);
      if ((existing.km === null || existing.km === undefined) && Number.isFinite(stop.km)) {
        existing.km = stop.km;
      }
    });

  return Array.from(byCityKey.values()).sort((a, b) => a.order - b.order || a.sequence - b.sequence);
};

const timelineTypeBadgeClass = (type) => {
  if (type === "drop") return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  if (type === "both") return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
};

const timelineTypeLabel = (type) => {
  if (type === "drop") return "Drop";
  if (type === "both") return "Both";
  return "Pickup";
};

const createToast = (type, message) => ({ id: Date.now(), type, message });

export default function ManageStops() {
  const [districts, setDistricts] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [routeStops, setRouteStops] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stopsLoading, setStopsLoading] = useState(false);

  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [selectedDistrictId, setSelectedDistrictId] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [districtModalState, setDistrictModalState] = useState({ open: false, mode: "create", district: null });
  const [districtSubmitting, setDistrictSubmitting] = useState(false);

  const [cityModalState, setCityModalState] = useState({ open: false, mode: "create", district: null, city: null });
  const [citySubmitting, setCitySubmitting] = useState(false);

  const [stopModalState, setStopModalState] = useState({
    open: false,
    mode: "create",
    district: null,
    city: null,
    stop: null,
    defaultType: "pickup",
  });
  const [stopSubmitting, setStopSubmitting] = useState(false);

  const [confirmState, setConfirmState] = useState({
    open: false,
    type: "",
    district: null,
    city: null,
    stop: null,
    message: "",
  });
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  const loadBase = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    setError("");
    try {
      const [routeData, districtData] = await Promise.all([getRoutes(), getDistricts()]);
      const normalizedDistricts = sortDistrictsByName((Array.isArray(districtData) ? districtData : []).map(normalizeDistrict).filter(Boolean));
      setRoutes(Array.isArray(routeData) ? routeData : []);
      setDistricts(normalizedDistricts);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load districts and routes");
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  const refreshRoutes = useCallback(async () => {
    const routeData = await getRoutes();
    setRoutes(Array.isArray(routeData) ? routeData : []);
  }, []);

  const loadStopsForRoute = useCallback(async (routeId) => {
    if (!routeId) {
      setRouteStops([]);
      return;
    }

    setStopsLoading(true);
    try {
      const response = await getRouteStops(routeId);
      setRouteStops(Array.isArray(response) ? response : []);
    } catch (err) {
      setRouteStops([]);
      setError(err?.response?.data?.message || err?.message || "Failed to load route stops");
    } finally {
      setStopsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(String(searchInput || "").trim().toLowerCase());
    }, 260);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (routes.length === 0) {
      setSelectedRouteId("");
      return;
    }

    const exists = routes.some((route) => String(route._id) === String(selectedRouteId));
    if (!exists) {
      setSelectedRouteId(String(routes[0]._id));
    }
  }, [routes, selectedRouteId]);

  useEffect(() => {
    if (districts.length === 0) {
      setSelectedDistrictId("");
      return;
    }

    const exists = districts.some((district) => String(district._id) === String(selectedDistrictId));
    if (!exists) {
      setSelectedDistrictId(String(districts[0]._id));
    }
  }, [districts, selectedDistrictId]);

  useEffect(() => {
    loadStopsForRoute(selectedRouteId);
  }, [loadStopsForRoute, selectedRouteId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const selectedRoute = useMemo(
    () => routes.find((route) => String(route._id) === String(selectedRouteId)) || null,
    [routes, selectedRouteId]
  );

  const selectedDistrict = useMemo(
    () => districts.find((district) => String(district._id) === String(selectedDistrictId)) || null,
    [districts, selectedDistrictId]
  );

  const cityOptions = useMemo(() => {
    const set = new Set();
    const list = [];

    districts.forEach((district) => {
      getCityList(district).forEach((city) => {
        const name = String(city?.name || "").trim();
        const key = normalizeKey(city?.key || name);
        if (!name || !key || set.has(key)) return;
        set.add(key);
        list.push(name);
      });
    });

    return list.sort((a, b) => a.localeCompare(b));
  }, [districts]);

  const routeStopByCityKey = useMemo(() => {
    const map = new Map();
    routeStops.forEach((stop) => {
      const cityKey = normalizeKey(stop?.cityKey || stop?.cityName || stop?.city);
      if (!cityKey || map.has(cityKey)) return;
      map.set(cityKey, stop);
    });
    return map;
  }, [routeStops]);

  const routeStopCountByDistrictKey = useMemo(() => {
    const map = new Map();
    routeStops.forEach((stop) => {
      const districtKey = normalizeKey(stop?.districtKey || stop?.district);
      if (!districtKey) return;
      map.set(districtKey, (map.get(districtKey) || 0) + 1);
    });
    return map;
  }, [routeStops]);

  const routeKmByCityKey = useMemo(() => {
    const map = new Map();
    (Array.isArray(selectedRoute?.stops) ? selectedRoute.stops : []).forEach((stop) => {
      const name = String(toStopName(stop) || "").trim();
      const key = normalizeKey(name);
      if (!key) return;
      const km = toStopKm(stop);
      if (km === null) return;
      map.set(key, km);
    });
    return map;
  }, [selectedRoute]);

  const filteredDistricts = useMemo(() => {
    if (!searchQuery) return districts;

    return districts.filter((district) => {
      const districtName = String(district?.name || "").toLowerCase();
      const districtKey = normalizeKey(district?.key || district?.name);
      const cities = getCityList(district);

      if (districtName.includes(searchQuery)) return true;
      if (cities.some((city) => String(city?.name || "").toLowerCase().includes(searchQuery))) return true;

      return routeStops.some((stop) => {
        const stopDistrictKey = normalizeKey(stop?.districtKey || stop?.district);
        if (stopDistrictKey !== districtKey) return false;
        const stopText = `${stop?.cityName || ""} ${stop?.type || ""} ${stop?.absoluteTime || ""}`.toLowerCase();
        return stopText.includes(searchQuery);
      });
    });
  }, [districts, routeStops, searchQuery]);

  useEffect(() => {
    if (filteredDistricts.length === 0) return;
    const exists = filteredDistricts.some((district) => String(district._id) === String(selectedDistrictId));
    if (!exists) {
      setSelectedDistrictId(String(filteredDistricts[0]._id));
    }
  }, [filteredDistricts, selectedDistrictId]);

  const selectedDistrictCities = useMemo(() => {
    const cities = getCityList(selectedDistrict);
    return cities.sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
  }, [selectedDistrict]);

  const filteredDistrictCities = useMemo(() => {
    if (!searchQuery) return selectedDistrictCities;

    return selectedDistrictCities.filter((city) => {
      const cityName = String(city?.name || "").toLowerCase();
      if (cityName.includes(searchQuery)) return true;

      const stop = routeStopByCityKey.get(normalizeKey(city?.key || city?.name));
      const stopText = `${stop?.type || ""} ${stop?.absoluteTime || ""}`.toLowerCase();
      return stopText.includes(searchQuery);
    });
  }, [routeStopByCityKey, searchQuery, selectedDistrictCities]);

  const routeTimeline = useMemo(() => routeTimelineFromStops(routeStops, routeKmByCityKey), [routeKmByCityKey, routeStops]);

  const routeTimelineSections = useMemo(() => {
    const picks = routeTimeline.filter((point) => point.type === "pickup" || point.type === "both");
    const drops = routeTimeline.filter((point) => point.type === "drop" || point.type === "both");

    return {
      pickups: picks,
      drops,
    };
  }, [routeTimeline]);

  const nextStopOrderByType = useMemo(() => {
    const claims = (Array.isArray(routeStops) ? routeStops : [])
      .map((stop) => ({
        order: Number(stop?.order),
        type: normalizeStopType(stop?.type),
      }))
      .filter((row) => Number.isFinite(row.order) && Number.isInteger(row.order) && row.order > 0 && row.order < 9999);

    const findNextForType = (type) => {
      let next = 1;
      while (next < 9999) {
        const occupied = claims.some((row) => row.order === next && sharesOrderLane(row.type, type));
        if (!occupied) return next;
        next += 1;
      }
      return 9998;
    };

    return {
      pickup: findNextForType("pickup"),
      drop: findNextForType("drop"),
      both: findNextForType("both"),
    };
  }, [routeStops]);

  const defaultTypeForDistrict = (district) => {
    const destinationDistrict = normalizeKey(selectedRoute?.destinationDistrict || "");
    const districtKey = normalizeKey(district?.key || district?.name);
    if (destinationDistrict && destinationDistrict === districtKey) return "drop";
    return "pickup";
  };

  const openDistrictCreate = () => {
    setDistrictModalState({ open: true, mode: "create", district: null });
  };

  const openDistrictEdit = (district) => {
    setDistrictModalState({ open: true, mode: "edit", district });
  };

  const closeDistrictModal = () => {
    if (districtSubmitting) return;
    setDistrictModalState({ open: false, mode: "create", district: null });
  };

  const handleDistrictSubmit = async (payload) => {
    setDistrictSubmitting(true);
    setError("");

    try {
      if (districtModalState.mode === "edit" && districtModalState.district?._id) {
        const response = await updateDistrict(districtModalState.district._id, { name: payload.name });
        const updatedDistrict = getDistrictFromPayload(response);
        setDistricts((prev) => upsertDistrict(prev, updatedDistrict));
        setSelectedDistrictId(String(updatedDistrict?._id || districtModalState.district._id));
        setToast(createToast("success", "District updated successfully"));
      } else {
        const response = await createDistrictWithCities({ district: payload.name, cities: payload.cities });
        const createdDistrict = getDistrictFromPayload(response);
        setDistricts((prev) => upsertDistrict(prev, createdDistrict));
        if (createdDistrict?._id) {
          setSelectedDistrictId(String(createdDistrict._id));
        }
        setToast(createToast("success", "District created successfully"));
      }

      setDistrictModalState({ open: false, mode: "create", district: null });
      if (selectedRouteId) {
        await loadStopsForRoute(selectedRouteId);
      }
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "Failed to save district";
      setError(message);
      setToast(createToast("error", message));
    } finally {
      setDistrictSubmitting(false);
    }
  };

  const requestDeleteDistrict = (district) => {
    setConfirmState({
      open: true,
      type: "district",
      district,
      city: null,
      stop: null,
      message: `Delete district "${district?.name || ""}"? This may remove cities and route stop mappings.`,
    });
  };

  const openCityCreate = (district) => {
    setCityModalState({ open: true, mode: "create", district, city: null });
  };

  const openCityEdit = (city) => {
    if (!selectedDistrict) return;
    setCityModalState({ open: true, mode: "edit", district: selectedDistrict, city });
  };

  const closeCityModal = () => {
    if (citySubmitting) return;
    setCityModalState({ open: false, mode: "create", district: null, city: null });
  };

  const handleCitySubmit = async (payload) => {
    const district = cityModalState.district;
    if (!district?._id) return;

    setCitySubmitting(true);
    setError("");

    try {
      if (cityModalState.mode === "edit" && cityModalState.city?._id) {
        const response = await updateCity(district._id, cityModalState.city._id, { name: payload.name });
        const updatedDistrict = getDistrictFromPayload(response);
        setDistricts((prev) => upsertDistrict(prev, updatedDistrict));
        setToast(createToast("success", "City updated successfully"));
      } else {
        const response = await addCityToDistrict(district._id, { name: payload.name });
        const updatedDistrict = getDistrictFromPayload(response);
        setDistricts((prev) => upsertDistrict(prev, updatedDistrict));
        setToast(createToast("success", "City added successfully"));
      }

      if (selectedRouteId) {
        await Promise.all([loadStopsForRoute(selectedRouteId), refreshRoutes()]);
      }
      setCityModalState({ open: false, mode: "create", district: null, city: null });
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "Failed to save city";
      setError(message);
      setToast(createToast("error", message));
    } finally {
      setCitySubmitting(false);
    }
  };

  const requestDeleteCity = (city) => {
    if (!selectedDistrict) return;
    const activeStop = routeStopByCityKey.get(normalizeKey(city?.key || city?.name));

    setConfirmState({
      open: true,
      type: "city",
      district: selectedDistrict,
      city,
      stop: null,
      message: activeStop
        ? `Delete city "${city?.name || ""}"? This will remove linked route stops for the selected route.`
        : `Delete city "${city?.name || ""}"?`,
    });
  };

  const openStopAdd = (city) => {
    if (!selectedRoute || !selectedDistrict) {
      setToast(createToast("error", "Select route and district first"));
      return;
    }

    setStopModalState({
      open: true,
      mode: "create",
      district: selectedDistrict,
      city,
      stop: null,
      defaultType: defaultTypeForDistrict(selectedDistrict),
    });
  };

  const openStopEdit = (city, stop) => {
    if (!selectedRoute || !selectedDistrict || !stop) return;

    setStopModalState({
      open: true,
      mode: "edit",
      district: selectedDistrict,
      city,
      stop,
      defaultType: stop?.type || "pickup",
    });
  };

  const closeStopModal = () => {
    if (stopSubmitting) return;
    setStopModalState({ open: false, mode: "create", district: null, city: null, stop: null, defaultType: "pickup" });
  };

  const requestDeleteStop = (stop) => {
    setConfirmState({
      open: true,
      type: "stop",
      district: selectedDistrict,
      city: null,
      stop,
      message: `Delete stop "${stop?.cityName || ""}" from route?`,
    });
  };

  const handleToggleStop = (city, enabled) => {
    const stop = routeStopByCityKey.get(normalizeKey(city?.key || city?.name));

    if (enabled) {
      if (stop) {
        openStopEdit(city, stop);
      } else {
        openStopAdd(city);
      }
      return;
    }

    if (stop) {
      requestDeleteStop(stop);
    }
  };

  const handleStopSubmit = async (payload) => {
    const city = stopModalState.city;
    const district = stopModalState.district;
    if (!city || !district || !selectedRouteId) return;

    const cityKey = normalizeKey(city.key || city.name);
    const existing = routeStopByCityKey.get(cityKey);
    const orderIndex = Number(payload?.orderIndex);
    const incomingType = normalizeStopType(payload?.type || existing?.type || stopModalState.defaultType);

    if (payload?.enabled) {
      if (!Number.isFinite(orderIndex) || !Number.isInteger(orderIndex) || orderIndex <= 0 || orderIndex >= 9999) {
        const message = "Order index must be an integer between 1 and 9998";
        setError(message);
        setToast(createToast("error", message));
        return;
      }

      const conflict = routeStops.find(
        (stop) =>
          Number(stop?.order) === orderIndex &&
          String(stop?._id) !== String(existing?._id || "") &&
          sharesOrderLane(stop?.type, incomingType)
      );

      if (conflict) {
        const message = `Order ${orderIndex} is already used in ${describeStopLane(incomingType)} sequence by ${conflict.cityName || conflict.city || "another stop"}`;
        setError(message);
        setToast(createToast("error", message));
        return;
      }
    }

    setStopSubmitting(true);
    setError("");

    try {
      if (stopModalState.mode === "edit" && existing?._id) {
        if (!payload.enabled) {
          await deleteStop(existing._id);
        } else {
          await updateStop(existing._id, {
            type: payload.type,
            offsetMinutes: payload.offsetMinutes,
            absoluteTime: payload.absoluteTime,
            order: orderIndex,
          });
        }
      } else {
        if (!payload.enabled) {
          setStopModalState({ open: false, mode: "create", district: null, city: null, stop: null, defaultType: "pickup" });
          return;
        }

        if (existing?._id) {
          await updateStop(existing._id, {
            type: payload.type,
            offsetMinutes: payload.offsetMinutes,
            absoluteTime: payload.absoluteTime,
            order: orderIndex,
          });
        } else {
          await createStop({
            routeId: selectedRouteId,
            city: city.name,
            type: payload.type,
            offsetMinutes: payload.offsetMinutes,
            absoluteTime: payload.absoluteTime,
            order: orderIndex,
          });
        }
      }

      await Promise.all([loadStopsForRoute(selectedRouteId), refreshRoutes()]);
      setToast(createToast("success", stopModalState.mode === "edit" ? "Stop updated" : "Stop added"));
      setStopModalState({ open: false, mode: "create", district: null, city: null, stop: null, defaultType: "pickup" });
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "Failed to save stop";
      setError(message);
      setToast(createToast("error", message));
    } finally {
      setStopSubmitting(false);
    }
  };

  const closeConfirm = () => {
    if (confirmSubmitting) return;
    setConfirmState({ open: false, type: "", district: null, city: null, stop: null, message: "" });
  };

  const handleConfirmDelete = async () => {
    if (!confirmState.open) return;

    setConfirmSubmitting(true);
    setError("");

    try {
      if (confirmState.type === "district" && confirmState.district?._id) {
        await deleteDistrict(confirmState.district._id);
        setDistricts((prev) => prev.filter((district) => String(district._id) !== String(confirmState.district._id)));
        setToast(createToast("success", "District deleted"));

        if (String(selectedDistrictId) === String(confirmState.district._id)) {
          const remaining = districts.filter((district) => String(district._id) !== String(confirmState.district._id));
          setSelectedDistrictId(remaining[0]?._id ? String(remaining[0]._id) : "");
        }

        if (selectedRouteId) {
          await Promise.all([loadStopsForRoute(selectedRouteId), refreshRoutes()]);
        }
      }

      if (confirmState.type === "city" && confirmState.district?._id && confirmState.city?._id) {
        const response = await deleteCity(confirmState.district._id, confirmState.city._id);
        const updatedDistrict = getDistrictFromPayload(response);
        setDistricts((prev) => upsertDistrict(prev, updatedDistrict));
        setToast(createToast("success", "City deleted"));

        if (selectedRouteId) {
          await Promise.all([loadStopsForRoute(selectedRouteId), refreshRoutes()]);
        }
      }

      if (confirmState.type === "stop" && confirmState.stop?._id) {
        await deleteStop(confirmState.stop._id);
        setToast(createToast("success", "Stop deleted"));

        if (selectedRouteId) {
          await Promise.all([loadStopsForRoute(selectedRouteId), refreshRoutes()]);
        }
      }

      setConfirmState({ open: false, type: "", district: null, city: null, stop: null, message: "" });
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "Delete action failed";
      setError(message);
      setToast(createToast("error", message));
    } finally {
      setConfirmSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {toast ? (
        <div
          className={`fixed right-4 top-24 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
            toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
          {toast.message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Stop Management</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Full district, city, and route stop CRUD with scalable admin workflows
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadBase({ silent: true })}
            disabled={refreshing}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openDistrictCreate}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add District
          </button>
        </div>
      </div>

      <section className="admin-surface p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search districts, cities, or stops"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>

          <select
            value={selectedRouteId}
            onChange={(event) => setSelectedRouteId(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">Select route</option>
            {routes.map((route) => (
              <option key={route._id} value={route._id}>
                {route.source} to {route.destination}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <DistrictList
          districts={filteredDistricts}
          loading={loading}
          selectedDistrictId={selectedDistrictId}
          stopCountByDistrictKey={routeStopCountByDistrictKey}
          disableActions={districtSubmitting || citySubmitting || stopSubmitting || confirmSubmitting}
          onSelect={(district) => setSelectedDistrictId(String(district._id))}
          onEdit={openDistrictEdit}
          onAddCity={openCityCreate}
          onDelete={requestDeleteDistrict}
        />

        <div className="space-y-4">
          <div className="admin-surface p-5 sm:p-6">
            {!selectedDistrict ? (
              <div className="grid min-h-56 place-items-center text-center">
                <div>
                  <Building2 className="mx-auto h-8 w-8 text-slate-400" />
                  <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">Select a district</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a district to manage cities and stops.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{selectedDistrict.name}</h3>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {selectedDistrictCities.length} cities
                      </span>
                      <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {routeStopCountByDistrictKey.get(normalizeKey(selectedDistrict.key || selectedDistrict.name)) || 0} active stops
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openCityCreate(selectedDistrict)}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Plus className="h-4 w-4" />
                      City
                    </button>
                    <button
                      type="button"
                      onClick={() => openDistrictEdit(selectedDistrict)}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <CityList
                    district={selectedDistrict}
                    cities={filteredDistrictCities}
                    routeStopByCityKey={routeStopByCityKey}
                    disableActions={citySubmitting || stopSubmitting || confirmSubmitting}
                    onAddCity={() => openCityCreate(selectedDistrict)}
                    onEditCity={openCityEdit}
                    onDeleteCity={requestDeleteCity}
                  />
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <MapPin className="h-4 w-4" />
                    Route Stops for Selected District
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {selectedRoute
                      ? `${selectedRoute.source} to ${selectedRoute.destination}`
                      : "Select a route to manage stop mapping"}
                  </p>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {stopsLoading ? (
                      Array.from({ length: 4 }).map((_, index) => (
                        <div key={`stop-skeleton-${index}`} className="skeleton h-36 w-full rounded-xl" />
                      ))
                    ) : filteredDistrictCities.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400 md:col-span-2">
                        No cities available in this district.
                      </div>
                    ) : (
                      filteredDistrictCities.map((city) => {
                        const cityKey = normalizeKey(city?.key || city?.name);
                        const stop = routeStopByCityKey.get(cityKey) || null;
                        const km = routeKmByCityKey.get(cityKey) ?? null;

                        return (
                          <StopCard
                            key={city._id || cityKey}
                            city={city}
                            district={selectedDistrict}
                            stop={stop}
                            kmFromSource={km}
                            routeSelected={Boolean(selectedRouteId)}
                            busy={stopSubmitting || confirmSubmitting}
                            onToggle={(enabled) => handleToggleStop(city, enabled)}
                            onAdd={() => openStopAdd(city)}
                            onEdit={() => openStopEdit(city, stop)}
                            onDelete={() => requestDeleteStop(stop)}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="admin-surface p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <Route className="h-4 w-4" />
              Route Timeline
            </div>
            {!selectedRoute ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Select a route to preview timeline.</p>
            ) : routeTimeline.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Timeline unavailable for this route.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/10">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Pickup Sequence</div>
                  {routeTimelineSections.pickups.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">No pickup stops defined.</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {routeTimelineSections.pickups.map((point, index) => (
                        <div key={`pickup-${point.key}-${index}`} className="flex items-center gap-2">
                          <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {point.order}. {point.name}
                            {point.km !== null && point.km !== undefined ? ` (${point.km} km)` : ""}
                          </span>
                          {index < routeTimelineSections.pickups.length - 1 ? <span className="text-slate-400">to</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900/40 dark:bg-rose-900/10">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">Drop Sequence</div>
                  {routeTimelineSections.drops.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">No drop stops defined.</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {routeTimelineSections.drops.map((point, index) => (
                        <div key={`drop-${point.key}-${index}`} className="flex items-center gap-2">
                          <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {point.order}. {point.name}
                            {point.km !== null && point.km !== undefined ? ` (${point.km} km)` : ""}
                          </span>
                          {index < routeTimelineSections.drops.length - 1 ? <span className="text-slate-400">to</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <DistrictModal
        open={districtModalState.open}
        mode={districtModalState.mode}
        district={districtModalState.district}
        submitting={districtSubmitting}
        onClose={closeDistrictModal}
        onSubmit={handleDistrictSubmit}
      />

      <CityModal
        open={cityModalState.open}
        mode={cityModalState.mode}
        district={cityModalState.district}
        city={cityModalState.city}
        existingCities={getCityList(cityModalState.district)}
        submitting={citySubmitting}
        onClose={closeCityModal}
        onSubmit={handleCitySubmit}
      />

      <StopModal
        open={stopModalState.open}
        mode={stopModalState.mode}
        district={stopModalState.district}
        city={stopModalState.city}
        stop={stopModalState.stop}
        defaultType={stopModalState.defaultType}
        initialOrderIndex={
          stopModalState.mode === "create"
            ? nextStopOrderByType[normalizeStopType(stopModalState.defaultType)]
            : stopModalState.stop?.order
        }
        submitting={stopSubmitting}
        onClose={closeStopModal}
        onSubmit={handleStopSubmit}
      />

      <ConfirmDialog
        open={confirmState.open}
        title={
          confirmState.type === "district"
            ? "Delete District?"
            : confirmState.type === "city"
            ? "Delete City?"
            : "Delete Stop?"
        }
        message={confirmState.message || "Are you sure you want to continue?"}
        confirmLabel={
          confirmState.type === "district"
            ? "Delete District"
            : confirmState.type === "city"
            ? "Delete City"
            : "Delete Stop"
        }
        cancelLabel="Cancel"
        loading={confirmSubmitting}
        onCancel={closeConfirm}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
