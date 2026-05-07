import React, { useState, useEffect } from "react";
import { Plus, Trash2, RefreshCw, MapPin, TrendingUp, AlertCircle, Cloud, Thermometer, Droplets, Wind, ExternalLink, BookOpen, ChevronDown, Download, Upload } from "lucide-react";

// Top 10 most popular consumer weather services (by user base and reviewer rankings, 2026).
// Each entry links to the service and to public documentation of its data sources where available.
const SERVICES = [
  {
    rank: 1,
    name: "The Weather Channel (weather.com)",
    url: "https://weather.com/",
    sourceLabel: "IBM GRAF + ensemble blend",
    sourceUrl: "https://www.ibm.com/products/environmental-intelligence",
    notes: "The most-downloaded weather app worldwide, ~425M monthly users. Owned by IBM. Uses IBM's Global High-Resolution Atmospheric Forecasting System (GRAF) blended with NOAA models and station data. Exact mix is proprietary.",
    matches: ["gfs_seamless"],
  },
  {
    rank: 2,
    name: "AccuWeather",
    url: "https://www.accuweather.com/",
    sourceLabel: "Proprietary AccuWeather model",
    sourceUrl: "https://www.accuweather.com/en/about",
    notes: "Famous for MinuteCast minute-by-minute precipitation forecasts. Ingests GFS, ECMWF, and other public models, then applies proprietary tuning by in-house meteorologists.",
    matches: ["gfs_seamless", "ecmwf_ifs025"],
  },
  {
    rank: 3,
    name: "Apple Weather",
    url: "https://weather.apple.com/",
    sourceLabel: "Apple WeatherKit (multi-source blend)",
    sourceUrl: "https://developer.apple.com/weatherkit/data-source-attribution/",
    notes: "Apple publishes the full model list: NOAA GFS, ECMWF, DWD ICON, Météo-France, JMA, and Environment Canada GEM. Replaced The Weather Channel as data source in iOS 16.",
    matches: ["gfs_seamless", "ecmwf_ifs025", "icon_seamless", "gem_seamless"],
  },
  {
    rank: 4,
    name: "Weather Underground",
    url: "https://www.wunderground.com/",
    sourceLabel: "IBM + personal weather station network",
    sourceUrl: "https://www.wunderground.com/about/data",
    notes: "Owned by IBM since 2012. Same forecast engine as weather.com, augmented by the world's largest network of personal weather stations for hyperlocal current conditions.",
    matches: ["gfs_seamless"],
  },
  {
    rank: 5,
    name: "Google Weather",
    url: "https://www.google.com/search?q=weather",
    sourceLabel: "weather.com (The Weather Company)",
    sourceUrl: "https://support.google.com/websearch/answer/12274493",
    notes: "Google's search weather card and Pixel Weather app surface data licensed from weather.com / The Weather Company.",
    matches: ["gfs_seamless"],
  },
  {
    rank: 6,
    name: "Windy (Windy.com)",
    url: "https://www.windy.com/",
    sourceLabel: "Multi-model viewer (you choose)",
    sourceUrl: "https://community.windy.com/topic/12/the-difference-between-the-models",
    notes: "Doesn't make its own forecast — visualizes raw output from ECMWF, GFS, ICON, NEMS, and others side-by-side. Beloved by sailors, pilots, and surfers for its 40+ map layers.",
    matches: ["ecmwf_ifs025", "gfs_seamless", "icon_seamless"],
  },
  {
    rank: 7,
    name: "NOAA / weather.gov",
    url: "https://www.weather.gov/",
    sourceLabel: "NWS forecasters + GFS/HRRR/NAM",
    sourceUrl: "https://www.weather.gov/about/forecasts",
    notes: "Official US forecasts. Human meteorologists at local NWS offices adjust output from NOAA's own model suite (GFS, HRRR, NAM, RAP). Free and public — the upstream source for many other apps.",
    matches: ["gfs_seamless"],
  },
  {
    rank: 8,
    name: "The Weather Network",
    url: "https://www.theweathernetwork.com/",
    sourceLabel: "Pelmorex proprietary forecasts",
    sourceUrl: "https://www.theweathernetwork.com/ca/about-us",
    notes: "Canada's most-used weather service, owned by Pelmorex. Combines Environment Canada GEM data with its own meteorologist team and proprietary modelling. Operates MétéoMédia in Quebec.",
    matches: ["gem_seamless", "gfs_seamless"],
  },
  {
    rank: 9,
    name: "Environment Canada (weather.gc.ca)",
    url: "https://weather.gc.ca/",
    sourceLabel: "GEM (Canadian Global model)",
    sourceUrl: "https://eccc-msc.github.io/open-data/msc-data/nwp_gem-global/readme_gem-global_en/",
    notes: "Canada's official forecasts from the Meteorological Service of Canada. Powered by the GEM model suite. Free, public, and the upstream source for nearly every Canadian weather app and broadcaster.",
    matches: ["gem_seamless"],
  },
  {
    rank: 10,
    name: "Carrot Weather",
    url: "https://www.meetcarrot.com/weather/",
    sourceLabel: "Multi-source (user-selectable)",
    sourceUrl: "https://www.meetcarrot.com/weather/faq.html",
    notes: "Snarky AI-personality weather app with a cult following. Free tier uses Foreca; premium lets you choose Apple WeatherKit, AccuWeather, Foreca, or Met Office as the forecast source.",
    matches: ["gfs_seamless", "ecmwf_ifs025", "icon_seamless", "gem_seamless"],
  },
];

// Forecast models offered by Open-Meteo (free, no key required)
const MODELS = [
  { id: "gfs_seamless", name: "NOAA GFS", color: "#e63946", origin: "USA" },
  { id: "ecmwf_ifs025", name: "ECMWF IFS", color: "#2a9d8f", origin: "Europe" },
  { id: "icon_seamless", name: "DWD ICON", color: "#f4a261", origin: "Germany" },
  { id: "gem_seamless", name: "MSC GEM", color: "#264653", origin: "Canada" },
];

// =============================================================================
// GEOCODING
// =============================================================================
// Strategy: try multiple services in sequence, since no single free geocoder
// handles every input format reliably.
//
// 1. Nominatim (OpenStreetMap) — handles full postal codes globally including
//    full 6-char Canadian codes. Rate-limited to 1 req/sec; we add a User-Agent.
// 2. Open-Meteo geocoder — fast, GeoNames-backed; great for city names but only
//    indexes Canadian postal codes at FSA (3-char) level.
// 3. Zippopotam.us — solid for US zips and Canadian FSA prefixes as last resort.
//
// We try them in the order most likely to succeed for the input format. Returns
// the first successful match.

