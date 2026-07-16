/**
 * Браузерный embedding через Transformers.js
 *
 * - Использует multilingual-e5-small в ONNX-квантовании (q8).
 * - Модель кэшируется в браузере (IndexedDB через Transformers.js).
 * - Первый вызов — загрузка ~100 МБ (3-5 сек на Wi-Fi, 10-15 сек на 4G).
 * - Последующие вызовы — мгновенная загрузка из кэша.
 *
 * Поддерживает WebGPU (Chrome/Edge/Android) и WASM (fallback для Safari).
 *
 * Multilingual-e5 требует ОБЯЗАТЕЛЬНЫЕ префиксы:
 *   - "query: " — для поисковых запросов
 *   - "passage: " — для документов
 * Без префиксов recall падает в разы.
 */

import { pipeline, env } from '@huggingface/transformers';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';

// === Конфигурация Transformers.js ===

// Кэш моделей в IndexedDB (по умолчанию уже включено, делаем explicit)
env.allowLocalModels = false;  // грузим с HF Hub, не локально
env.useBrowserCache = true;    // кэш в браузере (IndexedDB)
env.allowRemoteModels = true;

// Отключаем загрузку локальных ONNX-файлов по абсолютному пути (только Hub)
env.localModelPath = '';

// === КРИТИЧНО для iOS Safari ===
// Transformers.js по умолчанию грузит ONNX Runtime Web с jsDelivr CDN:
//   https://cdn.jsdelivr.net/npm/onnxruntime-web@X.Y.Z/dist/ort-wasm-simd-threaded.asyncify.mjs
//   + .wasm (23 МБ)
//
// На iOS Safari 17+ jsDelivr может:
//   - Залочить MIME type для .mjs (text/javascript vs application/javascript)
//   - Задержать CORS preflight (Safari строгий preflight)
//   - Вообще не отдать файл если на устройстве блокировка CDN
//
// РЕШЕНИЕ: складываем .mjs в /public/ort/ и принудительно указываем wasmPaths
// на наш origin. .wasm Vite уже копирует через asset/resource.
// Строка 11684 transformers.js: если есть wasmPaths — оно НЕ лезет на jsDelivr.
try {
  // @ts-ignore — поле может отсутствовать в типах
  if (env.backends?.onnx?.wasm) {
    // @ts-ignore
    env.backends.onnx.wasm.wasmPaths = {
      mjs: '/ort/ort-wasm-simd-threaded.asyncify.mjs',
      wasm: '/ort/ort-wasm-simd-threaded.asyncify.wasm',
    };
    // @ts-ignore
    env.backends.onnx.wasm.proxy = false;
  }
} catch {
  // ignore — поле может быть недоступно в старых версиях
}

// === Singleton ===

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
let resolvedDevice: 'webgpu' | 'wasm' | null = null;

export type ProgressCallback = (info: {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}) => void;

/**
 * Загружает модель (один раз, потом из кэша).
 * Прогресс можно отслеживать через onProgress.
 *
 * Стратегия выбора бэкенда:
 *  1) Пробуем WebGPU (Chrome/Edge/Android, быстрый inference).
 *  2) Если WebGPU недоступен или падает (iOS Safari) — fallback на WASM.
 *  3) WASM работает ВЕЗДЕ (iPhone, Android, desktop) — медленнее, но надёжно.
 *
 * На iPhone 13 Pro (Safari) WebGPU часто выдаёт "webgpuInit is not a function"
 * из-за кривого ONNX Runtime Web бандла. Поэтому дефолт — WASM, WebGPU только
 * если явно проверен через hasWebGPU().
 */
export async function getEmbedder(
  onProgress?: ProgressCallback
): Promise<FeatureExtractionPipeline> {
  if (extractorPromise) return extractorPromise;

  // Сначала проверяем WebGPU. Если его нет — сразу WASM.
  const useWebGPU = await hasWebGPU();
  resolvedDevice = useWebGPU ? 'webgpu' : 'wasm';

  // Попытка 1: выбранный бэкенд
  try {
    extractorPromise = pipeline(
      'feature-extraction',
      'Xenova/multilingual-e5-small',
      {
        dtype: 'q8',                  // int8-квантование, ~100 МБ
        device: resolvedDevice,
        progress_callback: onProgress,
      } as any
    ) as Promise<FeatureExtractionPipeline>;
    return await extractorPromise;
  } catch (err) {
    // Если выбранный бэкенд упал при загрузке (например WebGPU на iPhone) —
    // сбрасываем singleton и пробуем WASM.
    if (resolvedDevice === 'webgpu') {
      console.warn('[embedding] WebGPU init failed, falling back to WASM:', err);
      extractorPromise = null;
      resolvedDevice = 'wasm';
      extractorPromise = pipeline(
        'feature-extraction',
        'Xenova/multilingual-e5-small',
        {
          dtype: 'q8',
          device: 'wasm',
          progress_callback: onProgress,
        } as any
      ) as Promise<FeatureExtractionPipeline>;
      return await extractorPromise;
    }
    // WASM тоже упал — сбрасываем singleton чтобы юзер мог попробовать ещё раз
    extractorPromise = null;
    resolvedDevice = null;
    throw err;
  }
}

/**
 * Сбрасывает singleton (для retry после ошибки).
 */
export function resetEmbedder(): void {
  extractorPromise = null;
  resolvedDevice = null;
}

/**
 * Какой бэкенд реально используется (для UI/дебага).
 */
