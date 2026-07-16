"""
Vercel Serverless Function: /api/diagnose
"""
from __future__ import annotations  # для совместимости с Python <3.9 (list[str] и т.п.)

from http.server import BaseHTTPRequestHandler
import json
import os
import re
import math
from collections import Counter

# === Конфигурация (env) ===
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE = "https://api.groq.com/openai/v1"
VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
TEXT_MODEL = "llama-3.1-8b-instant"

# === Пути к данным (Vercel read-only) ===
# На Vercel __file__ = /var/task/api/diagnose.py
_DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# === TF-IDF индекс (загружается один раз при первом запросе) ===
_INDEX_CACHE = {}

STOP_WORDS = frozenset("""
и в с по на от из за для что это как но а же бы ли ни не о у к т о в с и п р н л м д я ы ь г з б ч ш щ ж э ю й ц
the of to in for is at on an be by or not
""".split())


def _tokenize(text: str) -> list[str]:
    """Токенизация: lowercase, только кириллица + латиница, слова >2 символов, без стоп-слов."""
    return [w for w in re.findall(r'[а-яёa-z]+', text.lower())
            if len(w) > 2 and w not in STOP_WORDS]


def _load_index(name: str) -> dict:
    """Ленивая загрузка TF-IDF индекса (один раз)."""
    if name in _INDEX_CACHE:
        return _INDEX_CACHE[name]
    path = os.path.join(_DATA_DIR, name)
    with open(path, 'r', encoding='utf-8') as f:
        idx = json.load(f)
    _INDEX_CACHE[name] = idx
    return idx


def _tfidf_search(query: str, index_name: str, top_k: int = 3,
                  category_bonus: tuple[str, float] | None = None,
                  products_lookup: list | None = None,
                  keyword_in_name_bonus: float = 0.0) -> list[tuple[int, float]]:
    """
    TF-IDF cosine similarity поиск.
    Возвращает список (doc_index, score), отсортированный по убыванию score.

    Параметры:
    - category_bonus: (category_name, bonus_score) — бонус если у товара эта category.
    - products_lookup: список товаров (нужен для category_bonus).
    - keyword_in_name_bonus: бонус если в name товара есть слово из запроса.
    """
    idx = _load_index(index_name)
    idf = idx['idf']
    docs = idx['docs']

    # Слова запроса, которые есть в idf (для keyword-бонуса)
    query_words = set(_tokenize(query))

    # Вектор запроса (TF-IDF)
    q_toks = Counter(w for w in query_words if w in idf)
    if not q_toks and keyword_in_name_bonus == 0:
        return []
    q_norm = math.sqrt(sum((v * idf[w]) ** 2 for w, v in q_toks.items())) if q_toks else 1
    if q_norm == 0:
        q_norm = 1

    scores = []
    for i, d in enumerate(docs):
        # TF-IDF cosine
        s = 0.0
        for w, tf in d['tokens'].items():
            if w in q_toks:
                s += tf * idf[w] * q_toks[w] * idf[w]
        if d['norm'] > 0 and q_norm > 0:
            s = s / (d['norm'] * q_norm)

        # Бонус за category (для товаров: защита > удобрение для болезней)
        if category_bonus and products_lookup:
            cat, bonus = category_bonus
            if products_lookup[i].get('category') == cat:
                s += bonus

        # Бонус за keyword в name (если в названии товара есть слово из запроса)
        if keyword_in_name_bonus > 0 and products_lookup:
            name_lower = (products_lookup[i].get('name', '') or '').lower()
            for w in query_words:
                if len(w) >= 4 and w in name_lower:
                    s += keyword_in_name_bonus
                    break  # один бонус за товар, не за каждое слово

        scores.append((i, s))

    scores.sort(key=lambda x: -x[1])
    return scores[:top_k]


