# Деплой DachaPro на 24/7

Эта инструкция выкладывает приложение в общий доступ на бесплатных
хостингах: **Hugging Face Spaces** (бэкенд) + **Vercel** (фронтенд).

---

## Что получится

- **Backend** на `https://dacha-pro-backend.hf.space`
  - FastAPI + FAISS + sentence-transformers + Groq
  - Docker Space (CPU basic, **16 ГБ RAM**, **2 vCPU**) — бесплатно, **без карты**
  - Не засыпает (в отличие от Render free). ML-модель влезает с запасом.
- **Frontend** на `https://dacha-pro.vercel.app` (или похожий поддомен)
  - Статика из `dist/`
  - Запросы `/api/*` идут напрямую на HF Space (через `VITE_API_BASE`)

---

## Шаг 0 — Требования

- Аккаунт **Hugging Face** (через GitHub OAuth — моментально, **без карты**).
- Аккаунт **Vercel** (через GitHub OAuth, без карты).
- **Твой Groq API ключ** (тот же, что в `backend/.env`).

Локально ничего ставить не надо — деплой через Git-интеграцию HF и UI Vercel.

---

## Шаг 1 — Подготовь репозиторий

Корень `dacha-pro/` уже содержит всё нужное:
- `backend/Dockerfile` — Docker-образ для HF Space
- `backend/README.md` — с YAML-frontmatter (обязательно для HF Space)
- `vercel.json` — SPA rewrites для Vercel

Убедись, что репо запушено в GitHub. Если ещё нет:

```bash
cd /Users/timofeyivanyushkin/dacha-pro
git init
# ⚠️ .env с GROQ_API_KEY в .gitignore — НЕ пушь секреты
git add .
git commit -m "deploy: HF Spaces + Vercel"
gh repo create dacha-pro --public --source=. --push
```

---

## Шаг 2 — Создай Space на Hugging Face

