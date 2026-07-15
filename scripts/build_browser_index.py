"""
Скрипт: собирает JSON-индексы для браузерного RAG-поиска DachaPro.

Что делает:
  1) Загружает чанки из plant_disease_db/chunks.pkl (897 чанков)
  2) Загружает предвычисленные embedding из plant_disease_db/index.faiss
  3) Загружает каталог Organic Mix из backend/data/products.json
  4) Считает embedding для каждого товара (одним проходом через e5-small)
  5) Упаковывает float32 векторы в base64 (экономия ~33% vs сырой JSON)
  6) Сохраняет в public/data/rag-index.json и public/data/rag-products-index.json

Размеры на выходе:
  - rag-index.json: ~700 КБ (897 × 384 × 4 байта → 1.4 МБ raw → ~700 КБ base64)
  - rag-products-index.json: ~330 КБ (211 × 384 × 4 байта → 320 КБ raw → ~330 КБ base64)

Запуск:
  cd backend && .venv/bin/python ../scripts/build_browser_index.py
"""

from __future__ import annotations

import base64
import json
import pickle
import sys
from pathlib import Path

# === Пути ===
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
CHUNKS_PATH = PROJECT_ROOT / "plant_disease_db" / "chunks.pkl"
INDEX_PATH = PROJECT_ROOT / "plant_disease_db" / "index.faiss"
PRODUCTS_PATH = BACKEND_DIR / "data" / "products.json"

PUBLIC_DATA_DIR = PROJECT_ROOT / "public" / "data"
RAG_INDEX_OUT = PUBLIC_DATA_DIR / "rag-index.json"
PRODUCTS_INDEX_OUT = PUBLIC_DATA_DIR / "rag-products-index.json"
PRODUCTS_OUT = PUBLIC_DATA_DIR / "products.json"

# === Те же константы что в recommender.py ===
ALLOWED_CATEGORIES = {"удобрение", "стимулятор", "защита", "почвоулучшитель"}
CROP_MATCH_BONUS = 0.05  # для справки, в браузере считается отдельно


def float32_to_base64(vec: list[float]) -> str:
    """Упаковывает список float в base64 (Float32Array → байты)."""
    import struct
    packed = struct.pack(f"<{len(vec)}f", *vec)
    return base64.b64encode(packed).decode("ascii")


def base64_to_float32(b64: str) -> list[float]:
    """Обратная операция (для проверки)."""
    import struct
    raw = base64.b64decode(b64)
    n = len(raw) // 4
    return list(struct.unpack(f"<{n}f", raw))


def load_chunks_and_vectors() -> list[dict]:
    """Грузит чанки + уже посчитанные векторы из FAISS."""
    print(f"📂 Чанки: {CHUNKS_PATH}")
    with open(CHUNKS_PATH, "rb") as f:
        chunks = pickle.load(f)
    print(f"   {len(chunks)} чанков")

    # FAISS
    print(f"📂 FAISS: {INDEX_PATH}")
    import faiss
    idx = faiss.read_index(str(INDEX_PATH))
    print(f"   {idx.ntotal} векторов, dim={idx.d}")

    assert len(chunks) == idx.ntotal, f"Чанки {len(chunks)} ≠ FAISS {idx.ntotal}"

    # Извлекаем все векторы (IndexFlatL2.reconstruct)
    print("⏳ Извлекаю векторы из FAISS...")
    import numpy as np
    vectors = np.zeros((idx.ntotal, idx.d), dtype="float32")
    for i in range(idx.ntotal):
        vectors[i] = idx.reconstruct(i)

    # Проверяем что они нормализованы
    norms = np.linalg.norm(vectors, axis=1)
    assert np.allclose(norms, 1.0, atol=1e-3), f"Векторы не нормализованы! {norms[:5]}"
    print(f"   ✓ Векторы L2-нормализованы (norm={norms[0]:.4f})")

    # Собираем JSON-структуру
    print("⏳ Сериализую...")
    result = []
    for chunk, vec in zip(chunks, vectors):
        result.append({
            "text": chunk["text"],
            "source": chunk.get("source", "?"),
            "page": chunk.get("page", "?"),
            # base64-encoded float32[384], декодируется в Float32Array на клиенте
            "vec": float32_to_base64(vec.tolist()),
        })

    return result


