/**
 * Браузерный векторный поиск (cosine similarity) для DachaPro.
 *
 * - Не зависит от FAISS / faiss-wasm — пишем вручную (для 900 векторов тривиально).
 * - base64-encoded float32 → декодируется в Float32Array один раз при загрузке индекса.
 * - Линейный скан: 900 × 384 = 345K умножений = <5 мс на iPhone 13 Pro.
 *
 * Все векторы L2-нормализованы на этапе сборки (build_browser_index.py),
 * поэтому dot product == cosine similarity.
 */

import { embedQuery } from './embedding';

// === Типы ===

/** Чанк из FAISS-базы книг по болезням растений. */
export interface RagChunk {
  text: string;
  source: string;
  page: string;
  vec: string; // base64-encoded Float32Array(384)
}

/** Товар Organic Mix с предвычисленным embedding. */
export interface RagProduct {
  id: string;
  name: string;
  category: string;
  crops: string[];
  price: number;
  oldPrice: number | null;
  inStock: boolean;
  url: string;
  image: string;
  badges: string[];
  vec: string;
}

/** Результат поиска чанка с similarity score. */
export interface ChunkMatch {
  text: string;
  source: string;
  page: string;
  score: number;
}

/** Результат поиска товара с similarity score и crop-бонусом. */
export interface ProductMatch extends Omit<RagProduct, 'vec'> {
  score: number;
  crop_match: boolean;
}

// === Кэш декодированных индексов ===

let chunksCache: { chunk: RagChunk; vec: Float32Array }[] | null = null;
let productsCache: { product: RagProduct; vec: Float32Array }[] | null = null;

// === Декодирование base64 → Float32Array ===

function b64ToFloat32(b64: string): Float32Array {
  if (!b64) return new Float32Array(0);
  const binary = atob(b64);
  // Используем КОПИЮ буфера (slice создаёт новый ArrayBuffer) — иначе
  // bytes.buffer может указывать на общий буфер atob, и на iOS Safari
  // создание Float32Array поверх него кидает "RangeError: offset/length".
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (buf.byteLength % 4 !== 0) {
    // Маловероятно (наш python скрипт всегда пишет 384 float32 = 1536 байт),
    // но если что-то не так — обрезаем до границы float32.
    const alignedLen = Math.floor(buf.byteLength / 4) * 4;
    const aligned = bytes.slice(0, alignedLen);
    return new Float32Array(aligned.buffer);
  }
  return new Float32Array(buf);
}

// === Загрузка и кэширование индексов ===

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadChunksIndex(): Promise<void> {
  if (chunksCache) return;
  const data = await fetchJson<RagChunk[]>('/data/rag-index.json');
  chunksCache = data.map((c) => ({ chunk: c, vec: b64ToFloat32(c.vec) }));
  console.log(`[vectorSearch] Loaded ${chunksCache.length} chunks`);
}

export async function loadProductsIndex(): Promise<void> {
  if (productsCache) return;
  const data = await fetchJson<RagProduct[]>('/data/rag-products-index.json');
  productsCache = data.map((p) => ({ product: p, vec: b64ToFloat32(p.vec) }));
  console.log(`[vectorSearch] Loaded ${productsCache.length} products`);
}

// === Math ===

/** Dot product двух L2-нормализованных векторов === cosine similarity. */
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// === Маппинг растений (из recommender.py → JS) ===

const PLANT_ALIASES: Record<string, string> = {
  томаты: 'томаты', помидоры: 'томаты', помидор: 'томаты',
  огурцы: 'огурцы', огурец: 'огурцы',
  перцы: 'перцы', перец: 'перцы', 'болгарский перец': 'перцы',
  клубника: 'клубника', клубнику: 'клубника', земляника: 'клубника',
  ягоды: 'ягоды', ягода: 'ягоды', ягодные: 'ягоды',
  розы: 'розы', роза: 'розы',
  цветы: 'цветы', цветок: 'цветы', цветочные: 'цветы',
  петунии: 'петунии', петуния: 'петунии',
  гортензии: 'гортензии', гортензия: 'гортензии',
  виноград: 'виноград',
  капуста: 'капуста',
  картофель: 'картофель', картошка: 'картофель',
  морковь: 'морковь', корнеплоды: 'корнеплоды',
  клематисы: 'клематисы', клематис: 'клематисы',
  лаванда: 'лаванда',
  пионы: 'пионы', пион: 'пионы',
  хвойные: 'хвойные', хвоя: 'хвойные', туя: 'туя', туи: 'туя',
  голубика: 'голубика',
  рассада: 'рассада',
  комнатные: 'комнатные', 'комнатные растения': 'комнатные',
  фикусы: 'фикусы', фикус: 'фикусы',
  газон: 'газон',
  плодовые: 'плодовые',
  луковичные: 'луковичные',
};

