const DEFAULT = { name: "Boca Raton, Florida", lat: 26.3587, lon: -80.0831 };

const CODES = {
  0: ["Clear", "☀️"], 1: ["Mostly Clear", "🌤️"], 2: ["Partly Cloudy", "⛅"], 3: ["Cloudy", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Fog", "🌫️"],
  51: ["Drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Drizzle", "🌦️"],
  61: ["Rain", "🌧️"], 63: ["Rain", "🌧️"], 65: ["Heavy Rain", "🌧️"],
  71: ["Snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy Snow", "❄️"],
  80: ["Showers", "🌦️"], 81: ["Showers", "🌧️"], 82: ["Heavy Showers", "⛈️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm", "⛈️"], 99: ["Thunderstorm", "⛈️"],
};
const describe = (code) => CODES[code] || ["Unknown", "🌡️"];
const $ = (id) => document.getElementById(id);

async function loadWeather({ name, lat, lon }) {
  $("error").hidden = true;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const { current, daily } = await res.json();
    const [text] = describe(current.weather_code);

    $("place").textContent = name;
    $("temp").textContent = `${Math.round(current.temperature_2m)}°`;
    $("desc").textContent = text;
    $("hilo").textContent = `H:${Math.round(daily.temperature_2m_max[0])}°  L:${Math.round(daily.temperature_2m_min[0])}°`;
    $("feels").textContent = `${Math.round(current.apparent_temperature)}°`;
    $("humidity").textContent = `${current.relative_humidity_2m}%`;
    $("wind").textContent = `${Math.round(current.wind_speed_10m)} mph`;

    $("forecast").innerHTML = daily.time.map((day, i) => {
      const label = i === 0 ? "Today" : new Date(day + "T00:00").toLocaleDateString("en-US", { weekday: "short" });
      const [, icon] = describe(daily.weather_code[i]);
      return `<li><span>${label}</span><span class="icon">${icon}</span>
        <span class="range">${Math.round(daily.temperature_2m_max[i])}°<span class="lo">${Math.round(daily.temperature_2m_min[i])}°</span></span></li>`;
    }).join("");
  } catch {
    showError("Couldn't load weather. Please try again.");
  }
}

async function searchCity(query) {
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1`);
    const data = await res.json();
    const place = data.results && data.results[0];
    if (!place) return showError(`No results for "${query}".`);
    const name = [place.name, place.admin1 || place.country].filter(Boolean).join(", ");
    loadWeather({ name, lat: place.latitude, lon: place.longitude });
  } catch {
    showError("Search failed. Please try again.");
  }
}

function showError(msg) {
  $("error").textContent = msg;
  $("error").hidden = false;
}

$("search").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("city").value.trim();
  if (q) searchCity(q);
});

loadWeather(DEFAULT);