1. Зайди на [huggingface.co](https://huggingface.co) → **Spaces** → **Create new Space**.
2. Заполни:
   - **Space name**: `dacha-pro-backend`
   - **License**: MIT
   - **Space SDK**: **Docker** (важно! не Gradio, не Streamlit)
   - **Space hardware**: **CPU basic — free** (16 GB RAM, 2 vCPU)
   - **Repository visibility**: Public (для бесплатного CPU)
3. Нажми **Create Space**.

HF создаст пустой репозиторий `huggingface.co/<твой-юзер>/dacha-pro-backend`.

---

## Шаг 3 — Подключи GitHub к Space (рекомендуется)

Вместо ручного пуша в HF-репо — подключи GitHub-репо, тогда каждый push в `main`
будет триггерить пересборку Space.

1. В настройках Space → **Variables and secrets** → **Variables**:
   - Нажми **Add a secret** (не Variable — секрет шифруется и не виден в логах):
     - Name: `GROQ_API_KEY`
     - Value: `gsk_твой_ключ`
2. В **Settings** → **Source**:
   - **Repository**: подключи свой GitHub-аккаунт → выбери `dacha-pro`.
   - **Branch**: `main`.

Если предпочитаешь пушить напрямую в HF — смотри конец инструкции.

---

## Шаг 4 — Скажи HF, что бэкенд лежит в `backend/`

HF по умолчанию ожидает `Dockerfile` в корне репо. У нас он в `backend/`.
Решение — подключить **subdirectory**:

1. В настройках Space → **Variables and secrets** → **Variables** добавь:
   - Name: `HF_DOCKERFILE_PATH` (или используй `BUILD_CONFIG` через Settings → Source → Docker build context)
2. Альтернативный способ: в корне GitHub-репо создай файл `Dockerfile` со строкой:
   ```dockerfile
   FROM ghcr.io/<твой-юзер>/dacha-pro-backend:main
   ```
   (то есть пуш уже собранного образа через GitHub Actions) — **но это сложнее**.

**Самый простой путь** — пусть HF смотрит в подпапку. HF поддерживает это через
monorepo-настройку: в Settings → Source → в поле "Docker build directory" укажи
`backend/`. Если такого UI-поля нет — в Settings → Variables добавь:
   - `DOCKERFILE_PATH` = `backend/Dockerfile`

(Если HF не подхватывает из подпапки через переменные — перенеси `Dockerfile`,
`requirements.txt`, `app.py`, `recommender.py`, `plant_disease_db/`, `data/`,
`README.md` в корень репо. **Этот путь — самый надёжный**, делай его.)

### Самый надёжный вариант: перенеси всё в корень

```bash
cd /Users/timofeyivanyushkin/dacha-pro
# Перенести содержимое backend/ в корень
shopt -s dotglob
mv backend/* .
rmdir backend
# Подправить vite.config.ts — убрать /api proxy prefix, если был
git add .
git commit -m "restructure: move backend files to repo root for HF Spaces"
git push
```

Или оставь monorepo и подключи через GitHub Actions — ниже альтернативный
мини-вариант **без переноса файлов**.

---

## Шаг 5 — Альтернативный путь: monorepo + GitHub Actions (без переноса)

Создай в корне репо файл `.github/workflows/deploy-hf.yml`:

```yaml
name: Deploy to HF Spaces
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Push backend to HF Space
        env:
          HF_TOKEN: ${{ secrets.HF_TOKEN }}
          HF_SPACE_REPO: <твой-юзер>/dacha-pro-backend
        run: |
          # Синхронизируем только содержимое backend/ в HF-репо
          git clone --depth 1 https://oauth2:${HF_TOKEN}@huggingface.co/spaces/${HF_SPACE_REPO} hf-space
          rsync -av --delete --exclude='.venv' --exclude='__pycache__' \
            backend/ hf-space/
          cd hf-space
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add .
          git commit -m "Deploy from ${{ github.sha }}" || echo "No changes"
          git push
```

Где:
- `HF_TOKEN` — токен из huggingface.co → Settings → Access Tokens (тип write)
- `HF_SPACE_REPO` — `<юзер>/dacha-pro-backend`

В этом случае HF Space будет собирать из `backend/` как из корня — и
`Dockerfile` с `PORT=7860` уже настроен.

---

## Шаг 6 — Дождись сборки Space

После пуша в `huggingface.co/<юзер>/dacha-pro-backend`:

1. Открой вкладку **Logs** в Space.
2. Увидишь:
   - `Building Docker image...` (~2-3 мин, кэш зависимостей)
   - `Loading multilingual-e5-small into image...` (~1 мин на скачивание модели)
   - `INFO: Uvicorn running on http://0.0.0.0:7860`
3. Когда статус Space станет **Running** — готово.

Проверь:

```bash
curl https://<твой-юзер>-dacha-pro-backend.hf.space/health
# {"ok": true, "groq_configured": true, "faiss_loaded": true, "products_loaded": 281, ...}

curl "https://<твой-юзер>-dacha-pro-backend.hf.space/api/products?category=защита" | head -c 200
# [{"id":"akvaseyf-11-kg","name":"АКВАСЕЙФ 1,1 кг",...}]
```

---

## Шаг 7 — Деплой фронтенда на Vercel

1. Зайди на [vercel.com](https://vercel.com) → **Add New Project**.
2. Импортируй репозиторий `dacha-pro`.
3. **Framework Preset**: `Vite` (определится автоматически).
4. **Build Command**: `npm run build` (по умолчанию).
5. **Output Directory**: `dist` (по умолчанию).
6. **Environment Variables** → добавь:
   - `VITE_API_BASE` = `https://<твой-юзер>-dacha-pro-backend.hf.space`
   - Environment: Production, Preview, Development (все три)
7. Deploy.

Через 1-2 мин получишь URL вида `https://dacha-pro-xxx.vercel.app`.

---

## Шаг 8 — Проверь end-to-end

Открой `https://dacha-pro-xxx.vercel.app`:
- Главная грузится
- Вкладка "Витрина" → 280 товаров с картинками
- Вкладка "Сад" → добавляешь растение → фоткаешь лист → через 10-20 сек
  получаешь ответ от ИИ с диагнозом и товарами

Если фото-диагностика не работает — проверь:
- В консоли браузера (F12) нет ли ошибок CORS.
- `curl https://<юзер>-dacha-pro-backend.hf.space/health` возвращает `ok: true`.
- В Vercel env переменная `VITE_API_BASE` без trailing slash и **начинается с https://**.

---

## Ограничения и подводные камни

### 1. Холодный старт ~30-60 сек
HF Space пересобирается при каждом push. После простоя (нечастого) — стартует
за ~30 сек. Это **не** cold start как на fly.io (там 10 сек), но HF не засыпает
по таймауту — продолжает работать 24/7.

### 2. Лимит CPU basic
Бесплатный Space — CPU без GPU, без persistent storage. Если пойдут тяжёлые
запросы (10+ одновременно) — будет очередь. На MVP с 5-10 юзерами — без проблем.

### 3. Лимит Groq API
Free tier Groq: 30 req/min. Если 2+ человека одновременно фоткают —
упрёмся. Решения:
- Добавить `asyncio.Semaphore(3)` в `app.py` (макс 3 одновременных vision-запроса).
- Апгрейд Groq (платный, ~$0.05/1000 запросов).

### 4. CORS
Сейчас `allow_origins=["*"]` — для MVP ОК. Для прода с конкретным доменом
поправь в `backend/app.py:243`:
```python
allow_origins=["https://dacha-pro-xxx.vercel.app"],
```

### 5. Логи и мониторинг
- HF Space: вкладка **Logs** в реальном времени.
- Vercel: dashboard → Logs.
- Если хочется APM — подключи Sentry (бесплатный план 5K events/мес).

---

## Обновление кода

```bash
cd /Users/timofeyivanyushkin/dacha-pro
git add .
git commit -m "fix: ..."
git push
```

Через 1-2 мин HF пересоберёт Space автоматически (если подключён GitHub).
Vercel пересоберёт фронт за 30 сек.

---

## Откат (если что-то сломалось)

**HF Space**: вкладка **Settings** → **Factory rebuild** с предыдущего коммита,
или вручную через git revert + push.

**Vercel**: Deployments → ⋯ → Promote to Production (предыдущий билд).

---

## Удаление (если надоест)

- **HF Space**: Settings → Delete Space.
- **Vercel**: Settings → Delete Project.

---

## Почему Hugging Face Spaces — лучший выбор

| Параметр | HF Spaces | Render Free | Fly.io | Koyeb Free |
|---|---|---|---|---|
| Карта нужна | ❌ нет | ❌ нет | ⚠️ да (или $9 unlock) | ❌ нет |
| RAM | **16 ГБ** | 512 МБ | 1 ГБ | 256 МБ |
| Засыпает | ❌ нет | ✅ через 15 мин | ❌ нет | ❌ нет |
| ML-модель влезет | ✅ с запасом | ⚠️ на грани | ✅ да | ❌ нет |
| Секреты | ✅ UI | ✅ UI | ✅ CLI | ✅ UI |
| Деплой | Git push | Git push | CLI / Git | Git |
| Домен | `*.hf.space` | `*.onrender.com` | `*.fly.dev` | `*.koyeb.app` |

HF Spaces — единственный бесплатный (без карты) вариант, где ML-стек
(470 МБ модель + 50 МБ FAISS + 100 МБ Python) влезает без танцев с бубном.
