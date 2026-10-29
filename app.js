const DEFAULT = { name: "Boca Raton, Florida", lat: 26.3587, lon: -80.0831, country: "US" };

const CODES = {
  0: ["Clear", "☀️"], 1: ["Mostly Clear", "🌤️"], 2: ["Partly Cloudy", "⛅"], 3: ["Cloudy", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Fog", "🌫️"],
  51: ["Drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Drizzle", "🌦️"],
  61: ["Rain", "🌧️"], 63: ["Rain", "🌧️"], 65: ["Heavy Rain", "🌧️"],
  71: ["Snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy Snow", "❄️"],
  80: ["Showers", "🌦️"], 81: ["Showers", "🌧️"], 82: ["Heavy Showers", "⛈️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm", "⛈️"], 99: ["Thunderstorm", "⛈️"],
};
const describe = (code, isDay = 1) => {
  const [text, icon] = CODES[code] || ["Unknown", "🌡️"];
  return [text, !isDay && code <= 1 ? "🌙" : icon];
};
const $ = (id) => document.getElementById(id);
const round = (n) => Math.round(n);
const time = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const compass = (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
const uvLevel = (uv) => uv < 3 ? "Low" : uv < 6 ? "Moderate" : uv < 8 ? "High" : uv < 11 ? "Very High" : "Extreme";

async function loadWeather({ name, lat, lon, country }) {
  $("error").hidden = true;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,weather_code,is_day,` +
    `wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,visibility,uv_index` +
    `&hourly=temperature_2m,weather_code,precipitation_probability,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderCurrent(name, data);
    renderHourly(data.hourly, data.current.time);
    renderDaily(data.daily);
    const alerts = await loadAlerts(lat, lon, country);
    loadFlood(lat, lon, data.daily, alerts);
  } catch {
    showError("Couldn't load weather. Please try again.");
  }
}

function renderCurrent(name, { current: c, current_units: u, daily: d }) {
  const [text, icon] = describe(c.weather_code, c.is_day);
  $("place").textContent = name;
  $("icon").textContent = icon;
  $("temp").textContent = `${round(c.temperature_2m)}°`;
  $("desc").textContent = text;
  $("hilo").textContent = `H:${round(d.temperature_2m_max[0])}°  L:${round(d.temperature_2m_min[0])}°`;
  $("updated").textContent = `Updated ${time(c.time)}`;

  $("humidity").textContent = `${c.relative_humidity_2m}%`;
  $("dew").textContent = `Dew point ${round(c.dew_point_2m)}°`;
  $("feels").textContent = `${round(c.apparent_temperature)}°`;
  $("wind").textContent = `${round(c.wind_speed_10m)} mph ${compass(c.wind_direction_10m)}`;
  $("gusts").textContent = `Gusts ${round(c.wind_gusts_10m)} mph`;
  $("rain").textContent = `${d.precipitation_probability_max[0] ?? 0}%`;
  $("rain-today").textContent = `${d.precipitation_sum[0].toFixed(2)} in expected today`;
  $("uv").textContent = round(c.uv_index);
  $("uv-level").textContent = uvLevel(c.uv_index);
  const miles = u.visibility === "ft" ? c.visibility / 5280 : c.visibility / 1609.34;
  $("visibility").textContent = `${miles >= 10 ? 10 : miles.toFixed(1)} mi`;
  $("pressure").textContent = `${(c.pressure_msl * 0.02953).toFixed(2)} inHg`;
  $("sunrise").textContent = time(d.sunrise[0]);
  $("sunset").textContent = `Sunset ${time(d.sunset[0])}`;
}

function renderHourly(h, nowIso) {
  const start = Math.max(0, h.time.findIndex((t) => t >= nowIso.slice(0, 13)));
  $("hourly").innerHTML = h.time.slice(start, start + 24).map((t, j) => {
    const i = start + j;
    const [, icon] = describe(h.weather_code[i], h.is_day[i]);
    const label = j === 0 ? "Now" : new Date(t).toLocaleTimeString("en-US", { hour: "numeric" });
    const pop = h.precipitation_probability[i];
    return `<li><span>${label}</span><span class="h-icon">${icon}</span>
      <span class="h-temp">${round(h.temperature_2m[i])}°</span><span class="h-rain">${pop >= 20 ? pop + "%" : ""}</span></li>`;
  }).join("");
}

function renderDaily(d) {
  $("forecast").innerHTML = d.time.map((day, i) => {
    const label = i === 0 ? "Today" : new Date(day + "T00:00").toLocaleDateString("en-US", { weekday: "short" });
    const [, icon] = describe(d.weather_code[i]);
    const pop = d.precipitation_probability_max[i];
    return `<li><span>${label}</span><span class="icon">${icon}</span>
      <span class="pop">${pop >= 20 ? "💧" + pop + "%" : ""}</span>
      <span class="range">${round(d.temperature_2m_max[i])}°<span class="lo">${round(d.temperature_2m_min[i])}°</span></span></li>`;
  }).join("");
}

// Flood risk: combines upcoming rainfall with the river discharge forecast from the Open-Meteo Flood API.
async function loadFlood(lat, lon, daily, alerts) {
  const rain3 = daily.precipitation_sum.slice(0, 3).reduce((a, b) => a + b, 0);
  const maxDay = Math.max(...daily.precipitation_sum);
  let ratio = null;
  try {
    const res = await fetch(`https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}` +
      `&daily=river_discharge&past_days=30&forecast_days=7`);
    const { daily: f } = await res.json();
    const values = f.river_discharge;
    const past = values.slice(0, 30).filter((v) => v != null);
    const future = values.slice(30).filter((v) => v != null);
    const avg = past.reduce((a, b) => a + b, 0) / past.length;
    if (past.length && future.length && avg > 0) ratio = Math.max(...future) / avg;
  } catch { /* no river data for this spot, rely on rainfall only */ }

  const floodAlerts = (alerts || []).filter((a) => /flood/i.test(a.event));
  let risk = "low";
  if (maxDay >= 3 || (ratio && ratio >= 3) || floodAlerts.some((a) => /warning|emergency/i.test(a.event))) risk = "high";
  else if (maxDay >= 1.5 || rain3 >= 3 || (ratio && ratio >= 1.8) || floodAlerts.length) risk = "moderate";

  const reasons = [`${rain3.toFixed(2)} in of rain expected over the next 3 days`];
  if (floodAlerts.length) reasons.unshift(`an active NWS ${floodAlerts.map((a) => a.event).join(", ")}`);
  if (ratio && ratio >= 1.3) reasons.push(`nearby river flow forecast at ${ratio.toFixed(1)}× its 30-day average`);
  const advice = { low: "No flooding expected.", moderate: "Watch for street and low-lying area flooding.", high: "Flooding is likely. Avoid flooded roads and follow local alerts." };

  $("flood").dataset.risk = risk;
  $("flood-level").textContent = risk[0].toUpperCase() + risk.slice(1);
  $("flood-text").textContent = `${advice[risk]} Based on ${reasons.join(" and ")}.`;
}

// Search with dropdown suggestions (Open-Meteo Geocoding API covers cities worldwide)
let results = [];
let active = -1;
let timer;

const flag = (code) => code ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : "📍";
const placeName = (p) => [p.name, p.admin1 && p.admin1 !== p.name ? p.admin1 : null].filter(Boolean).join(", ");

async function fetchPlaces(query) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en`);
  const data = await res.json();
  return data.results || [];
}

function showSuggestions(list, query) {
  results = list;
  active = -1;
  const box = $("suggestions");
  box.innerHTML = list.length
    ? list.map((p, i) => `<li role="option" data-i="${i}"><span class="flag">${flag(p.country_code)}</span>
        <span>${escapeHtml(placeName(p))}<small>${escapeHtml(p.country || "")}</small></span></li>`).join("")
    : `<li class="empty">No places found for "${escapeHtml(query)}"</li>`;
  box.hidden = false;
  $("city").setAttribute("aria-expanded", "true");
}

function hideSuggestions() {
  $("suggestions").hidden = true;
  $("city").setAttribute("aria-expanded", "false");
  active = -1;
}

function choosePlace(p) {
  hideSuggestions();
  $("city").value = "";
  loadWeather({ name: `${placeName(p)}${p.country_code !== "US" && p.country ? ", " + p.country : ""}`,
    lat: p.latitude, lon: p.longitude, country: p.country_code });
}

function highlight(i) {
  const items = [...$("suggestions").querySelectorAll("[data-i]")];
  if (!items.length) return;
  active = (i + items.length) % items.length;
  items.forEach((li, j) => li.setAttribute("aria-selected", j === active));
  items[active].scrollIntoView({ block: "nearest" });
}

$("city").addEventListener("input", () => {
  clearTimeout(timer);
  const q = $("city").value.trim();
  if (q.length < 2) return hideSuggestions();
  timer = setTimeout(async () => {
    try { showSuggestions(await fetchPlaces(q), q); } catch { hideSuggestions(); }
  }, 250);
});

$("city").addEventListener("keydown", (e) => {
  if ($("suggestions").hidden) return;
  if (e.key === "ArrowDown") { e.preventDefault(); highlight(active + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); highlight(active - 1); }
  else if (e.key === "Escape") hideSuggestions();
});

$("suggestions").addEventListener("mousedown", (e) => {
  const li = e.target.closest("[data-i]");
  if (li) { e.preventDefault(); choosePlace(results[li.dataset.i]); }
});

$("city").addEventListener("blur", () => setTimeout(hideSuggestions, 100));

async function searchCity(query) {
  try {
    if (active >= 0 && results[active]) return choosePlace(results[active]);
    const list = await fetchPlaces(query);
    if (!list.length) return showError(`No results for "${query}".`);
    choosePlace(list[0]);
  } catch {
    showError("Search failed. Please try again.");
  }
}

// National Weather Service active alerts (US locations only)
async function loadAlerts(lat, lon, country) {
  const box = $("alerts-list");
  if (country && country !== "US") {
    box.innerHTML = `<p class="muted">NWS alerts cover US locations only.</p>`;
    return null;
  }
  box.innerHTML = `<p class="muted">Checking the National Weather Service…</p>`;
  try {
    const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { Accept: "application/geo+json" } });
    if (!res.ok) throw new Error();
    const alerts = (await res.json()).features.map((f) => f.properties);
    box.innerHTML = alerts.length
      ? alerts.map((a) => `<details class="alert">
          <summary><span>${escapeHtml(a.event)}</span><span class="sev ${escapeHtml(a.severity)}">${escapeHtml(a.severity)}</span></summary>
          <p class="until">Until ${new Date(a.ends || a.expires).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}</p>
          <div class="body"><strong>${escapeHtml(a.headline || "")}</strong>\n\n${escapeHtml(a.description || "")}${a.instruction ? "\n\n" + escapeHtml(a.instruction) : ""}</div>
        </details>`).join("")
      : `<p class="ok">✅ No active alerts for this area.</p>`;
    return alerts;
  } catch {
    box.innerHTML = `<p class="muted">Couldn't reach the National Weather Service right now.</p>`;
    return null;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showError(msg) {
  $("error").textContent = msg;
  $("error").hidden = false;
}

function setTheme(choice) {
  document.documentElement.dataset.theme = choice;
  try { localStorage.setItem("theme", choice); } catch {}
  document.querySelectorAll("[data-theme-choice]").forEach((b) =>
    b.setAttribute("aria-pressed", b.dataset.themeChoice === choice));
}

document.querySelectorAll("[data-theme-choice]").forEach((b) =>
  b.addEventListener("click", () => setTheme(b.dataset.themeChoice)));

$("search").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("city").value.trim();
  if (q) searchCity(q);
});

setTheme(document.documentElement.dataset.theme || "system");
loadWeather(DEFAULT);
