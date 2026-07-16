"""
Vercel Serverless Function: /api/diagnose

Заменяет FastAPI эндпоинт /api/diagnose из старого backend/app.py.
Принимает готовый RAG-контекст от клиента (собран локально через Transformers.js),
делает два запроса в Groq:
  1) Vision (llama-4-scout) — диагноз по фото
  2) Text  (llama-3.1-8b-instant) — финальный ответ по контексту
Возвращает JSON.

Зачем прокси:
- GROQ_API_KEY хранится в env Vercel, не в браузере.
- CORS на Vercel Function: тот же origin, проблем нет.
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import re

# === Конфигурация (env) ===
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE = "https://api.groq.com/openai/v1"
VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
TEXT_MODEL = "llama-3.1-8b-instant"

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
        score_pct = round(h.get("score", 0) * 100, 1)
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
        score_pct = round(p.get("score", 0) * 100, 1)
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
            rag_context = data.get("rag_context", [])  # top-3 чанка
            products = data.get("products", [])        # top-3 товара

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

            # 2) RAG-генерация
            context_block = build_context_block(rag_context)
            products_block = build_products_block(products)
            answer = call_rag(disease, plant_name, context_block, products_block)

            # Формируем sources для UI (используем rag_context, который прислал клиент)
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
                "recommended_products": products,
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
