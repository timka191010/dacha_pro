/**
 * Погода через Open-Meteo (https://open-meteo.com).
 *
 * Преимущества:
 *  - бесплатно, без ключа, без регистрации
 *  - не заблокирован в РФ
 *  - можно вызывать прямо из браузера (CORS открыт)
 *  - отдаёт текущую + прогноз на 7 дней одним запросом
 *
 * По умолчанию используем координаты Москвы (средняя полоса России),
 * храним в localStorage. Пользователь может сменить — будет в Settings.
 */

const DEFAULT_LAT = 55.7558;
const DEFAULT_LON = 37.6173;

export interface WeatherDay {
  date: string; // YYYY-MM-DD
  tempMax: number;
  tempMin: number;
  weatherCode: number;
}

export interface WeatherSnapshot {
  current: {
    temp: number;
    weatherCode: number;
    isDay: boolean;
  };
  forecast: WeatherDay[]; // 3 дня: сегодня + 2 следующих
  location: { lat: number; lon: number; label: string };
  fetchedAt: number;
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m: number;
    weather_code: number;
    is_day: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

/**
 * WMO weather code → emoji.
 * https://open-meteo.com/en/docs (раздел WMO Weather interpretation codes)
 */
export function weatherCodeToEmoji(code: number, isDay = true): string {
  if (code === 0) return isDay ? '☀️' : '🌙';
  if (code === 1 || code === 2) return isDay ? '🌤' : '☁️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫';
  if (code >= 51 && code <= 57) return '🌦';
  if (code >= 61 && code <= 67) return '🌧';
  if (code >= 71 && code <= 77) return '🌨';
  if (code >= 80 && code <= 82) return '🌧';
  if (code >= 85 && code <= 86) return '🌨';
  if (code >= 95) return '⛈';
  return '🌤';
}

export function weatherCodeToLabel(code: number): string {
  if (code === 0) return 'Ясно';
  if (code === 1 || code === 2) return 'Переменная облачность';
  if (code === 3) return 'Пасмурно';
  if (code === 45 || code === 48) return 'Туман';
  if (code >= 51 && code <= 57) return 'Морось';
  if (code >= 61 && code <= 67) return 'Дождь';
  if (code >= 71 && code <= 77) return 'Снег';
  if (code >= 80 && code <= 82) return 'Ливень';
  if (code >= 85 && code <= 86) return 'Снегопад';
  if (code >= 95) return 'Гроза';
  return 'Без особенностей';
}

const CACHE_KEY = 'dp:weather:snapshot';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 минут

export function getCachedWeather(): WeatherSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as WeatherSnapshot;
    if (Date.now() - snap.fetchedAt > CACHE_TTL_MS) return null;
    return snap;
  } catch {
    return null;
  }
}

export function setCachedWeather(snap: WeatherSnapshot): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snap));
  } catch {
    // localStorage недоступен — молча игнорируем
  }
}

interface FetchOpts {
  lat?: number;
  lon?: number;
  label?: string;
}

/**
 * Получает погоду: сначала пробует кеш, потом — сеть.
 * Никогда не бросает — при ошибке возвращает null.
 */
export async function fetchWeather(opts: FetchOpts = {}): Promise<WeatherSnapshot | null> {
  const cached = getCachedWeather();
  if (cached && !opts.lat && !opts.lon) {
    return cached;
  }

  const lat = opts.lat ?? DEFAULT_LAT;
  const lon = opts.lon ?? DEFAULT_LON;
  const label = opts.label ?? 'Москва';

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,weather_code,is_day');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('forecast_days', '3');
  url.searchParams.set('timezone', 'auto');

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return cached; // сеть не отдала — отдаём что есть
    const data = (await res.json()) as OpenMeteoResponse;
    if (!data.daily || !data.current) return cached;

    const forecast: WeatherDay[] = data.daily.time.map((date, i) => ({
      date,
      tempMax: Math.round(data.daily!.temperature_2m_max[i]),
      tempMin: Math.round(data.daily!.temperature_2m_min[i]),
      weatherCode: data.daily!.weather_code[i],
    }));

    const snap: WeatherSnapshot = {
      current: {
        temp: Math.round(data.current.temperature_2m),
        weatherCode: data.current.weather_code,
        isDay: data.current.is_day === 1,
      },
      forecast,
      location: { lat, lon, label },
      fetchedAt: Date.now(),
    };

    setCachedWeather(snap);
    return snap;
  } catch {
    return cached;
  }
}
