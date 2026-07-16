import type { CalendarEntry, AiCacheEntry, AppSettings, UserPlant, Diagnosis, PlantCategory } from '../types';

const KEYS = {
  entries: 'dp:calendar:entries',
  favorites: 'dp:showcase:favorites',
  aiCache: 'dp:ai:cache',
  settings: 'dp:settings',
  myGarden: 'dp:garden:plants',
  userPlants: 'dp:garden:userPlants',
  diagnoses: 'dp:garden:diagnoses',
} as const;

/* ============== Мой сад ============== */

export interface GardenPlant {
  id: string;
  name: string;
  emoji: string;
  category: PlantCategory;
  enabled: boolean;
}

/** Предустановленный набор растений для карусели "Мой сад". */
export const GARDEN_PLANT_CATALOG: Omit<GardenPlant, 'enabled'>[] = [
  { id: 'tomato', name: 'Томаты', emoji: '🍅', category: 'огород' },
  { id: 'cucumber', name: 'Огурцы', emoji: '🥒', category: 'огород' },
  { id: 'strawberry', name: 'Клубника', emoji: '🍓', category: 'огород' },
  { id: 'apple', name: 'Яблоня', emoji: '🍎', category: 'огород' },
  { id: 'rose', name: 'Розы', emoji: '🌹', category: 'сад' },
];

export function getGardenPlants(): GardenPlant[] {
  const stored = read<Record<string, boolean>>(KEYS.myGarden);
  // По умолчанию все 5 включены — пользователь может выключить ненужные
  return GARDEN_PLANT_CATALOG.map((p) => ({
    ...p,
    enabled: stored ? Boolean(stored[p.id]) : true,
  }));
}

export function toggleGardenPlant(id: string): boolean {
  const plants = getGardenPlants();
  const target = plants.find((p) => p.id === id);
  if (!target) return false;
  target.enabled = !target.enabled;
  const map: Record<string, boolean> = {};
  for (const p of plants) map[p.id] = p.enabled;
  write(KEYS.myGarden, map);
  return target.enabled;
}

/* ============== Записи календаря ============== */

export function getAllEntries(): CalendarEntry[] {
  return read<CalendarEntry[]>(KEYS.entries) ?? [];
}

export function getEntries(dateKey: string): CalendarEntry[] {
  return getAllEntries().filter((e) => e.dateKey === dateKey);
}

export function addEntry(dateKey: string, text: string): CalendarEntry {
  const entry: CalendarEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dateKey,
    text: text.trim(),
    createdAt: Date.now(),
  };
  const all = getAllEntries();
  all.push(entry);
  write(KEYS.entries, all);
  return entry;
}

export function removeEntry(id: string): void {
  const all = getAllEntries().filter((e) => e.id !== id);
  write(KEYS.entries, all);
}

/* ============== Избранное ============== */

export function getFavorites(): string[] {
  return read<string[]>(KEYS.favorites) ?? [];
}

export function isFavorite(productId: string): boolean {
  return getFavorites().includes(productId);
}

export function toggleFavorite(productId: string): boolean {
  const favs = getFavorites();
  const idx = favs.indexOf(productId);
  let nowFavorite: boolean;
  if (idx >= 0) {
    favs.splice(idx, 1);
    nowFavorite = false;
  } else {
    favs.push(productId);
    nowFavorite = true;
  }
  write(KEYS.favorites, favs);
  return nowFavorite;
}

/* ============== Кэш ИИ-советов ============== */

function hashQuestion(q: string): string {
  let h = 0;
  for (let i = 0; i < q.length; i++) {
    h = (h * 31 + q.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export function getAiCache(dateKey: string, question: string): AiCacheEntry | null {
  const cache = read<AiCacheEntry[]>(KEYS.aiCache) ?? [];
  const key = hashQuestion(question);
  return (
    cache.find((c) => c.dateKey === dateKey && hashQuestion(c.question) === key) ?? null
  );
}

export function setAiCache(entry: AiCacheEntry): void {
  const cache = read<AiCacheEntry[]>(KEYS.aiCache) ?? [];
  cache.push(entry);
  // оставляем последние 50 записей
  const trimmed = cache.slice(-50);
  write(KEYS.aiCache, trimmed);
}

/* ============== Настройки ============== */

const defaultSettings: AppSettings = {
  region: 'Средняя полоса России',
};

export function getSettings(): AppSettings {
  return read<AppSettings>(KEYS.settings) ?? defaultSettings;
}

export function setSettings(settings: AppSettings): void {
  write(KEYS.settings, settings);
}

/* ============== Пользовательские растения ============== */

export function getUserPlants(): UserPlant[] {
  const raw = read<UserPlant[]>(KEYS.userPlants) ?? [];
  // Ленивая миграция: у записей, сохранённых до введения категорий,
  // проставляем дефолт 'огород' (там самый большой набор пресетов).
  return raw.map((p) =>
    p.category ? p : { ...p, category: 'огород' as PlantCategory },
  );
}

export function addUserPlant(name: string, emoji: string, category: PlantCategory): UserPlant {
  const plant: UserPlant = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(),
    emoji,
    category,
    createdAt: Date.now(),
  };
  const all = getUserPlants();
  all.push(plant);
  write(KEYS.userPlants, all);
  return plant;
}

export function removeUserPlant(id: string): void {
  const all = getUserPlants().filter((p) => p.id !== id);
  write(KEYS.userPlants, all);
}

/* ============== История диагностик ============== */

const MAX_DIAGNOSES = 30; // ограничиваем, чтобы не забивать localStorage

export function getDiagnoses(plantId?: string): Diagnosis[] {
  const all = read<Diagnosis[]>(KEYS.diagnoses) ?? [];
  const filtered = plantId ? all.filter((d) => d.plantId === plantId) : all;
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

export function addDiagnosis(d: Omit<Diagnosis, 'id' | 'createdAt'>): Diagnosis {
  const entry: Diagnosis = {
    ...d,
    id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  };
  const all = read<Diagnosis[]>(KEYS.diagnoses) ?? [];
  all.push(entry);
  // оставляем последние MAX_DIAGNOSES
  const trimmed = all.slice(-MAX_DIAGNOSES);
  write(KEYS.diagnoses, trimmed);
  return entry;
}

export function removeDiagnosis(id: string): void {
  const all = (read<Diagnosis[]>(KEYS.diagnoses) ?? []).filter((d) => d.id !== id);
  write(KEYS.diagnoses, all);
}

/* ============== Утилиты ============== */

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage недоступен — молча игнорируем
  }
}
