---
title: DachaPro RAG Backend
emoji: 🌱
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
pinned: true
license: mit
---

# DachaPro RAG Backend

FastAPI + FAISS + sentence-transformers + Groq для диагностики болезней растений по фото
и рекомендаций по лечению/удобрениям.

API:
- `GET /health` — проверка состояния (модель загружена, FAISS ок, products загружены)
- `GET /api/products` — каталог Organic Mix (фильтры: category, crop, in_stock, on_sale)
- `POST /api/diagnose` — multipart/form-data с `image` + `plant` (опц.) → диагноз + товары

См. [`DEPLOY.md`](https://github.com/<user>/dacha-pro/blob/main/DEPLOY.md) в корне репо.
