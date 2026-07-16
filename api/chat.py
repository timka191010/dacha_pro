"""
Vercel Serverless Function: /api/chat

Прокси для стримингового чата с Groq (llama-3.1-8b-instant).
Заменяет прямой вызов из браузера — GROQ_API_KEY хранится в env Vercel.

Поддерживает streaming (Server-Sent Events), чтобы UI мог показывать
ответ посимвольно как раньше.
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.request

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE = "https://api.groq.com/openai/v1"
TEXT_MODEL = "llama-3.1-8b-instant"

SYSTEM_PROMPT = """Ты — опытный агроном-консультант для дачников и огородников средней полосы России.
Даёшь практичные, конкретные советы по уходу за растениями.
Стиль: дружелюбный, без воды, по делу. Короткие абзацы и маркированные списки.
Не выдумывай конкретных марок, если не уверен. Учитывай, что пользователь — любитель, а не агроном-профессионал.
Отвечай на языке пользователя (по умолчанию — русский)."""


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not GROQ_API_KEY:
            self._send(500, {"error": "GROQ_API_KEY not configured"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8")
            data = json.loads(body)
        except (json.JSONDecodeError, ValueError) as e:
            self._send(400, {"error": f"Invalid request: {e}"})
            return

        # messages: [{role, content}, ...]
        messages = data.get("messages", [])
        if not messages:
            self._send(400, {"error": "messages is required"})
            return

        # Добавляем system-промпт (если его нет)
        if not messages or messages[0].get("role") != "system":
            messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

        # Стримим ответ через SSE (text/event-stream)
        # Vercel Python runtime: пишем ответ чанками, отправляя каждую дельту
        # как SSE-фрейм "data: {text}\n\n". Клиент парсит EventSource.
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            req = urllib.request.Request(
                f"{GROQ_BASE}/chat/completions",
                data=json.dumps({
                    "model": TEXT_MODEL,
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 1000,
                    "stream": True,
                }).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )

            with urllib.request.urlopen(req, timeout=60) as resp:
                for line in resp:
                    line = line.decode("utf-8").strip()
                    if not line:
                        continue
                    # Groq шлёт строки вида "data: {...}" или "data: [DONE]"
                    if line.startswith("data: "):
                        payload = line[6:]
                        if payload == "[DONE]":
                            self.wfile.write(b"data: [DONE]\n\n")
                            self.wfile.flush()
                            break
                        try:
                            obj = json.loads(payload)
                            delta = obj.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if delta:
                                # Отдаём клиенту: "data: {delta}\n\n"
                                # Используем JSON-кодирование чтобы переносы строк
                                # и спецсимволы не ломали SSE
                                sse_data = json.dumps({"text": delta}, ensure_ascii=False)
                                self.wfile.write(f"data: {sse_data}\n\n".encode("utf-8"))
                                self.wfile.flush()
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            # В стриме уже отправлены headers — закрываем с ошибкой
            import traceback
            traceback.print_exc()
            try:
                sse_data = json.dumps({"error": str(e)}, ensure_ascii=False)
                self.wfile.write(f"data: {sse_data}\n\n".encode("utf-8"))
                self.wfile.flush()
            except Exception:
                pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        # Health-check
        if self.path == "/api/chat" or self.path == "/api/chat/":
            self._send(200, {"ok": True, "endpoint": "chat", "method": "POST"})
            return
        self._send(404, {"error": "not found"})

    def _send(self, code: int, body: dict):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        import sys
        sys.stderr.write(f"[chat] {format % args}\n")