function classifyInput(s) {
  const t = s.trim().toUpperCase();
  if (/^\d{5}(-\d{4})?$/.test(t)) {
    return { kind: "us_zip", country: "us", normalized: t.slice(0, 5) };
  }
  const ca = t.replace(/\s+/g, "");
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(ca)) {
    return {
      kind: "ca_postal",
      country: "ca",
      normalized: `${ca.slice(0, 3)} ${ca.slice(3)}`,
      fsa: ca.slice(0, 3),
    };
  }
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(t)) {
    const compact = t.replace(/\s+/g, "");
    return {
      kind: "uk_postal",
      country: "gb",
      normalized: `${compact.slice(0, -3)} ${compact.slice(-3)}`,
      outward: compact.slice(0, -3),
    };
  }
  return { kind: "name", country: null, normalized: s.trim() };
}

// --- Geocoder: Nominatim (OpenStreetMap) ---
async function geocodeNominatim(query, country) {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
    addressdetails: "1",
  });
  if (country) params.set("countrycodes", country);
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  const r = await fetch(url, {
    headers: { "Accept-Language": "en" },
  });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const data = await r.json();
  if (!data || data.length === 0) throw new Error("No Nominatim results");
  const hit = data[0];
  const addr = hit.address || {};
  const placeName =
    addr.city || addr.town || addr.village || addr.hamlet || addr.municipality ||
    addr.county || hit.name || "Unknown";
  const region = addr.state || addr.region || "";
  const cc = (addr.country_code || "").toUpperCase();
  return {
    lat: parseFloat(hit.lat),
    lon: parseFloat(hit.lon),
    name: `${placeName}${region ? ", " + region : ""}${cc ? " (" + cc + ")" : ""}`,
    timezone: "auto",
  };
}

// --- Geocoder: Open-Meteo (GeoNames) ---
async function geocodeOpenMeteo(query, country) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const data = await r.json();
  if (!data.results || data.results.length === 0) throw new Error("No Open-Meteo results");
  let pick = data.results[0];
  if (country) {
    const match = data.results.find((x) => x.country_code?.toLowerCase() === country);
    if (match) pick = match;
  }
  return {
    lat: pick.latitude,
    lon: pick.longitude,
    name: `${pick.name}${pick.admin1 ? ", " + pick.admin1 : ""}${pick.country_code ? " (" + pick.country_code + ")" : ""}`,
    timezone: pick.timezone || "auto",
  };
}

// --- Geocoder: Zippopotam.us ---
async function geocodeZippo(country, code) {
  const url = `https://api.zippopotam.us/${country}/${encodeURIComponent(code)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Zippopotam ${r.status}`);
  const data = await r.json();
  const place = data.places?.[0];
  if (!place) throw new Error("No Zippopotam places");
  return {
    lat: parseFloat(place.latitude),
    lon: parseFloat(place.longitude),
    name: `${place["place name"]}, ${place["state abbreviation"] || place.state || ""} (${country.toUpperCase()})`,
    timezone: "auto",
  };
}

// Try a list of geocoder attempts in order; return the first that succeeds.
async function tryGeocoders(attempts) {
  const errors = [];
  for (const attempt of attempts) {
    try {
      const result = await attempt.fn();
      if (result && Number.isFinite(result.lat) && Number.isFinite(result.lon)) {
        return result;
      }
    } catch (e) {
      errors.push(`${attempt.name}: ${e.message}`);
    }
  }
  throw new Error(`All geocoders failed. Tried: ${errors.join("; ")}`);
}

async function geocode(query) {
  const cls = classifyInput(query);

  // Build attempt chain based on input type, ordered by likelihood of success
  const attempts = [];

  if (cls.kind === "ca_postal") {
    // Full CA postal: Nominatim handles all 6 chars; fall back to FSA prefix
    attempts.push({ name: "Nominatim", fn: () => geocodeNominatim(cls.normalized, cls.country) });
    attempts.push({ name: "Open-Meteo (FSA)", fn: () => geocodeOpenMeteo(cls.fsa, cls.country) });
    attempts.push({ name: "Zippopotam (FSA)", fn: () => geocodeZippo("ca", cls.fsa) });
  } else if (cls.kind === "uk_postal") {
    attempts.push({ name: "Nominatim", fn: () => geocodeNominatim(cls.normalized, cls.country) });
    attempts.push({ name: "Open-Meteo (outward)", fn: () => geocodeOpenMeteo(cls.outward, cls.country) });
    attempts.push({ name: "Zippopotam", fn: () => geocodeZippo("gb", cls.outward) });
  } else if (cls.kind === "us_zip") {
    // For US zips, Zippopotam is fast and reliable; try it first
    attempts.push({ name: "Zippopotam", fn: () => geocodeZippo("us", cls.normalized) });
    attempts.push({ name: "Nominatim", fn: () => geocodeNominatim(cls.normalized, cls.country) });
    attempts.push({ name: "Open-Meteo", fn: () => geocodeOpenMeteo(cls.normalized, cls.country) });
  } else {
    // City names: Open-Meteo is fastest for this case
    attempts.push({ name: "Open-Meteo", fn: () => geocodeOpenMeteo(cls.normalized, null) });
    attempts.push({ name: "Nominatim", fn: () => geocodeNominatim(cls.normalized, null) });
  }

  return await tryGeocoders(attempts);
}

// Fetch a 14-day forecast from a specific model. Returns an array of daily
// predictions, one per day. The caller pairs each with its target date and
// computes lead time (days until that date).
const HORIZON_DAYS = 14;

