import OpenAI from 'openai';

/**
 * Единственный провайдер ИИ для чата — Groq.
 * Бесплатный, ~30 запросов/мин, без оплаты навсегда.
 * https://console.groq.com/ — ключ выдаётся мгновенно после регистрации.
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

/* ============== Системный промпт ============== */

const SYSTEM_PROMPT = `Ты — опытный агроном-консультант для дачников и огородников средней полосы России.
Даёшь практичные, конкретные советы по уходу за растениями.
Стиль: дружелюбный, без воды, по делу. Короткие абзацы и маркированные списки.
Не выдумывай конкретных марок, если не уверен. Учитывай, что пользователь — любитель, а не агроном-профессионал.
Отвечай на языке пользователя (по умолчанию — русский).`;

/* ============== Groq ============== */

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY as string | undefined;

export function isAiAvailable(): boolean {
  return Boolean(
    GROQ_KEY && GROQ_KEY.trim() !== '' && !GROQ_KEY.includes('REPLACE_ME')
  );
}

const client: OpenAI | null = isAiAvailable()
  ? new OpenAI({
      apiKey: GROQ_KEY!,
      baseURL: 'https://api.groq.com/openai/v1',
      dangerouslyAllowBrowser: true,
    })
  : null;

export interface ChatResult {
  text: string;
}

/**
 * Стриминговый запрос к Groq (llama-3.1-8b-instant).
 * Вызывает onChunk по мере поступления токенов, onDone по завершении,
 * onError при ошибке. Возвращает полный текст.
 */
export async function chat(
  messages: ChatMessage[],
  cb: StreamCallbacks,
): Promise<ChatResult | null> {
  if (!client) {
    cb.onError(new Error('Ключ Groq не задан. Откройте .env и впишите VITE_GROQ_API_KEY.'));
    return null;
  }
  try {
    const stream = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.7,
      max_tokens: 1000,
      stream: true,
    });
    let full = '';
    for await (const chunk of stream) {
      const piece = chunk.choices[0]?.delta?.content ?? '';
      if (piece) {
        full += piece;
        cb.onChunk(piece);
      }
    }
    cb.onDone();
    return { text: full };
  } catch (err) {
    cb.onError(err instanceof Error ? err : new Error(String(err)));
    return null;
  }
}

/* ============== Vision-диагностика (Groq llama-3.2-90b-vision) ============== */

const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const VISION_SYSTEM_PROMPT = `Ты — опытный агроном-фитопатолог для дачников средней полосы России.
Пользователь прислал фото своего растения и краткое описание проблемы.

Дай СТРУКТУРИРОВАННЫЙ ответ СТРОГО в таком формате (каждый раздел с заголовком):

🔍 ДИАГНОЗ
Кратко (1-2 предложения) что с растением. Если похоже на несколько болезней — перечисли по вероятности.

💡 ЧТО ДЕЛАТЬ
3-5 конкретных шагов. Нумерованный список. Без воды.

🛒 ПРОДУКТЫ ОРГАНИК МИКС
Если из перечисленных ниже продуктов что-то подходит — укажи их НАЗВАНИЕ (как в списке). Если ничего не нужно — напиши "Не требуется".

⚠️ КОГДА К СПЕЦИАЛИСТУ
В каких случаях обращаться в фитосанитарную службу.

Правила:
- Отвечай по-русски, дружелюбно, без зауми.
- Не выдумывай продуктов, которых нет в списке.
- Если фото нечёткое или ты не уверен — честно скажи.
- Не более 350 слов.`;

/**
 * Отправляет фото больного растения в Groq vision и возвращает диагноз.
 *
 * @param imageBase64 — JPEG в base64 (без префикса data:image/jpeg;base64,)
 * @param plantName — название растения
 * @param userNote — что беспокоит (опционально)
 * @param productList — список доступных продуктов Органик Микс
 */
export async function diagnosePlant(
  imageBase64: string,
  plantName: string,
  userNote: string,
  productList: { name: string; id: string }[],
): Promise<{ answer: string; productIds: string[] } | null> {
  if (!client) {
    throw new Error('Ключ Groq не задан. Откройте .env и впишите VITE_GROQ_API_KEY.');
  }
  const productText = productList
    .map((p, i) => `${i + 1}. ${p.name} (id: ${p.id})`)
    .join('\n');

  const userText = [
    `Растение: ${plantName}.`,
    userNote.trim() ? `Что беспокоит: ${userNote.trim()}` : 'Опиши состояние по фото.',
    '',
    'Доступные продукты Органик Микс:',
    productText,
  ].join('\n');

  try {
    const res = await client.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        { role: 'system', content: VISION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
      temperature: 0.4,
      max_tokens: 800,
    });

    const answer = res.choices[0]?.message?.content ?? '';

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