def load_products_and_embed() -> list[dict]:
    """Грузит товары, фильтрует, считает embedding через e5-small."""
    print(f"\n📂 Товары: {PRODUCTS_PATH}")
    with open(PRODUCTS_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)
    print(f"   {len(raw)} товаров всего")

    # Фильтр по категориям (как в recommender.py)
    filtered = [p for p in raw if p.get("category") in ALLOWED_CATEGORIES]
    print(f"   {len(filtered)} после фильтра ALLOWED_CATEGORIES")

    # Считаем embedding
    print("⏳ Загружаю multilingual-e5-small (это ~30-60 сек)...")
    from sentence_transformers import SentenceTransformer
    import numpy as np

    model = SentenceTransformer("intfloat/multilingual-e5-small")

    # Тот же текст, что в recommender.py
    texts = []
    for p in filtered:
        crops_str = ", ".join(p.get("crops", [])) if p.get("crops") else ""
        name = p.get("name", "")
        text = f"passage: {name}"
        if crops_str:
            text += f". Для культур: {crops_str}"
        texts.append(text)

    print(f"⏳ Считаю embedding для {len(texts)} товаров...")
    vectors = model.encode(
        texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    ).astype("float32")

    print(f"   ✓ dim={vectors.shape[1]}, форма={vectors.shape}")

    # Собираем JSON
    result = []
    for p, vec in zip(filtered, vectors):
        result.append({
            "id": p["id"],
            "name": p["name"],
            "category": p.get("category"),
            "crops": p.get("crops", []),
            "price": p.get("price"),
            "oldPrice": p.get("oldPrice"),
            "inStock": p.get("inStock", True),
            "url": p.get("url"),
            "image": p.get("image"),
            "badges": p.get("badges", []),
            "vec": float32_to_base64(vec.tolist()),
        })

    return result


def main() -> int:
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Копируем products.json как есть (полный каталог с фильтрацией на клиенте)
    print(f"📋 Копирую {PRODUCTS_PATH} → {PRODUCTS_OUT}")
    with open(PRODUCTS_PATH, "r", encoding="utf-8") as f:
        products_full = json.load(f)
    with open(PRODUCTS_OUT, "w", encoding="utf-8") as f:
        json.dump(products_full, f, ensure_ascii=False, separators=(",", ":"))
    print(f"   ✓ {len(products_full)} товаров")

    # 2. RAG-индекс (чанки + векторы)
    chunks_data = load_chunks_and_vectors()
    print(f"💾 Сохраняю {RAG_INDEX_OUT}")
    with open(RAG_INDEX_OUT, "w", encoding="utf-8") as f:
        json.dump(chunks_data, f, ensure_ascii=False, separators=(",", ":"))
    size_mb = RAG_INDEX_OUT.stat().st_size / 1024 / 1024
    print(f"   ✓ {len(chunks_data)} чанков, {size_mb:.2f} МБ")

    # 3. Products-индекс (товары + векторы)
    products_data = load_products_and_embed()
    print(f"💾 Сохраняю {PRODUCTS_INDEX_OUT}")
    with open(PRODUCTS_INDEX_OUT, "w", encoding="utf-8") as f:
        json.dump(products_data, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = PRODUCTS_INDEX_OUT.stat().st_size / 1024
    print(f"   ✓ {len(products_data)} товаров, {size_kb:.1f} КБ")

    # 4. Проверка
    print("\n🔍 Проверка roundtrip...")
    sample = chunks_data[0]
    decoded = base64_to_float32(sample["vec"])
    assert len(decoded) == 384, f"Ожидалось 384, получено {len(decoded)}"
    print(f"   ✓ decode OK: vec[0]={decoded[0]:.6f}")

    print("\n✅ Готово!")
    print(f"   📁 {RAG_INDEX_OUT} ({RAG_INDEX_OUT.stat().st_size / 1024 / 1024:.2f} МБ)")
    print(f"   📁 {PRODUCTS_INDEX_OUT} ({PRODUCTS_INDEX_OUT.stat().st_size / 1024:.1f} КБ)")
    print(f"   📁 {PRODUCTS_OUT} ({PRODUCTS_OUT.stat().st_size / 1024:.1f} КБ)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
