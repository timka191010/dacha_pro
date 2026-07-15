import { chat, isAiAvailable, type ChatMessage } from './aiProviders';
import { getAiCache, setAiCache } from './storage';
import { getFallbackAdvice } from '../data/fallbackAdvice';

export interface AiContext {
  date: string;
  dateHuman: string;
  season: string;
  lunarPhase: string;
  question: string;
}

export interface AiResult {
  answer: string;
  cached: boolean;
}

export { isAiAvailable };

/**
 * Получить совет от ИИ (Groq) с кэшированием.
 * Используется кнопкой «Совет от ИИ» в календаре.
 */
export async function getAdvice(ctx: AiContext): Promise<AiResult> {
  if (!isAiAvailable()) {
    const fallback = getFallbackAdvice(translateSeason(ctx.season), ctx.question);
    return {
      answer:
        '🤖 Ключ Groq не задан.\n\n' +
        'Откройте .env в корне проекта и замените VITE_GROQ_API_KEY на свой бесплатный ключ.\n' +
        'Получить: https://console.groq.com/ (почта → ключ мгновенно).\n\n' +
        'А пока — совет из локальной базы:\n\n' + fallback,
      cached: false,
    };
  }

  const cached = getAiCache(ctx.date, ctx.question);
  if (cached) return { answer: cached.answer, cached: true };

  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: [
        `Дата: ${ctx.dateHuman}`,
        `Сезон: ${ctx.season}`,
        `Фаза луны: ${ctx.lunarPhase}`,
        '',
        `Вопрос: ${ctx.question}`,
      ].join('\n'),
    },
  ];

  const result = await chat(messages, {
    onChunk: () => {},
    onDone: () => {},
    onError: () => {},
  });

  if (!result) {
    const fallback = getFallbackAdvice(translateSeason(ctx.season), ctx.question);
    return {
      answer: 'Не удалось получить ответ от ИИ. Локальный совет:\n\n' + fallback,
      cached: false,
    };
  }
  const fullText = result.text;
  if (!fullText.trim()) {
    const fallback = getFallbackAdvice(translateSeason(ctx.season), ctx.question);
    return { answer: 'ИИ вернул пустой ответ. Локальный совет:\n\n' + fallback, cached: false };
  }

  setAiCache({
    dateKey: ctx.date,
    question: ctx.question,
    answer: fullText,
    createdAt: Date.now(),
  });

  return { answer: fullText, cached: false };
}

function translateSeason(s: string): 'весна' | 'лето' | 'осень' | 'зима' {
  if (s === 'весна' || s === 'лето' || s === 'осень' || s === 'зима') return s;
  return 'лето';
}
