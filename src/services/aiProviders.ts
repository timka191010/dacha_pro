/**
 * Прокси для Groq через Vercel Function.
 *
 * Раньше здесь был прямой вызов Groq OpenAI SDK из браузера.
 * Теперь все вызовы идут через /api/chat и /api/diagnose на Vercel,
 * а GROQ_API_KEY хранится в env Vercel, не в браузере.
 *
 * См. api/chat.py и api/diagnose.py — там вся логика прокси.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

export interface ChatResult {
  text: string;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/**
 * Проверяет, доступен ли бэкенд. Теперь всегда true — Vercel Function
 * /api/chat есть всегда (на том же origin, что и фронт).
 * Оставлено для обратной совместимости со старым кодом.
 */
export function isAiAvailable(): boolean {
  return true;
}

/**
 * Стриминговый запрос к Groq через /api/chat прокси.
 * Получает чанки через Server-Sent Events (EventSource).
 */
export async function chat(
  messages: ChatMessage[],
  cb: StreamCallbacks,
): Promise<ChatResult | null> {
  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    if (!res.body) {
      throw new Error('No response body');
    }

    // Читаем SSE-стрим через ReadableStream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // SSE: события разделены "\n\n", поля "\n"
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';  // последний (неполный) — обратно в буфер

      for (const event of events) {
        const lines = event.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') {
            cb.onDone();
            return { text: full };
          }
          try {
            const obj = JSON.parse(payload);
            if (obj.error) {
              throw new Error(obj.error);
            }
            if (obj.text) {
              full += obj.text;
              cb.onChunk(obj.text);
            }
          } catch (e) {
            // Не парсится — пропускаем
            if (e instanceof Error && e.message) {
              throw e;
            }
          }
        }
      }
    }

    cb.onDone();
    return { text: full };
  } catch (err) {
    cb.onError(err instanceof Error ? err : new Error(String(err)));
    return null;
  }
}

/* ============== Vision-диагностика через /api/diagnose ============== */

/**
 * Отправляет фото больного растения через /api/diagnose (Vercel Function).
 * Внутри функции: Groq Vision (диагноз) + RAG-генерация.
 *
 * Эта функция оставлена для обратной совместимости с местами, которые
 * вызывают её напрямую (без RAG-контекста). PhotoDiagnoseModal использует
 * новый src/services/diagnose.ts, который собирает RAG-контекст локально.
 */
export async function diagnosePlant(
  imageBase64: string,
  plantName: string,
  userNote: string,
  productList: { name: string; id: string }[],
): Promise<{ answer: string; productIds: string[] } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: imageBase64,
        plant_name: plantName,
        user_note: userNote,
        rag_context: [],   // пустой — RAG не используется
        products: productList.map((p) => ({
          id: p.id,
          name: p.name,
          category: 'прочее',
          price: 0,
          inStock: true,
          url: '',
          image: '',
        })),
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const answer = data.answer || '';

    // Простой матчинг: ищем название продукта в ответе
    const lower = answer.toLowerCase();
    const productIds = productList
      .filter((p) => lower.includes(p.name.toLowerCase()))
      .map((p) => p.id);

    return { answer, productIds };
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/* ============== Утилиты для работы с изображениями ============== */

/**
 * Сжимает изображение через canvas: ресайз до maxSide×maxSide, JPEG quality.
 * Возвращает base64 без префикса data:image/jpeg;base64,.
 */
export async function compressImage(
  file: File | Blob,
  maxSide = 1024,
  quality = 0.8,
): Promise<{
  base64: string;
  thumbBase64: string;
  width: number;
  height: number;
}> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Не удалось загрузить изображение'));
    i.src = dataUrl;
  });

  return {
    base64: drawResized(img, maxSide, quality),
    thumbBase64: drawResized(img, 200, 0.6),
    width: img.width,
    height: img.height,
  };
}

function drawResized(img: HTMLImageElement, maxSide: number, quality: number): string {
  const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? '';
}
