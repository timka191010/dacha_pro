import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Разрешаем все хосты — приложение в разработке, доступ нужно открыть
    // с телефона через локальную сеть (192.168.x.x) или туннель.
    allowedHosts: true,
    // === ИЗМЕНЕНО: убран proxy /api → 127.0.0.1:8001 ===
    // Бэкенд FastAPI больше не нужен.
    // В dev API вызовы идут на тот же origin (5173) — обрабатываются Vercel CLI
    // через `vercel dev` (поднимает Python-функцию локально).
    // В проде — Vercel Function /api/diagnose.
  },
});