def _load_index_or_empty(name: str) -> list:
    """Загружает JSON-массив (чанки или товары). При ошибке — пустой массив."""
    try:
        with open(os.path.join(_DATA_DIR, name), 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[diagnose] не удалось загрузить {name}: {e}", flush=True)
        return []

# === Промпты (скопированы из backend/app.py) ===

VISION_SYSTEM_PROMPT = """Ты — опытный агроном-фитопатолог для дачников средней полосы России.
Пользователь прислал фото растения.

Твоя ЕДИНСТВЕННАЯ задача — коротко назвать болезнь/проблему, которую ты видишь.
Если растение здорово — напиши "здоровое".
Если не можешь определить — напиши "неизвестная проблема".

Формат ответа СТРОГО:
- Только название (1-3 слова), без объяснений, без нумерации.
- На русском языке.
- Примеры: "мучнистая роса", "фитофтороз", "тля", "здоровое", "неизвестная проблема".
"""

RAG_SYSTEM_PROMPT = """Ты — агроном-консультант для дачников средней полосы России.
Пользователь прислал фото больного растения, vision-модель поставила диагноз: {disease}.
Ниже — контекст из ПРОВЕРЕННЫХ ПЕЧАТНЫХ ИСТОЧНИКОВ по агрономии.

ТВОИ ЖЁСТКИЕ ПРАВИЛА ПО СОДЕРЖАНИЮ:
1. Используй ТОЛЬКО то, что в контексте. Не придумывай препаратов, дозировок,
   народных средств, сроков — НИЧЕГО, чего там нет.
2. Конкретные дозировки, сроки, названия — ТОЧНО как в тексте (с единицами).
3. Если в контексте НЕТ информации о лечении — напиши:
   "В моей базе знаний нет рекомендаций по лечению '{disease}'.
    Обратитесь к фитопатологу или в местный центр защиты растений."
4. Если контекст противоречит сам себе — перечисли обе версии.
5. Никаких знаний «из головы». Если что-то не упомянуто — молчи.

ТВОИ ЖЁСТКИЕ ПРАВИЛА ПО ФОРМАТУ (это главное!):
А. Ответ должен быть КОРОТКИМ и УДОБНЫМ ДЛЯ ЧТЕНИЯ НА ТЕЛЕФОНЕ.
   Не больше 3-4 пунктов в каждом блоке. Если в контексте 10 советов —
   выбери 3-4 самых конкретных, остальное отбрось.
Б. ГРУППИРУЙ однотипное: если в контексте 5 фунгицидов из одной химической
   группы — упомяни группу и 1-2 примера, а не перечисляй все пять.
   НО: если в контексте есть И химические (Абига-Пик, Оксихом, бордоская и т.п.),
   И биологические (Фитоспорин и т.п.) препараты — обязательно упомяни ОБА типа,
   даже если они в разных строках контекста. Иначе пользователь не узнает
   про самые действенные средства.
В. СТРУКТУРА ОТВЕТА (строго, без отсебятины):

   🔍 [диагноз одним коротким предложением]

   🚨 Что делать СЕЙЧАС:
   [1-2 самых СРОЧНЫХ действия. Сюда относится: немедленная обработка
   препаратом, удаление поражённых частей, изоляция от других культур.
   НЕ сюда: плодосмена, проветривание, обработка семян — это профилактика.]

   💊 Чем обработать (препарат + доза):
   [Конкретные препараты с дозировками. Химические фунгициды (Абига-Пик,
   Оксихом, бордоская жидкость и т.п.) и биологические (Фитоспорин и т.п.)
   — ОБЯЗАТЕЛЬНО оба типа, если есть в контексте. Можно через «либо… либо…»
   или в один пункт через запятую. Не больше 2-3 строк суммарно.]

   🛡 Профилактика (на будущее):
   [1-3 пункта. Только то, что реально может делать дачник: плодосмена,
   проветривание, уборка растительных остатков и т.п.]

   🛒 Подходящие продукты Organic Mix:
   [Сюда ОБЯЗАТЕЛЬНО выведи список из блока ПОДХОДЯЩИЕ ПРОДУКТЫ ORGANIC MIX ниже.
   В одну строку через запятую: «🛒 <название 1> (<цена>), <название 2> (<цена>)».
   Если в блоке «(нет подходящих товаров)» — напиши «В каталоге Organic Mix пока
   нет рекомендаций для этого случая».]

   📚 Источник: [книга, стр.]

Г. Не пиши вступлений («Исходя из контекста…», «Согласно предоставленным
   данным…»). Сразу по делу.
Д. Каждый пункт — не длиннее 1 строки на телефоне (≈60-80 символов).
"""


# === Groq-вызовы (минимальные, без SDK — чтобы не тащить лишнее в Function) ===

def groq_chat(messages: list, model: str, temperature: float, max_tokens: int) -> str:
    """Один вызов Groq Chat Completions API."""
    import urllib.request
    req = urllib.request.Request(
        f"{GROQ_BASE}/chat/completions",
        data=json.dumps({
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
            # Без User-Agent Groq возвращает 403 (проверено 2026-07-16).
            "User-Agent": "DachaPro/1.0 (Vercel Serverless)",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return (data["choices"][0]["message"]["content"] or "").strip()


def call_vision(image_base64: str, plant_name: str, user_note: str) -> str:
    """Groq Vision: возвращает название болезни одним-двумя словами."""
    user_text_parts = [f"Растение: {plant_name}."]
    if user_note.strip():
        user_text_parts.append(f"Что беспокоит: {user_note.strip()}")
    user_text_parts.append(
        'Назови болезнь или проблему одним-двумя словами. '
        'Если растение здорово — ответь "здоровое". '
        'Если не можешь определить — ответь "неизвестная проблема".'
    )

    return groq_chat(
        model=VISION_MODEL,
        temperature=0.1,
        max_tokens=80,
        messages=[
            {"role": "system", "content": VISION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "\n".join(user_text_parts)},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_base64}"
                        },
                    },
                ],
            },
        ],
    )


