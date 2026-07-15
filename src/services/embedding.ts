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

// === Singleton ===

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

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
 */
export async function getEmbedder(
  onProgress?: ProgressCallback
): Promise<FeatureExtractionPipeline> {
  if (extractorPromise) return extractorPromise;

  // Используем quantized модель (q8) — ~100 МБ вместо 470 МБ.
  // Xenova/multilingual-e5-small — официальное зеркало ONNX-версии.
  extractorPromise = pipeline(
    'feature-extraction',
    'Xenova/multilingual-e5-small',
    {
      // quantized: true,  // по умолчанию уже true для feature-extraction
      dtype: 'q8',       // int8-квантование, ~100 МБ
      device: 'webgpu',   // авто-fallback на wasm если WebGPU недоступен
      progress_callback: onProgress,
    } as any
  ) as Promise<FeatureExtractionPipeline>;

  return extractorPromise;
}

/**
 * Проверяет поддержку WebGPU (для UI: показать предупреждение если нет).
 */
export async function hasWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return false;
  }
  try {
    const gpu = (navigator as any).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

/**
 * Embedding для поискового запроса (с префиксом "query: ").
 */
export async function embedQuery(
  text: string,
  onProgress?: ProgressCallback
): Promise<Float32Array> {
  const extractor = await getEmbedder(onProgress);
  const output = await extractor(`query: ${text}`, { pooling: 'mean', normalize: true });
  // output.data — Float32Array размерности 384
  return new Float32Array(output.data as Float32Array);
}

/**
 * Embedding для документа/товара (с префиксом "passage: ").
 */
export async function embedPassage(
  text: string,
  onProgress?: ProgressCallback
): Promise<Float32Array> {
  const extractor = await getEmbedder(onProgress);
  const output = await extractor(`passage: ${text}`, { pooling: 'mean', normalize: true });
  return new Float32Array(output.data as Float32Array);
}

/**
 * Batch-encoding нескольких текстов (быстрее чем по одному).
 * Возвращает массив Float32Array(384).
 */
export async function embedPassages(
  texts: string[],
  onProgress?: ProgressCallback
): Promise<Float32Array[]> {
  const extractor = await getEmbedder(onProgress);
  const prefixed = texts.map((t) => `passage: ${t}`);
  const output = await extractor(prefixed, { pooling: 'mean', normalize: true });
  // output.data — Float32Array длиной texts.length * 384
  const dim = 384;
  const data = output.data as Float32Array;
  const result: Float32Array[] = [];
  for (let i = 0; i < texts.length; i++) {
    result.push(data.slice(i * dim, (i + 1) * dim));
  }
  return result;
}