export function getActiveDevice(): 'webgpu' | 'wasm' | null {
  return resolvedDevice;
}

/**
 * Проверяет поддержку WebGPU (для UI: показать предупреждение если нет).
 *
 * Возвращает true ТОЛЬКО если WebGPU реально работает: есть navigator.gpu,
 * адаптер запрашивается без ошибок И можно получить device.
 * Это важно, потому что на iOS Safari 17+ navigator.gpu есть, но device
 * получить нельзя (или можно, но ONNX Runtime потом падает). Поэтому
 * пробуем device.requestDevice() и сразу его теряем.
 */
export async function hasWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return false;
  }
  try {
    const gpu = (navigator as any).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    if (!adapter) return false;
    // Реально пытаемся получить device. На iOS это часто падает.
    // Если получилось — WebGPU рабочий.
    const device = await adapter.requestDevice();
    device.destroy?.();
    return true;
  } catch {
    return false;
  }
}

/**
 * Безопасно превращает output.data (может быть Float32Array / TypedArray / nested)
 * в обычный Float32Array. На iOS Safari с WASM-бэкендом output.data иногда
 * приходит не как плоский массив — попытка сделать new Float32Array() на нём
 * кидает "Range consisting of offset and length are out of bounds".
 */
function toFloat32Array(data: unknown): Float32Array {
  if (data instanceof Float32Array) {
    // Создаём КОПИЮ — иначе некоторые браузеры используют общий буфер
    // и мы не сможем его потом сериализовать / кэшировать.
    return new Float32Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    // Копируем байты в НОВЫЙ буфер, выровненный по границе float32.
    // Без slice на iOS Safari создание view поверх чужого buffer
    // кидает "RangeError: offset/length out of bounds".
    const alignedLen = view.byteLength - (view.byteLength % 4);
    const buf = new ArrayBuffer(alignedLen);
    const src = new Uint8Array(view.buffer, view.byteOffset, alignedLen);
    const dst = new Uint8Array(buf);
    dst.set(src);
    return new Float32Array(buf);
  }
  if (data instanceof ArrayBuffer) {
    return new Float32Array(data);
  }
  if (Array.isArray(data)) {
    // Может быть вложенный массив (редко, но бывает)
    const flat = (data as any).flat(Infinity) as number[];
    return new Float32Array(flat);
  }
  throw new Error(
    `Unexpected output.data type from model: ${typeof data} / ${(data as any)?.constructor?.name ?? 'unknown'}`
  );
}

/** L2-нормализация вектора (вынесено из WASM — там она иногда падает на iOS). */
function l2Normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / norm;
  return out;
}

/**
 * Embedding для поискового запроса (с префиксом "query: ").
 *
 * ВАЖНО: \`normalize: true\` в WASM-бэкенде на iOS Safari падает с
 * "RangeError: offset/length out of bounds" в transformers.js v4 + ONNX Runtime Web.
 * Поэтому вызываем extractor БЕЗ normalize, а L2-нормализацию делаем в JS сами.
 */
export async function embedQuery(
  text: string,
  onProgress?: ProgressCallback
): Promise<Float32Array> {
  if (!text || !text.trim()) {
    throw new Error('embedQuery: пустой текст');
  }
  const extractor = await getEmbedder(onProgress);
  const output = await extractor(`query: ${text}`, { pooling: 'mean', normalize: false });
  const raw = toFloat32Array(output.data);
  return l2Normalize(raw);
}

/**
 * Embedding для документа/товара (с префиксом "passage: ").
 */
export async function embedPassage(
  text: string,
  onProgress?: ProgressCallback
): Promise<Float32Array> {
  if (!text || !text.trim()) {
    throw new Error('embedPassage: пустой текст');
  }
  const extractor = await getEmbedder(onProgress);
  const output = await extractor(`passage: ${text}`, { pooling: 'mean', normalize: false });
  const raw = toFloat32Array(output.data);
  return l2Normalize(raw);
}

/**
 * Batch-encoding нескольких текстов (быстрее чем по одному).
 * Возвращает массив Float32Array(384).
 *
 * ВАЖНО: на iOS Safari с WASM-бэкендом Transformers.js иногда падает в
 * batch-режиме с "RangeError: offset/length out of bounds" — поэтому если
 * batch падает, делаем fallback на поштучный encode.
 */
export async function embedPassages(
  texts: string[],
  onProgress?: ProgressCallback
): Promise<Float32Array[]> {
  if (!texts.length) return [];
  const extractor = await getEmbedder(onProgress);
  const prefixed = texts.map((t) => `passage: ${t}`);

  try {
    const output = await extractor(prefixed, { pooling: 'mean', normalize: false });
    const data = toFloat32Array(output.data);
    const dim = 384;
    if (data.length !== texts.length * dim) {
      throw new Error(
        `embedPassages: ожидалось ${texts.length * dim} floats, получено ${data.length}`
      );
    }
    const result: Float32Array[] = [];
    for (let i = 0; i < texts.length; i++) {
      result.push(l2Normalize(data.slice(i * dim, (i + 1) * dim)));
    }
    return result;
  } catch (batchErr) {
    // Fallback: поштучно. Медленнее, но не падает.
    console.warn('[embedding] batch encode failed, falling back to per-item:', batchErr);
    const out: Float32Array[] = [];
    for (const t of prefixed) {
      const r = await extractor(t, { pooling: 'mean', normalize: false });
      out.push(l2Normalize(toFloat32Array(r.data)));
    }
    return out;
  }
}