def call_rag(disease: str, plant_name: str, context_block: str, products_block: str) -> str:
    """Groq Text: финальный RAG-ответ по готовому контексту."""
    user_msg = (
        f"Растение: {plant_name}\n"
        f"Диагноз (от vision-модели): {disease}\n\n"
        f"=== КОНТЕКСТ ИЗ ПЕЧАТНЫХ ИСТОЧНИКОВ ===\n"
        f"{context_block}\n"
        f"=== КОНЕЦ КОНТЕКСТА ===\n\n"
        f"=== ПОДХОДЯЩИЕ ПРОДУКТЫ ORGANIC MIX ===\n"
        f"{products_block}\n"
        f"=== КОНЕЦ СПИСКА ПРОДУКТОВ ===\n\n"
        f"Дай ответ СТРОГО по контексту. Помни: ничего не придумывай."
    )
    return groq_chat(
        model=TEXT_MODEL,
        temperature=0.2,
        max_tokens=700,
        messages=[
            {"role": "system", "content": RAG_SYSTEM_PROMPT.format(disease=disease)},
            {"role": "user", "content": user_msg},
        ],
    )


# === Форматирование (как в app.py) ===

def build_context_block(hits: list) -> str:
    if not hits:
        return "(пусто — в базе знаний нет релевантных фрагментов)"
    parts = []
    for i, h in enumerate(hits, 1):
        # Нормализуем score (TF-IDF cosine * 50) к 0..100%.
        # На практике значения 0..2, поэтому *50 даёт 0..100.
        # Берём min(100) на случай если в индексе окажется выброс.
        score_pct = min(100, max(0, round(float(h.get("score", 0)) * 50, 1)))
        parts.append(
            f"[{i}] (релевантность {score_pct}%, "
            f'источник: {h.get("source", "?")}, стр. {h.get("page", "?")})\n'
            f"{h.get('text', '')}"
        )
    return "\n\n---\n\n".join(parts)


def build_products_block(products: list) -> str:
    if not products:
        return "(нет подходящих товаров)"
    parts = []
    for i, p in enumerate(products, 1):
        score_pct = min(100, max(0, round(float(p.get("score", 0)) * 50, 1)))
        if p.get("oldPrice"):
            price_str = f"цена: {p['price']} руб. (СКИДКА с {p['oldPrice']})"
        else:
            price_str = f"цена: {p['price']} руб."
        stock_str = "В НАЛИЧИИ" if p.get("inStock", True) else "НЕТ В НАЛИЧИИ"
        parts.append(
            f"[{i}] {p['name']} (id: {p['id']}, {price_str}, {stock_str}, "
            f"категория: {p.get('category', '?')}, релевантность {score_pct}%)\n"
        )
    return "\n\n".join(parts)