async function fetchForecast(lat, lon, model, timezone) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=${encodeURIComponent(timezone)}&forecast_days=${HORIZON_DAYS}&models=${model}&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Forecast failed for ${model}`);
  const data = await r.json();
  const times = data.daily?.time || [];
  return times.map((date, i) => ({
    date,
    high: data.daily?.temperature_2m_max?.[i],
    low: data.daily?.temperature_2m_min?.[i],
    precip: data.daily?.precipitation_sum?.[i],
    wind: data.daily?.wind_speed_10m_max?.[i],
  }));
}

// Fetch the actual observed weather for a past date using ERA5 reanalysis
async function fetchActual(lat, lon, date, timezone) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=${encodeURIComponent(timezone)}&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Archive lookup failed");
  const data = await r.json();
  return {
    date: data.daily?.time?.[0],
    high: data.daily?.temperature_2m_max?.[0],
    low: data.daily?.temperature_2m_min?.[0],
    precip: data.daily?.precipitation_sum?.[0],
    wind: data.daily?.wind_speed_10m_max?.[0],
  };
}

// =============================================================================
// SCORING & STATISTICS
// =============================================================================
// Each forecast/actual pair yields several metrics:
//   - tempHit: did the high+low forecast both land within 1.5°C of actual? (binary)
//   - precipHit: did the forecast correctly predict rain/no-rain? (binary; >=1mm = rain)
//   - tempMAE: mean absolute error of high+low temperature in °C (continuous)
// We track these three independently per (model, location, date).

const TEMP_TOLERANCE_C = 1.5; // ~3°F, comparable to ForecastAdvisor's threshold
const PRECIP_THRESHOLD_MM = 1.0; // standard "measurable precipitation" threshold

function scorePair(forecast, actual) {
  if (!forecast || !actual) return null;
  if (forecast.high == null || actual.high == null) return null;
  const highErr = Math.abs(forecast.high - actual.high);
  const lowErr = Math.abs(forecast.low - actual.low);
  const tempMAE = (highErr + lowErr) / 2;
  const tempHit = highErr <= TEMP_TOLERANCE_C && lowErr <= TEMP_TOLERANCE_C ? 1 : 0;
  const fcastRain = (forecast.precip ?? 0) >= PRECIP_THRESHOLD_MM;
  const actualRain = (actual.precip ?? 0) >= PRECIP_THRESHOLD_MM;
  const precipHit = fcastRain === actualRain ? 1 : 0;
  return { tempMAE, tempHit, precipHit };
}

// Wilson score interval for a binomial proportion. Robust at small n,
// doesn't break at p=0 or p=1 like the normal approximation does.
function wilsonCI(successes, n, z = 1.96) {
  if (n === 0) return { lo: 0, hi: 1, p: 0 };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - margin), hi: Math.min(1, center + margin), p };
}

// Bootstrap CI for the mean of a continuous sample. 1000 resamples is enough
// for stable 95% bounds without being slow.
function bootstrapMeanCI(samples, iterations = 1000) {
  if (samples.length === 0) return { mean: null, lo: null, hi: null };
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (samples.length < 2) return { mean, lo: mean, hi: mean };
  const means = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < samples.length; j++) {
      sum += samples[Math.floor(Math.random() * samples.length)];
    }
    means.push(sum / samples.length);
  }
  means.sort((a, b) => a - b);
  return {
    mean,
    lo: means[Math.floor(iterations * 0.025)],
    hi: means[Math.floor(iterations * 0.975)],
  };
}

// Paired bootstrap test: are two models' per-day errors meaningfully different?
// Returns the 95% CI of the mean difference (modelA - modelB). If the CI
// straddles zero, the difference is not significant at the 5% level.
function pairedBootstrap(diffs, iterations = 1000) {
  if (diffs.length < 2) return { mean: null, lo: null, hi: null, n: diffs.length };
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const means = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < diffs.length; j++) {
      sum += diffs[Math.floor(Math.random() * diffs.length)];
    }
    means.push(sum / diffs.length);
  }
  means.sort((a, b) => a - b);
  return {
    mean,
    lo: means[Math.floor(iterations * 0.025)],
    hi: means[Math.floor(iterations * 0.975)],
    n: diffs.length,
  };
}

// Confidence labels driven by sample size. Numbers are deliberately
// conservative — weather errors are temporally autocorrelated, so naive
// independence assumptions overstate effective n.
function confidenceLabel(n) {
  if (n < 10) return { tier: "insufficient", label: "Need more data", color: "#a8a29e" };
  if (n < 30) return { tier: "preliminary", label: "Preliminary", color: "#d97706" };
  if (n < 90) return { tier: "moderate", label: "Moderate confidence", color: "#0891b2" };
  return { tier: "high", label: "High confidence", color: "#15803d" };
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function daysBetween(fromISO, toISO) {
  const from = new Date(fromISO + "T00:00:00Z").getTime();
  const to = new Date(toISO + "T00:00:00Z").getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

const HORIZONS_TO_SHOW = [1, 2, 3, 5, 7, 10, 14];

export default function ForecastAccuracy() {
  const [locations, setLocations] = useState([]);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [selectedHorizon, setSelectedHorizon] = useState(1);

  // Load saved data
  useEffect(() => {
    try {
      const raw = localStorage.getItem("forecast-accuracy:locations");
      if (raw) setLocations(JSON.parse(raw));
    } catch (e) {
      // no saved data or storage unavailable
    }
    setHydrated(true);
  }, []);

  // Persist on change
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem("forecast-accuracy:locations", JSON.stringify(locations));
    } catch (e) {
      // storage may be full or disabled; ignore silently
    }
  }, [locations, hydrated]);

  async function addLocation() {
    if (!input.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const geo = await geocode(input.trim());
      const id = `${geo.lat.toFixed(3)},${geo.lon.toFixed(3)}`;
      if (locations.find((l) => l.id === id)) {
        setError("Location already added");
        setAdding(false);
        return;
      }
      const newLoc = { id, query: input.trim(), ...geo, history: {} };
      setLocations([...locations, newLoc]);
      setInput("");
      // Immediately fetch today's forecasts for the new location
      await refreshOne(newLoc);
    } catch (e) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  }

  function removeLocation(id) {
    setLocations(locations.filter((l) => l.id !== id));
  }

  async function refreshOne(loc) {
    const today = todayISO();
    const updated = { ...loc, history: { ...loc.history } };

    // Fetch the full 14-day forecast from each model in parallel.
    // For each target date returned, compute lead time (days from today)
    // and store under history[targetDate].forecasts[modelId][leadTime].
    const forecastResults = await Promise.all(
      MODELS.map(async (m) => {
        try {
          const days = await fetchForecast(loc.lat, loc.lon, m.id, loc.timezone);
          return { modelId: m.id, days };
        } catch (e) {
          return null;
        }
      })
    );

    forecastResults.forEach((res) => {
      if (!res) return;
      res.days.forEach((dayForecast) => {
        const targetDate = dayForecast.date;
        if (!targetDate) return;
        const lead = daysBetween(today, targetDate); // 0 = today, 1 = tomorrow, etc.
        if (lead < 0 || lead > HORIZON_DAYS) return;

        // Initialize the slot for this target date if missing
        if (!updated.history[targetDate]) {
          updated.history[targetDate] = { forecasts: {}, actual: null };
        }
        const day = updated.history[targetDate];

        // Migrate legacy schema: old entries had forecasts[modelId] = {high, low, ...}
        // New schema: forecasts[modelId] = { "1": {high,...}, "3": {high,...} }
        if (!day.forecasts[res.modelId] || day.forecasts[res.modelId].high !== undefined) {
          // Either missing or old-style; reset to new structure
          // (preserving any old single-day data as lead=1 for backward compat)
          if (day.forecasts[res.modelId] && day.forecasts[res.modelId].high !== undefined) {
            const legacy = day.forecasts[res.modelId];
            day.forecasts[res.modelId] = { "1": legacy };
          } else {
            day.forecasts[res.modelId] = {};
          }
        }

        // Only store the longest lead we have for this (date, model) pair —
        // we want the FIRST forecast made for this date, not later refreshes.
        // If the slot already has this lead, keep the existing one (earliest stored wins).
        const key = String(lead);
        if (!day.forecasts[res.modelId][key]) {
          day.forecasts[res.modelId][key] = {
            high: dayForecast.high,
            low: dayForecast.low,
            precip: dayForecast.precip,
            wind: dayForecast.wind,
            issuedOn: today,
          };
        }
      });
    });

    // Backfill actuals for any past dates we don't yet have
    const pastDates = Object.keys(updated.history).filter((d) => d < today);
    await Promise.all(
      pastDates.map(async (d) => {
        if (updated.history[d].actual) return;
        try {
          const a = await fetchActual(loc.lat, loc.lon, d, loc.timezone);
          if (a.high != null) updated.history[d].actual = a;
        } catch (e) {
          // archive lag is normal; will catch up in a later refresh
        }
      })
    );

    setLocations((prev) => prev.map((l) => (l.id === loc.id ? updated : l)));
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      for (const loc of locations) {
        await refreshOne(loc);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Export all data as a JSON file the user can download
  function exportData() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      locations,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forecast-accuracy-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Import data from a JSON file the user picks
  function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.locations)) throw new Error("Backup file is missing locations array.");
        const proceed = window.confirm(
          `Import ${data.locations.length} location(s)? This will REPLACE your current data. Consider exporting first.`
        );
        if (proceed) {
          setLocations(data.locations);
          setError(null);
        }
      } catch (err) {
        setError(`Import failed: ${err.message}`);
      }
    };
    reader.onerror = () => setError("Couldn't read backup file.");
    reader.readAsText(file);
    event.target.value = ""; // allow re-selecting the same file later
  }

  // Wipe everything. Two-step confirm because this is destructive.
  function wipeAllData() {
    if (locations.length === 0) {
      setError(null);
      return;
    }
    const first = window.confirm(
      `Delete ALL ${locations.length} location(s) and their forecast history? This cannot be undone. Consider exporting a backup first.`
    );
    if (!first) return;
    const second = window.confirm("Are you sure? This will permanently delete every saved forecast.");
    if (!second) return;
    setLocations([]);
    setError(null);
  }

  // Build per-(horizon, day) scored data. Key shape:
  // perHorizon[lead] = { perDay: { "locId|date": { modelId: scoreObj } } }
  // Plus perHorizon["all"] which pools every (date, lead) pair as independent samples.
  const perHorizon = {};
  HORIZONS_TO_SHOW.forEach((h) => { perHorizon[h] = { perDay: {} }; });
  perHorizon["all"] = { perDay: {} };

  locations.forEach((loc) => {
    Object.entries(loc.history).forEach(([date, day]) => {
      if (!day.actual) return;
      MODELS.forEach((m) => {
        const modelForecasts = day.forecasts[m.id];
        if (!modelForecasts) return;

        // Iterate every lead time we stored for this date
        Object.entries(modelForecasts).forEach(([leadStr, fcst]) => {
          const lead = parseInt(leadStr, 10);
          if (!Number.isFinite(lead)) return;
          const score = scorePair(fcst, day.actual);
          if (!score) return;

          // Bucket into the closest tracked horizon (so lead=4 goes into the "5" bucket etc.)
          // Strict equality first; if no exact match, find nearest.
          let bucket = HORIZONS_TO_SHOW.includes(lead) ? lead : null;
          if (bucket === null) {
            // Nearest tracked horizon
            bucket = HORIZONS_TO_SHOW.reduce((best, h) =>
              Math.abs(h - lead) < Math.abs(best - lead) ? h : best
            , HORIZONS_TO_SHOW[0]);
          }

          const key = `${loc.id}|${date}`;
          if (!perHorizon[bucket].perDay[key]) perHorizon[bucket].perDay[key] = {};
          perHorizon[bucket].perDay[key][m.id] = score;

          // Also pool into "all" with a unique key per (loc, date, lead)
          const allKey = `${loc.id}|${date}|${lead}`;
          if (!perHorizon["all"].perDay[allKey]) perHorizon["all"].perDay[allKey] = {};
          perHorizon["all"].perDay[allKey][m.id] = score;
        });
      });
    });
  });

  // Compute summary stats for one horizon's per-day data
  function computeStats(perDay) {
    const stats = MODELS.map((m) => {
      const tempMAEs = [];
      let tempHits = 0, tempN = 0;
      let precipHits = 0, precipN = 0;
      Object.values(perDay).forEach((dayScores) => {
        const s = dayScores[m.id];
        if (!s) return;
        tempMAEs.push(s.tempMAE);
        tempHits += s.tempHit; tempN += 1;
        precipHits += s.precipHit; precipN += 1;
      });
      return {
        ...m,
        n: tempN,
        maeCI: bootstrapMeanCI(tempMAEs),
        tempHitCI: wilsonCI(tempHits, tempN),
        precipHitCI: wilsonCI(precipHits, precipN),
        conf: confidenceLabel(tempN),
      };
    });
    const ranked = [...stats]
      .filter((s) => s.n >= 1)
      .sort((a, b) => (a.maeCI.mean ?? 999) - (b.maeCI.mean ?? 999));
    const maxN = Math.max(0, ...stats.map((s) => s.n));
    const leader = ranked[0];
    const pairwise = leader
      ? ranked.slice(1).map((other) => {
          const diffs = [];
          Object.values(perDay).forEach((dayScores) => {
            const a = dayScores[leader.id];
            const b = dayScores[other.id];
            if (a && b) diffs.push(b.tempMAE - a.tempMAE);
          });
          const ci = pairedBootstrap(diffs);
          return { other, ci, significant: ci.lo != null && ci.lo > 0 };
        })
      : [];
    return { stats, ranked, maxN, leader, pairwise, overallConf: confidenceLabel(maxN) };
  }

  const horizonStats = {};
  HORIZONS_TO_SHOW.forEach((h) => {
    horizonStats[h] = computeStats(perHorizon[h].perDay);
  });
  horizonStats["all"] = computeStats(perHorizon["all"].perDay);

  // The active horizon shown in the leaderboard (UI state)
  const activeStats = horizonStats[selectedHorizon] || horizonStats["all"];
  const { ranked, maxN, leader, pairwise, overallConf } = activeStats;

  // Skill-by-horizon data for the combined view: mean MAE per (model, horizon)
  const skillByHorizon = MODELS.map((m) => ({
    model: m,
    points: HORIZONS_TO_SHOW.map((h) => {
      const s = horizonStats[h].stats.find((x) => x.id === m.id);
      return { horizon: h, mae: s?.maeCI.mean ?? null, n: s?.n ?? 0 };
    }),
  }));

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;900&family=JetBrains+Mono:wght@400;600&display=swap');
        .display { font-family: 'Fraunces', Georgia, serif; font-variation-settings: "SOFT" 100; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .grain::before {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.04;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }
      `}</style>

      {/* Header */}
      <header className="border-b border-stone-900 bg-stone-100 relative grain overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 py-10 relative">
          <div className="text-xs mono uppercase tracking-[0.3em] text-stone-600 mb-3">
            Vol. 01 · Forecast Verification Bureau
          </div>
          <h1 className="display text-5xl md:text-7xl font-black leading-none mb-3">
            Who Got The Weather Right?
          </h1>
          <p className="text-stone-700 max-w-2xl text-lg italic">
            A daily ledger comparing what four major weather models predicted against what the sky actually delivered.
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Add location */}
        <section className="mb-10">
          <div className="flex flex-col sm:flex-row gap-3 mb-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLocation()}
              placeholder='Try "94110", "N2H 1Y3", "SW1A 1AA", or "Berlin"'
              className="flex-1 px-4 py-3 border-2 border-stone-900 bg-white mono text-sm focus:outline-none focus:bg-yellow-50"
            />
            <button
              onClick={addLocation}
              disabled={adding || !input.trim()}
              className="px-6 py-3 bg-stone-900 text-stone-50 mono text-sm uppercase tracking-wider hover:bg-stone-700 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <Plus size={16} /> {adding ? "Adding…" : "Add Location"}
            </button>
            {locations.length > 0 && (
              <button
                onClick={refreshAll}
                disabled={loading}
                className="px-6 py-3 border-2 border-stone-900 bg-stone-50 mono text-sm uppercase tracking-wider hover:bg-yellow-50 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                {loading ? "Refreshing…" : "Refresh All"}
              </button>
            )}
          </div>

          {/* Backup row */}
          <div className="flex flex-wrap gap-2 mb-2">
            {locations.length > 0 && (
              <button
                onClick={exportData}
                className="px-4 py-2 border border-stone-400 bg-white mono text-xs uppercase tracking-wider hover:bg-stone-50 flex items-center gap-2"
                title="Download a JSON backup of all your data"
              >
                <Download size={14} /> Export Backup
              </button>
            )}
            <label className="px-4 py-2 border border-stone-400 bg-white mono text-xs uppercase tracking-wider hover:bg-stone-50 flex items-center gap-2 cursor-pointer">
              <Upload size={14} /> Import Backup
              <input type="file" accept="application/json,.json" onChange={importData} className="hidden" />
            </label>
            {locations.length > 0 && (
              <button
                onClick={wipeAllData}
                className="ml-auto px-4 py-2 border border-red-300 bg-white text-red-700 mono text-xs uppercase tracking-wider hover:bg-red-50 flex items-center gap-2"
                title="Permanently delete all saved data"
              >
                <Trash2 size={14} /> Wipe All
              </button>
            )}
          </div>
          {error && (
            <div className="text-sm text-red-700 mono flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <p className="text-xs text-stone-500 mono mt-2">
            Forecasts are recorded the day they're issued. Actuals appear once observation data catches up (usually within 1–2 days).
          </p>
        </section>

        {/* Leaderboard */}
        {ranked.length > 0 && (
          <section className="mb-10 border-2 border-stone-900 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 text-xs mono uppercase tracking-[0.3em] text-stone-600">
                <TrendingUp size={14} /> Standings · {selectedHorizon === "all" ? "All horizons pooled" : `${selectedHorizon}-day forecast`}
              </div>
              <div className="flex items-center gap-2 text-xs mono">
                <span className="px-2 py-0.5" style={{ backgroundColor: overallConf.color, color: "white" }}>
                  {overallConf.label}
                </span>
                <span className="text-stone-500">n = {maxN}</span>
              </div>
            </div>

            {/* Horizon tabs */}
            <div className="flex flex-wrap gap-1 mb-4 -mx-1 border-b border-stone-200 pb-2">
              {HORIZONS_TO_SHOW.map((h) => {
                const hStats = horizonStats[h];
                const isActive = selectedHorizon === h;
                return (
                  <button
                    key={h}
                    onClick={() => setSelectedHorizon(h)}
                    className={`mono text-xs px-3 py-1.5 mx-0.5 ${isActive ? "bg-stone-900 text-stone-50" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
                  >
                    {h}d <span className="opacity-60">({hStats.maxN})</span>
                  </button>
                );
              })}
              <button
                onClick={() => setSelectedHorizon("all")}
                className={`mono text-xs px-3 py-1.5 mx-0.5 ${selectedHorizon === "all" ? "bg-stone-900 text-stone-50" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
              >
                ALL <span className="opacity-60">({horizonStats["all"].maxN})</span>
              </button>
            </div>

            {maxN < 10 && (
              <div className="mb-4 p-3 bg-amber-50 border-l-4 border-amber-600 text-sm">
                <strong className="display">Heads up:</strong> with fewer than 10 verified days at this horizon, the standings are essentially noise. Confidence intervals shown below will overlap heavily. Wait at least 30 days, ideally 90, before drawing conclusions.
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-xs mono uppercase tracking-wider text-stone-500">
                  <th className="text-left py-2">#</th>
                  <th className="text-left">Model</th>
                  <th className="text-right">Temp MAE (°C)</th>
                  <th className="text-right hidden md:table-cell">±1.5°C hit rate</th>
                  <th className="text-right hidden md:table-cell">Precip hit rate</th>
                  <th className="text-right">n</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((s, i) => (
                  <tr key={s.id} className="border-b border-stone-100">
                    <td className="py-3 mono text-stone-500">{i + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-6 inline-block" style={{ backgroundColor: s.color }} />
                        <div>
                          <div className="display font-bold leading-tight">{s.name}</div>
                          <div className="text-xs text-stone-500 italic">{s.origin}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right mono">
                      <div className="font-bold">{s.maeCI.mean != null ? s.maeCI.mean.toFixed(2) : "—"}</div>
                      <div className="text-xs text-stone-500">
                        {s.maeCI.lo != null && s.n >= 2
                          ? `[${s.maeCI.lo.toFixed(2)}, ${s.maeCI.hi.toFixed(2)}]`
                          : "—"}
                      </div>
                    </td>
                    <td className="text-right mono hidden md:table-cell">
                      <div className="font-bold">{s.n > 0 ? `${(s.tempHitCI.p * 100).toFixed(0)}%` : "—"}</div>
                      <div className="text-xs text-stone-500">
                        {s.n > 0 ? `[${(s.tempHitCI.lo * 100).toFixed(0)}, ${(s.tempHitCI.hi * 100).toFixed(0)}]` : "—"}
                      </div>
                    </td>
                    <td className="text-right mono hidden md:table-cell">
                      <div className="font-bold">{s.n > 0 ? `${(s.precipHitCI.p * 100).toFixed(0)}%` : "—"}</div>
                      <div className="text-xs text-stone-500">
                        {s.n > 0 ? `[${(s.precipHitCI.lo * 100).toFixed(0)}, ${(s.precipHitCI.hi * 100).toFixed(0)}]` : "—"}
                      </div>
                    </td>
                    <td className="text-right mono text-stone-600">{s.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pairwise.length > 0 && maxN >= 10 && (
              <div className="mt-5 pt-5 border-t border-stone-200">
                <div className="text-xs mono uppercase tracking-wider text-stone-500 mb-3">
                  Is the leader actually ahead? (paired bootstrap, 95% CI of MAE difference)
                </div>
                <div className="space-y-2">
                  {pairwise.map(({ other, ci, significant }) => (
                    <div key={other.id} className="flex items-baseline gap-3 text-sm">
                      <span className="display font-bold w-28 truncate">{leader.name}</span>
                      <span className="text-stone-400">vs</span>
                      <span className="display w-28 truncate">{other.name}</span>
                      <span className="mono flex-1 text-right">
                        {ci.mean != null ? (
                          <>
                            Δ = {ci.mean.toFixed(2)}°C{" "}
                            <span className="text-stone-500">[{ci.lo.toFixed(2)}, {ci.hi.toFixed(2)}]</span>{" "}
                            <span className={`px-1.5 py-0.5 text-xs ${significant ? "bg-emerald-200 text-emerald-900" : "bg-stone-200 text-stone-700"}`}>
                              {significant ? "significant" : "not significant"}
                            </span>
                          </>
                        ) : (
                          <span className="text-stone-400">need ≥2 paired days</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-stone-500 italic">
                  "Significant" = the 95% bootstrap confidence interval of the per-day MAE difference excludes zero. Note: weather errors are temporally autocorrelated, so this slightly overstates effective sample size — treat borderline results with caution.
                </div>
              </div>
            )}
          </section>
        )}

        {/* Skill degradation chart — how each model's accuracy decays with horizon */}
        {horizonStats["all"].maxN >= 1 && (
          <section className="mb-10 border-2 border-stone-900 bg-white p-6">
            <div className="text-xs mono uppercase tracking-[0.3em] text-stone-600 mb-1">
              Skill Across Horizons
            </div>
            <p className="text-sm text-stone-600 italic mb-5 max-w-2xl">
              Mean temperature error as the forecast looks further ahead. Lower is better. All models degrade as the horizon grows; the rate of degradation is what separates them.
            </p>
            <SkillChart skillByHorizon={skillByHorizon} />
          </section>
        )}

        {/* Sources panel */}
        <section className="mb-10 border-2 border-stone-900 bg-white">
          <button
            onClick={() => setShowSources(!showSources)}
            className="w-full flex items-center justify-between p-5 hover:bg-stone-50"
          >
            <div className="flex items-center gap-2 text-xs mono uppercase tracking-[0.3em] text-stone-600">
              <BookOpen size={14} /> Where Popular Weather Apps Get Their Data
            </div>
            <ChevronDown size={18} className={`transition-transform ${showSources ? "rotate-180" : ""}`} />
          </button>
          {showSources && (
            <div className="border-t border-stone-200 p-5">
              <p className="text-sm text-stone-600 italic mb-5 max-w-3xl">
                Most consumer apps don't run their own physics — they license or blend output from a handful of national weather models. Below: the ten most-used weather services, ranked by user base and reviewer popularity, with links to each provider's own documentation. The colored dots show which of the four models tracked above are known ingredients in their forecasts.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {SERVICES.map((s) => (
                  <div key={s.name} className="border border-stone-300 p-4 hover:border-stone-900 transition-colors">
                    <div className="flex items-baseline justify-between mb-1 gap-2">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="display text-lg font-bold hover:underline flex items-center gap-1"
                      >
                        <span className="mono text-xs text-stone-400 mr-1">#{s.rank}</span>
                        {s.name} <ExternalLink size={12} className="opacity-50" />
                      </a>
                      <div className="flex gap-1">
                        {MODELS.map((m) => (
                          <span
                            key={m.id}
                            title={s.matches.includes(m.id) ? `Uses ${m.name}` : `Does not appear to use ${m.name}`}
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: s.matches.includes(m.id) ? m.color : "transparent",
                              border: `1px solid ${s.matches.includes(m.id) ? m.color : "#d6d3d1"}`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <a
                      href={s.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mono text-xs text-stone-700 hover:underline inline-flex items-center gap-1 mb-2"
                    >
                      {s.sourceLabel} <ExternalLink size={10} />
                    </a>
                    <p className="text-sm text-stone-600 leading-snug">{s.notes}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 p-4 bg-stone-50 border-l-4 border-stone-900">
                <div className="text-xs mono uppercase tracking-wider text-stone-500 mb-1">Prior art</div>
                <p className="text-sm text-stone-700">
                  <a href="https://www.forecastadvisor.com/" target="_blank" rel="noopener noreferrer" className="font-bold underline hover:no-underline">ForecastAdvisor</a>
                  {" "}(by ForecastWatch) has been doing this professionally since 2004 — billions of forecasts compared to actuals across 2,200+ locations. US-focused, no UI for tracking your own zip codes over time, but the gold-standard reference for "which app is most accurate where I live."
                </p>
              </div>
              <p className="text-xs text-stone-500 mono mt-4 italic">
                Disclosure varies. Apple publishes its model list explicitly; The Weather Channel, AccuWeather, and The Weather Network keep their exact blends proprietary. Information here reflects what each provider publicly states.
              </p>
            </div>
          )}
        </section>

        {/* Locations */}
        {locations.length === 0 && hydrated && (
          <div className="text-center py-20 text-stone-500">
            <Cloud size={48} className="mx-auto mb-4 opacity-30" />
            <p className="display text-2xl italic">No locations yet.</p>
            <p className="mono text-xs mt-2">Add a zip or postal code above to begin tracking.</p>
          </div>
        )}

        <div className="space-y-8">
          {locations.map((loc) => (
            <LocationCard key={loc.id} loc={loc} onRemove={() => removeLocation(loc.id)} />
          ))}
        </div>

        <footer className="mt-16 pt-6 border-t border-stone-300 text-xs mono text-stone-500 flex flex-wrap gap-4 justify-between">
          <div>Data: Open-Meteo · GFS · ECMWF · ICON · GEM · ERA5</div>
          <div>Persisted locally · {locations.length} location{locations.length === 1 ? "" : "s"} tracked</div>
        </footer>
      </main>
    </div>
  );
}

function LocationCard({ loc, onRemove }) {
  const today = todayISO();
  const allDates = Object.keys(loc.history).sort(); // ascending: oldest first
  const verifiedDates = allDates.filter((d) => loc.history[d].actual && d < today).reverse(); // newest verified first
  const upcomingDates = allDates.filter((d) => d >= today); // today, then ascending into future

  // Tomorrow's forecast spread: range across all models, shortest lead available
  const tomorrow = upcomingDates[1]; // index 0 is today, 1 is tomorrow
  const tomorrowSummary = tomorrow ? buildDaySummary(loc.history[tomorrow]) : null;

  // UI state: which date (if any) is expanded, and whether the verified history is shown
  const [expandedDate, setExpandedDate] = useState(null);
  const [showVerified, setShowVerified] = useState(false);

  return (
    <article className="border-2 border-stone-900 bg-white">
      {/* Compact header */}
      <header className="bg-stone-900 text-stone-50 px-5 py-3 flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="flex-shrink-0" />
            <span className="display text-lg font-bold truncate">{loc.name}</span>
          </div>
          {tomorrowSummary && (
            <div className="mono text-xs opacity-70 mt-0.5">
              Tomorrow: {tomorrowSummary.label}
            </div>
          )}
        </div>
        <button onClick={onRemove} className="opacity-60 hover:opacity-100 flex-shrink-0 mt-1" aria-label="Remove location">
          <Trash2 size={14} />
        </button>
      </header>

      {/* Upcoming date strip — today first, then forward */}
      {upcomingDates.length > 0 && (
        <div className="border-b border-stone-200">
          <div className="px-5 pt-4 pb-2 text-xs mono uppercase tracking-wider text-stone-500">
            Forecasts ahead
          </div>
          <div className="px-3 pb-3 flex gap-2 overflow-x-auto scrollbar-thin">
            {upcomingDates.map((d) => (
              <DateChip
                key={d}
                date={d}
                day={loc.history[d]}
                isToday={d === today}
                isExpanded={expandedDate === d}
                onToggle={() => setExpandedDate(expandedDate === d ? null : d)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Expanded date detail */}
      {expandedDate && loc.history[expandedDate] && (
        <DayRow date={expandedDate} day={loc.history[expandedDate]} isToday={expandedDate === today} />
      )}

      {/* Verified history collapsible */}
      {verifiedDates.length > 0 && (
        <div className="border-t border-stone-200">
          <button
            onClick={() => setShowVerified(!showVerified)}
            className="w-full px-5 py-3 flex justify-between items-center hover:bg-stone-50 text-left"
          >
            <span className="text-xs mono uppercase tracking-wider text-stone-600">
              ✓ Verified history ({verifiedDates.length} day{verifiedDates.length === 1 ? "" : "s"})
            </span>
            <ChevronDown size={16} className={`transition-transform ${showVerified ? "rotate-180" : ""}`} />
          </button>
          {showVerified && (
            <div className="border-t border-stone-200">
              {verifiedDates.slice(0, 14).map((d) => (
                <DayRow key={d} date={d} day={loc.history[d]} isToday={false} />
              ))}
              {verifiedDates.length > 14 && (
                <div className="p-3 text-center text-xs mono text-stone-500 italic">
                  Showing latest 14 of {verifiedDates.length} verified days.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {allDates.length === 0 && (
        <div className="p-6 text-stone-500 italic">No data yet — tap Refresh All to fetch forecasts.</div>
      )}
    </article>
  );
}

// Build a one-line summary from a day's forecasts: range across models for the shortest lead
function buildDaySummary(day) {
  if (!day || !day.forecasts) return null;
  const highs = [];
  const lows = [];
  const precips = [];
  Object.values(day.forecasts).forEach((modelForecasts) => {
    if (!modelForecasts) return;
    // Old or new schema?
    let f = null;
    if (modelForecasts.high !== undefined) {
      f = modelForecasts;
    } else {
      const leads = Object.keys(modelForecasts).map(Number).sort((a, b) => a - b);
      if (leads.length > 0) f = modelForecasts[String(leads[0])];
    }
    if (f) {
      if (f.high != null) highs.push(f.high);
      if (f.low != null) lows.push(f.low);
      if (f.precip != null) precips.push(f.precip);
    }
  });
  if (highs.length === 0) return null;
  const hi = Math.max(...highs), hiLo = Math.min(...highs);
  const lo = Math.min(...lows), loHi = Math.max(...lows);
  const maxPrecip = Math.max(...precips, 0);
  const tempStr = hi === hiLo ? `${lo.toFixed(0)}–${hi.toFixed(0)}°` : `${lo.toFixed(0)}–${hi.toFixed(0)}° (spread ${(hi - hiLo).toFixed(0)}°)`;
  const precipStr = maxPrecip >= 1 ? ` · up to ${maxPrecip.toFixed(0)}mm` : "";
  return { label: tempStr + precipStr };
}

// A single date-chip in the horizontal strip
function DateChip({ date, day, isToday, isExpanded, onToggle }) {
  const dt = new Date(date + "T12:00:00");
  const dayLabel = dt.toLocaleDateString("en-US", { weekday: "short" });
  const dateLabel = dt.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  const hasForecasts = day?.forecasts && Object.keys(day.forecasts).length > 0;
  const summary = hasForecasts ? buildDaySummary(day) : null;

  let bg = "bg-stone-100 hover:bg-stone-200";
  let text = "text-stone-700";
  if (isToday) {
    bg = "bg-yellow-100 hover:bg-yellow-200";
    text = "text-stone-900";
  }
  if (isExpanded) {
    bg = "bg-stone-900";
    text = "text-stone-50";
  }

  return (
    <button
      onClick={onToggle}
      className={`flex-shrink-0 px-3 py-2 border border-stone-300 ${bg} ${text} text-center min-w-[70px]`}
    >
      <div className="mono text-[10px] uppercase tracking-wider opacity-60">{dayLabel}</div>
      <div className="display font-bold text-base leading-tight">{dateLabel}</div>
      {summary ? (
        <div className="mono text-[10px] mt-0.5 opacity-80 truncate">{summary.label.split(" ")[0]}</div>
      ) : (
        <div className="mono text-[10px] mt-0.5 opacity-40">—</div>
      )}
    </button>
  );
}

function DayRow({ date, day, isToday }) {
  const hasActual = !!day.actual;

  // For each model, pick the shortest lead time we have stored for this date.
  // That's the most informed forecast — the one made closest to the day itself.
  // We also show what lead it was, so users see e.g. "1d ago" vs "7d ago".
  const scored = MODELS.map((m) => {
    const modelForecasts = day.forecasts[m.id];
    if (!modelForecasts) return null;
    // Handle legacy schema (object with high/low directly) vs new (keyed by lead)
    if (modelForecasts.high !== undefined) {
      const f = modelForecasts;
      const s = hasActual ? scorePair(f, day.actual) : null;
      return { model: m, forecast: f, score: s, lead: 1 };
    }
    const leads = Object.keys(modelForecasts).map(Number).sort((a, b) => a - b);
    if (leads.length === 0) return null;
    const lead = leads[0];
    const f = modelForecasts[String(lead)];
    const s = hasActual ? scorePair(f, day.actual) : null;
    return { model: m, forecast: f, score: s, lead };
  }).filter(Boolean);

  const best = hasActual && scored.length
    ? Math.min(...scored.filter((s) => s.score).map((s) => s.score.tempMAE))
    : null;

  return (
    <div className="p-5">
      <div className="flex justify-between items-baseline mb-3">
        <div className="flex items-baseline gap-3">
          <div className="display text-2xl font-bold">{formatDate(date)}</div>
          {isToday && <span className="mono text-xs uppercase tracking-wider bg-yellow-200 px-2 py-0.5">Today · pending</span>}
          {!isToday && !hasActual && <span className="mono text-xs uppercase tracking-wider bg-stone-200 px-2 py-0.5">Awaiting actual</span>}
          {hasActual && <span className="mono text-xs uppercase tracking-wider bg-emerald-200 px-2 py-0.5">Verified</span>}
        </div>
      </div>

      {hasActual && (
        <div className="mb-3 p-3 bg-stone-50 border border-stone-300">
          <div className="text-xs mono uppercase tracking-wider text-stone-500 mb-1">Actual observed</div>
          <Metrics m={day.actual} />
        </div>
      )}

      <div className="space-y-2">
        {scored.map(({ model, forecast, score, lead }) => {
          const isBest = score != null && score.tempMAE === best;
          return (
            <div
              key={model.id}
              className={`flex items-center gap-4 p-3 border ${isBest ? "border-emerald-500 bg-emerald-50" : "border-stone-200"}`}
              style={{ borderLeftColor: model.color, borderLeftWidth: 4 }}
            >
              <div className="w-32 flex-shrink-0">
                <div className="display font-bold text-sm">{model.name}</div>
                <div className="mono text-xs text-stone-500">{model.origin} · {lead}d lead</div>
              </div>
              <div className="flex-1">
                <Metrics m={forecast} />
              </div>
              {score != null && (
                <div className="text-right">
                  <div className="mono text-xs text-stone-500">temp MAE</div>
                  <div className={`display text-xl font-bold ${isBest ? "text-emerald-700" : ""}`}>{score.tempMAE.toFixed(1)}°</div>
                  <div className="mono text-xs text-stone-500">
                    {score.tempHit ? "✓" : "✗"} ±1.5°  ·  {score.precipHit ? "✓" : "✗"} precip
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metrics({ m }) {
  if (!m) return null;
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 mono text-sm">
      <span className="flex items-center gap-1"><Thermometer size={12} className="text-red-600" />{fmt(m.high, 1)}° / {fmt(m.low, 1)}°</span>
      <span className="flex items-center gap-1"><Droplets size={12} className="text-blue-600" />{fmt(m.precip, 1)} mm</span>
      <span className="flex items-center gap-1"><Wind size={12} className="text-stone-600" />{fmt(m.wind, 0)} km/h</span>
    </div>
  );
}

function fmt(v, dp = 0) {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toFixed(dp);
}

function formatDate(d) {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function SkillChart({ skillByHorizon }) {
  // Simple inline SVG line chart. Each model is a line; x is forecast horizon in days,
  // y is mean temp MAE in °C. Lines drawn only between points that have data.
  const W = 720, H = 280;
  const PAD = { top: 20, right: 20, bottom: 40, left: 50 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const allMaes = skillByHorizon.flatMap((s) => s.points.map((p) => p.mae).filter((v) => v != null));
  if (allMaes.length === 0) {
    return <div className="text-stone-500 italic text-sm">No verified data yet — chart will populate as actuals arrive.</div>;
  }
  const yMax = Math.max(...allMaes) * 1.15;
  const yMin = 0;
  const xMin = HORIZONS_TO_SHOW[0];
  const xMax = HORIZONS_TO_SHOW[HORIZONS_TO_SHOW.length - 1];

  const xScale = (h) => PAD.left + ((h - xMin) / (xMax - xMin)) * innerW;
  const yScale = (mae) => PAD.top + (1 - (mae - yMin) / (yMax - yMin)) * innerH;

  // Y-axis tick values (5 evenly spaced)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * (yMax - yMin));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 500 }} role="img" aria-label="Forecast skill by horizon">
        {/* Y-axis grid + labels */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} y1={yScale(t)} x2={W - PAD.right} y2={yScale(t)} stroke="#e7e5e4" strokeWidth="1" />
            <text x={PAD.left - 8} y={yScale(t) + 4} textAnchor="end" fontSize="11" fill="#78716c" fontFamily="JetBrains Mono, monospace">
              {t.toFixed(1)}°
            </text>
          </g>
        ))}
        {/* X-axis ticks + labels */}
        {HORIZONS_TO_SHOW.map((h) => (
          <g key={h}>
            <line x1={xScale(h)} y1={H - PAD.bottom} x2={xScale(h)} y2={H - PAD.bottom + 4} stroke="#78716c" />
            <text x={xScale(h)} y={H - PAD.bottom + 18} textAnchor="middle" fontSize="11" fill="#78716c" fontFamily="JetBrains Mono, monospace">
              {h}d
            </text>
          </g>
        ))}
        <text x={PAD.left + innerW / 2} y={H - 5} textAnchor="middle" fontSize="11" fill="#44403c" fontFamily="JetBrains Mono, monospace">
          Forecast horizon (days ahead)
        </text>
        <text x={12} y={PAD.top + innerH / 2} textAnchor="middle" fontSize="11" fill="#44403c" fontFamily="JetBrains Mono, monospace" transform={`rotate(-90, 12, ${PAD.top + innerH / 2})`}>
          Mean temp error (°C)
        </text>

        {/* One line + dots per model */}
        {skillByHorizon.map(({ model, points }) => {
          const valid = points.filter((p) => p.mae != null);
          if (valid.length === 0) return null;
          const path = valid.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.horizon)} ${yScale(p.mae)}`).join(" ");
          return (
            <g key={model.id}>
              <path d={path} fill="none" stroke={model.color} strokeWidth="2.5" opacity="0.85" />
              {valid.map((p) => (
                <circle key={p.horizon} cx={xScale(p.horizon)} cy={yScale(p.mae)} r="4" fill={model.color}>
                  <title>{`${model.name} @ ${p.horizon}d: ${p.mae.toFixed(2)}°C  (n=${p.n})`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center mt-2 mono text-xs">
        {skillByHorizon.map(({ model }) => (
          <div key={model.id} className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5" style={{ backgroundColor: model.color }} />
            <span>{model.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

