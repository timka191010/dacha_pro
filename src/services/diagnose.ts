/**
 * Главный оркестратор диагностики для DachaPro.
 *
 * Начиная с версии 2026-07-16 RAG-сёрч перенесён на сервер:
 *   1) Удалённо через Vercel Function /api/diagnose:
 *      - Groq Vision (диагноз по фото)
 *      - TF-IDF BM25 поиск по 897 чанкам книг (на сервере, без ML)
 *      - TF-IDF BM25 поиск по 280 товарам Organic Mix (на сервер, без ML)
 *      - Groq Text (RAG-ответ с контекстом)
 *
 * Браузерная ML-часть (Transformers.js + ONNX Runtime Web WASM) удалена
 * из-за нестабильности на iOS Safari 17/18 (RangeError: offset/length).
 * TF-IDF — простая Python-математика, не нуждается в моделях и работает
 * на любом устройстве. Качество поиска для дословных запросов
 * ("фитофтороз томатов") — отличное.
 */

export interface DiagnoseRequest {
  imageBase64: string;   // JPEG без префикса data:image/...
  plantName: string;     // "Томаты"
  userNote?: string;     // "желтые пятна"
}

export interface SourceItem {
  score: number;
  text: string;
  source: string;
  page: string;
}

export interface ProductItem {
  id: string;
  name: string;
  category: string;
  price: number;
  oldPrice?: number | null;
  inStock: boolean;
  url: string;
  image: string;
  score: number;
}

export interface DiagnoseResponse {
  disease: string;
  answer: string;
  sources: SourceItem[];
  recommended_products: ProductItem[];
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/**
 * Полный цикл: фото → диагноз + RAG-ответ + товары.
 * Вся ML/поисковая логика — на сервере, клиент просто шлёт фото + текст.
 */
export async function diagnose(req: DiagnoseRequest): Promise<DiagnoseResponse> {
  const { imageBase64, plantName, userNote = '' } = req;

  const response = await fetch(`${API_BASE}/api/diagnose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_base64: imageBase64,
      plant_name: plantName,
      user_note: userNote,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return (await response.json()) as DiagnoseResponse;
}