# === HTTP Handler ===

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Проверка ключа
            if not GROQ_API_KEY:
                self._send(500, {"error": "GROQ_API_KEY not configured"})
                return

            # Читаем тело
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8")
            try:
                data = json.loads(body)
            except json.JSONDecodeError as e:
                self._send(400, {"error": f"Invalid JSON: {e}"})
                return

            image_base64 = data.get("image_base64", "")
            plant_name = data.get("plant_name", "").strip() or "растение"
            user_note = data.get("user_note", "").strip()

            if not image_base64:
                self._send(400, {"error": "image_base64 is required"})
                return

            # 1) Vision — диагноз
            disease = call_vision(image_base64, plant_name, user_note)
            # Нормализуем: первая строка, обрезаем до 3 слов
            disease = disease.split("\n")[0].strip().lower()
            disease = re.sub(r"[^а-яёa-z\s]", "", disease)
            words = disease.split()[:3]
            disease = " ".join(words) if words else "неизвестная проблема"

            # 2) RAG-поиск по книгам (TF-IDF) — серверная часть
            # Запрос: диагноз + растение + заметка
            rag_query = f"{disease} {plant_name} {user_note}".strip()
            chunks = _load_index_or_empty('chunks.json')  # тексты чанков
            chunk_hits = _tfidf_search(rag_query, 'tfidf.json', top_k=3)
            rag_context = []
            for i, score in chunk_hits:
                if score <= 0:
                    continue
                c = chunks[i]
                rag_context.append({
                    "text": c.get("text", ""),
                    "source": c.get("source", "?"),
                    "page": c.get("page", "?"),
                    "score": float(score),
                })

            # 3) Рекомендации товаров (TF-IDF + бонусы)
            products = _load_index_or_empty('products.json')
            # Запрос для товаров: растение + диагноз
            product_query = f"{plant_name} {disease}".strip()
            is_healthy = disease in ("здоровое", "неизвестная проблема")
            product_hits = _tfidf_search(
                product_query, 'products_tfidf.json',
                top_k=3,
                category_bonus=("защита", 0.3) if not is_healthy else None,
                products_lookup=products,
                keyword_in_name_bonus=0.5 if not is_healthy else 0,
            )
            recommended = []
            for i, score in product_hits:
                if score <= 0:
                    continue
                p = products[i]
                recommended.append({
                    "id": p.get("id", ""),
                    "name": p.get("name", ""),
                    "category": p.get("category", "прочее"),
                    "price": p.get("price", 0),
                    "oldPrice": p.get("oldPrice"),
                    "inStock": p.get("inStock", True),
                    "url": p.get("url", ""),
                    "image": p.get("image", ""),
                    "score": float(score),
                })

            # 4) RAG-генерация
            context_block = build_context_block(rag_context)
            products_block = build_products_block(recommended)
            answer = call_rag(disease, plant_name, context_block, products_block)

            # Формируем sources для UI
            sources = [
                {
                    "score": h.get("score", 0),
                    "text": h.get("text", ""),
                    "source": h.get("source", "?"),
                    "page": h.get("page", "?"),
                }
                for h in rag_context
            ]

            self._send(200, {
                "disease": disease,
                "answer": answer,
                "sources": sources,
                "recommended_products": recommended,
            })

        except Exception as e:
            # Любую ошибку Groq/сети — в 502
            import traceback
            traceback.print_exc()
            self._send(502, {"error": str(e), "type": type(e).__name__})

    def do_GET(self):
        # Health-check
        if self.path == "/api/diagnose" or self.path == "/api/diagnose/":
            self._send(200, {"ok": True, "endpoint": "diagnose", "method": "POST"})
            return
        self._send(404, {"error": "not found"})

    def do_OPTIONS(self):
        # CORS preflight
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _send(self, code: int, body: dict):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        # Логи в Vercel (видны в Dashboard → Logs)
        import sys
        sys.stderr.write(f"[diagnose] {format % args}\n")
