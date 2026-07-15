# Деплой DachaPro на 24/7

Эта инструкция выкладывает приложение в общий доступ **бесплатно**:
бэкенд — **Vercel Serverless** (Groq), а ML работает **в браузере** через Transformers.js.

---

## Что получится

- **ML в браузере** через [Transformers.js](https://huggingface.co/docs/transformers.js):
  - multilingual-e5-small (ONNX q8, ~100 МБ, кэш в IndexedDB)
  - FAISS-поиск по 897 чанкам книг + 211 товарам — линейный скан в JS
  - Работает на iPhone 12+, Pixel 5+, Samsung S22+
- **Бэкенд** — 1 Vercel Serverless Function `api/diagnose.py` (~150 строк Python):
  - Проксирует Groq Vision (диагноз по фото)
  - Проксирует Groq Text (RAG-генерация ответа)
  - `GROQ_API_KEY` хранится в env Vercel, **не в браузере**
- **Статика** в `/public/data/`: каталог + предвычисленные эмбеддинги
- **Стоимость:** 0 (Vercel Hobby + Groq Free Tier)
- **Скорость:** 10-15 сек end-to-end (cold), 5-10 сек (warm)
- **Не засыпает**, не OOM, не cold-start сервера

---

## Шаг 0 — Требования

- Аккаунт **GitHub**
- Аккаунт **Vercel** (через GitHub OAuth, без карты)
- **Groq API ключ** (https://console.groq.com — бесплатно за 30 сек)

---

## Шаг 1 — Запушь репо в GitHub

```bash
cd /Users/timofeyivanyushkin/dacha-pro
# Уже инициализировано локально. Добавь remote и запушь:
gh repo create dacha-pro --public --source=. --push
# (или через GitHub UI: New repo → dacha-pro → push existing)
```

**Что в репо:**
- `api/diagnose.py` — Vercel Function (Python)
- `src/services/embedding.ts`, `vectorSearch.ts`, `diagnose.ts` — браузерный ML
- `public/data/rag-index.json` (3 МБ) + `rag-products-index.json` (520 КБ) + `products.json` (132 КБ)
- `scripts/build_browser_index.py` — офлайн-сборка JSON-индексов
- `vercel.json` — SPA rewrites

⚠️ **`.env` с GROQ ключом в `.gitignore`** — никогда не пушь секреты.

---

## Шаг 2 — Создай проект на Vercel

1. Зайди на [vercel.com](https://vercel.com) → **Add New Project**.
2. Импортируй репозиторий `dacha-pro`.
3. **Framework Preset**: `Vite` (определится автоматически).
4. **Build Command**: `npm run build` (по умолчанию).
5. **Output Directory**: `dist` (по умолчанию).
6. **Environment Variables** → добавь:
   - `GROQ_API_KEY` = `gsk_твой_ключ`
   - Environment: **Production** (только, или все три — не критично)
7. Deploy.

Через 1-2 мин получишь URL вида `https://dacha-pro-xxx.vercel.app`.

---

## Шаг 3 — Проверь, что всё работает

### 3.1 Главная грузится
Открой `https://dacha-pro-xxx.vercel.app` — должен быть дизайн DachaPro.

### 3.2 Витрина показывает 280 товаров
Открой вкладку "Витрина". Должны загрузиться товары из `/data/products.json` (~132 КБ).

### 3.3 RAG-индекс доступен
```bash
curl https://dacha-pro-xxx.vercel.app/data/rag-index.json | head -c 100
# {"text":"...","source":"?","page":"?","vec":"..."}

curl https://dacha-pro-xxx.vercel.app/data/rag-products-index.json | head -c 100
# [{"id":"...","name":"...","vec":"..."}, ...]
```

### 3.4 API-функция отвечает
```bash
curl https://dacha-pro-xxx.vercel.app/api/diagnose
# {"ok": true, "endpoint": "diagnose", "method": "POST"}
```

### 3.5 End-to-end фото-диагностика
1. Открой вкладку "Сад" → добавь растение (например, "Томаты")
2. Нажми "Сфотографировать" → сделай фото листа
3. В первый раз: 5-15 сек на загрузку модели e5-small (~100 МБ, кэшируется)
4. После загрузки: 10-15 сек на диагностику (RAG-поиск локально + Vision + RAG-генерация)
5. Получишь ответ: диагноз + 3 источника из книг + 3 рекомендованных товара Organic Mix

---

## Шаг 4 — Обновление кода

```bash
cd /Users/timofeyivanyushkin/dacha-pro
git add .
git commit -m "fix: ..."
git push
```

Vercel auto-deploy за 1-2 мин.

### Обновление каталога Organic Mix

Если организовали новый парсинг товаров:

```bash
cd backend
.venv/bin/python ../scripts/scrape_organic_mix.py  # парсинг
.venv/bin/python ../scripts/build_browser_index.py  # пересчитать эмбеддинги
cd ..
git add public/data/
git commit -m "chore: обновить каталог"
git push
```

---

## Подводные камни

### 1. Модель 100 МБ в браузере

Первый визит пользователя — загрузка 100 МБ модели. На 4G это 10-15 сек.
**Решение:** показываем прогресс загрузки (`Загружаю модель: 45%...`).
После первой загрузки модель кэшируется в IndexedDB — последующие визиты мгновенны.

### 2. iOS Safari < 16.4

WebAssembly SIMD имеет баги на старых iPhone (8, X, 11).
**Решение:** не критично для нашей аудитории (iPhone 13 Pro — основной).

### 3. CORS

Vercel Function на том же origin, что и фронт — CORS не нужен.
Внутри Function проксируется Groq — внешний API, CORS не важен.

### 4. Vercel Python runtime

Поддерживает синхронный код (asyncio нет). Groq через `urllib.request` — ок.
Cold start: ~200-500 мс (юзер не заметит, он уже ждёт 10 сек на ML).

### 5. Лимит Groq

Free tier: 30 req/min на Groq Vision. При 100 юзерах — могут быть задержки.
Решение: ставка 1 запрос/2 сек через throttle на фронте (TODO).

### 6. Размер `dist/`

После билда: ~28 МБ (включая ONNX WASM runtime 23 МБ).
Vercel Free: 100 ГБ трафика/мес — хватит на 3500 уникальных визитов.

---

## Откат (если что-то сломалось)

Vercel Dashboard → Deployments → ⋯ → Promote to Production (предыдущий билд).

---

## Удаление

Vercel Dashboard → Settings → Delete Project.

---

## Почему эта архитектура

| Компонент | Где | Почему |
|---|---|---|
| Embedding (e5-small) | Браузер | 100 МБ кэшируется, после загрузки мгновенно |
| FAISS-индекс (897 чанков) | Браузер | 3 МБ статика, линейный скан <5 мс |
| FAISS-индекс (211 товаров) | Браузер | 520 КБ, pre-computed |
| Каталог Organic Mix | Браузер | 132 КБ, /data/products.json |
| Groq Vision (диагноз) | Vercel Function | Прокси для защиты API ключа |
| Groq RAG (генерация) | Vercel Function | Прокси для защиты API ключа |
| CORS / proxy | Не нужен | Vercel Function на том же origin |

**Итог:** серверная RAM = 0, платим только за Groq usage, не засыпает, не OOM.