export function normalizePlant(plantName: string): string | null {
  const p = plantName.toLowerCase().trim();
  if (PLANT_ALIASES[p]) return PLANT_ALIASES[p];
  for (const [k, v] of Object.entries(PLANT_ALIASES)) {
    if (p.includes(k)) return v;
  }
  return null;
}

// === Поиск чанков ===

/**
 * Ищет top-K ближайших чанков к запросу.
 * @param query — текст запроса (например, "фитофтороз")
 * @param topK — сколько вернуть (default 3)
 */
export async function searchChunks(
  query: string,
  topK: number = 3
): Promise<ChunkMatch[]> {
  if (!chunksCache) await loadChunksIndex();
  if (!chunksCache || chunksCache.length === 0) return [];

  // Кодируем запрос (модель уже загружена, кэш быстрый)
  const queryVec = await embedQuery(query);

  // Скоринг: dot product
  const scored = chunksCache.map(({ chunk, vec }) => ({
    ...chunk,
    score: dot(queryVec, vec),
  }));

  // Сортировка по убыванию score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}

// === Поиск товаров (как recommender.recommend в Python) ===

const CROP_MATCH_BONUS = 0.05;

/**
 * Ищет top-K товаров, ближайших к запросу.
 * Логика из recommender.py:
 *   1) Cosine similarity через FAISS (тут — линейный скан)
 *   2) +0.05 бонус если crops[] товара совпадает с культурой пользователя
 *   3) Стратегия: 1-й — лучший, 2-й — скидочный, остальные — по score
 */
export async function searchProducts(
  query: string,
  plantName: string,
  topK: number = 3
): Promise<ProductMatch[]> {
  if (!productsCache) await loadProductsIndex();
  if (!productsCache || productsCache.length === 0) return [];

  const targetCrop = normalizePlant(plantName);
  const queryVec = await embedQuery(query);

  // Берём кандидатов с запасом (как в recommender.py)
  const n_candidates = Math.min(Math.max(topK * 4, 12), productsCache.length);

  const candidates = productsCache.map(({ product, vec }) => {
    let score = dot(queryVec, vec);
    const cropMatch =
      !!targetCrop && product.crops && product.crops.includes(targetCrop);
    if (cropMatch) score += CROP_MATCH_BONUS;
    return { product, score, crop_match: cropMatch };
  });

  candidates.sort((a, b) => b.score - a.score);

  const topCandidates = candidates.slice(0, n_candidates);
  const result: ProductMatch[] = [];

  // 1) Лучший по score
  if (topCandidates.length > 0) {
    const c = topCandidates[0];
    const { product, score, crop_match } = c;
    result.push({ ...product, score, crop_match });
  }

  // 2) Скидочный (следующий, не совпадающий с первым)
  const saleItem = topCandidates
    .slice(1)
    .find(
      (c) =>
        c.product.oldPrice != null &&
        c.product.oldPrice > c.product.price &&
        c.product.inStock
    );
  if (saleItem) {
    const { product, score, crop_match } = saleItem;
    result.push({ ...product, score, crop_match });
  } else {
    // Не нашли среди семантических — берём ЛЮБОЙ скидочный (с crop-бонусом)
    const saleItems = candidates.filter(
      (c) =>
        c.product.oldPrice != null &&
        c.product.oldPrice > c.product.price &&
        c.product.inStock
    );
    if (saleItems.length > 0) {
      // Уже отсортированы, первый = лучший по adjusted score
      const c = saleItems[0];
      const { product, score, crop_match } = c;
      result.push({ ...product, score, crop_match });
    }
  }

  // 3) Добиваем по score, без дублей
  for (const c of topCandidates.slice(1)) {
    if (result.length >= topK) break;
    if (result.some((r) => r.id === c.product.id)) continue;
    const { product, score, crop_match } = c;
    result.push({ ...product, score, crop_match });
  }

  return result.slice(0, topK);
}
