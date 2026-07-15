/**
 * Главный оркестратор диагностики для DachaPro.
 *
 * 1) Локально (браузер) через Transformers.js + vectorSearch.ts:
 *    - embedQuery(disease) для RAG-чанков
 *    - top-3 чанка из books
 *    - embedQuery(disease+plant) для товаров
 *    - top-3 товара из Organic Mix
 *
 * 2) Удалённо через Vercel Function /api/diagnose:
 *    - Groq Vision (диагноз по фото)
 *    - Groq Text (RAG-ответ с контекстом от клиента)
 *
 * Возвращает DiagnoseResponse в формате, совместимом со старым бэкендом.
 */

import { searchChunks, searchProducts, type ProductMatch } from './vectorSearch';

export interface DiagnoseProgress {
  /** 0..1, общий прогресс */
  progress: number;
  /** Текущий шаг */
  step: 'model' | 'rag' | 'products' | 'vision' | 'generation' | 'done';
  /** Человекочитаемое сообщение */
  message: string;
}

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

export interface DiagnoseResponse {
  disease: string;
  answer: string;
  sources: SourceItem[];
  recommended_products: ProductMatch[];
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/**
 * Полный цикл: фото → диагноз + RAG-ответ + товары.
 * onProgress опционален — для UI со спиннером.
 */
export async function diagnose(
  req: DiagnoseRequest,
  onProgress?: (p: DiagnoseProgress) => void
): Promise<DiagnoseResponse> {
  const { imageBase64, plantName, userNote = '' } = req;

  const progress = (p: DiagnoseProgress) => onProgress?.(p);

  // === Шаг 1: RAG-поиск локально (после загрузки модели) ===
  progress({ progress: 0.1, step: 'rag', message: 'Ищу в книгах по агрономии…' });

  // Запрос для RAG-поиска: болезнь + растение
  const ragQuery = userNote
    ? `${plantName}: ${userNote}`
    : `${plantName} болезни`;

  // К моменту вызова модель уже должна быть загружена (если нет — загрузится тут)
  const chunks = await searchChunks(ragQuery, 3);

  // === Шаг 2: Рекомендации товаров ===
  progress({ progress: 0.25, step: 'products', message: 'Подбираю удобрения и средства защиты…' });

  const productQuery = `${plantName} ${userNote || ''}`.trim();
  const products = await searchProducts(productQuery, plantName, 3);

  // === Шаг 3: Vision + RAG-генерация через Vercel Function ===
  progress({ progress: 0.4, step: 'vision', message: 'Распознаю болезнь по фото…' });

  const response = await fetch(`${API_BASE}/api/diagnose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_base64: imageBase64,
      plant_name: plantName,
      user_note: userNote,
      // Шлём уже готовый локальный контекст — сервер просто вставляет в промпт
      rag_context: chunks.map((c) => ({
        text: c.text,
        source: c.source,
        page: c.page,
        score: c.score,
      })),
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        oldPrice: p.oldPrice,
        inStock: p.inStock,
        url: p.url,
        image: p.image,
        score: p.score,
        crop_match: p.crop_match,
      })),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  progress({ progress: 0.95, step: 'generation', message: 'Готовлю ответ…' });

  const data = (await response.json()) as DiagnoseResponse;

  progress({ progress: 1.0, step: 'done', message: 'Готово' });

  // Восстанавливаем рекомендованные товары с crops/badges из кэша vectorSearch
  // (они не нужны в промпте, но нужны для UI карточек)
  // products уже в `data.recommended_products`, этого достаточно — у них есть всё для карточки

  return data;
}
