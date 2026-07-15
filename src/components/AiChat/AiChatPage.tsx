import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Send,
  Square,
  Trash2,
  Bot,
  User as UserIcon,
  Lightbulb,
  AlertCircle,
} from 'lucide-react';
import { chat, isAiAvailable, type ChatMessage } from '../../services/aiProviders';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { Spinner } from '../shared/Spinner';
import { EmptyState } from '../shared/EmptyState';
import { fadeUp } from '../../utils/motion';
import styles from './AiChatPage.module.css';

const SUGGESTIONS = [
  'Что посадить в июле?',
  'Чем подкормить томаты во время цветения?',
  'Как бороться с тлёй без химии?',
  'Когда обрезать малину?',
  'Что делать, если желтеют листья огурцов?',
  'Как подготовить теплицу к зиме?',
];

const MAX_MESSAGES = 50;

export function AiChatPage() {
  const [history, setHistory] = useLocalStorage<ChatMessage[]>('dp:ai:chat', []);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  const available = isAiAvailable();
  const location = useLocation();

  // Если пришли с предустановленным вопросом (из виджета "Мой сад" и т.п.),
  // подставляем его в поле ввода.
  useEffect(() => {
    const state = location.state as { presetQuestion?: string } | null;
    if (state?.presetQuestion) {
      setInput(state.presetQuestion);
    }
  }, [location.state]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, currentAnswer]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setError(null);
    setInput('');

    const newUserMsg: ChatMessage = { role: 'user', content: trimmed };
    const newHistory = [...history, newUserMsg].slice(-MAX_MESSAGES);
    setHistory(newHistory);
    setCurrentAnswer('');
    setStreaming(true);
    abortRef.current = false;

    const contextMessages = newHistory.slice(-20);

    let buffer = '';
    const result = await chat(contextMessages, {
      onChunk: (chunk) => {
        if (abortRef.current) return;
        buffer += chunk;
        setCurrentAnswer(buffer);
      },
      onDone: () => {},
      onError: (err) => {
        const status = (err as { status?: number })?.status;
        setError(
          status === 401
            ? '🔑 Ключ Groq недействителен. Проверьте VITE_GROQ_API_KEY в .env.'
            : status === 429
              ? '⏱ Превышен лимит запросов. Подождите минуту.'
              : `Ошибка: ${err.message}`
        );
      },
    });

    setStreaming(false);
    if (result && result.text) {
      setHistory((prev) =>
        [...prev, { role: 'assistant' as const, content: result.text }].slice(-MAX_MESSAGES)
      );
      setCurrentAnswer('');
    }
  };

  const stop = () => {
    abortRef.current = true;
    setStreaming(false);
    if (currentAnswer.trim()) {
      setHistory((prev) =>
        [...prev, { role: 'assistant' as const, content: currentAnswer + ' _(остановлено)_' }].slice(-MAX_MESSAGES)
      );
    }
    setCurrentAnswer('');
  };

  const clear = () => {
    if (history.length === 0) return;
    if (!confirm('Очистить историю чата?')) return;
    setHistory([]);
    setCurrentAnswer('');
    setError(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className={styles.page}>
      <motion.header
        className={styles.header}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className={styles.titleRow}>
          <h1 className={styles.title}>
            <motion.span
              animate={{ rotate: [0, 12, -8, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
              style={{ display: 'inline-block', marginRight: 8 }}
            >
              🤖
            </motion.span>
            ИИ Агроном
          </h1>
          <span
            className={`${styles.groqBadge} ${available ? styles.groqBadgeOk : styles.groqBadgeOff}`}
            title={available ? 'Groq llama-3.1-8b-instant · бесплатно' : 'Ключ Groq не задан'}
          >
            <Sparkles size={11} />
            Groq FREE
          </span>
        </div>
        <p className={styles.subtitle}>
          Чат с искусственным интеллектом о даче и огороде
        </p>
        {history.length > 0 && (
          <motion.button
            className={styles.clearBtn}
            onClick={clear}
            type="button"
            whileTap={{ scale: 0.92 }}
          >
            <Trash2 size={14} /> Очистить
          </motion.button>
        )}
      </motion.header>

      <div className={styles.chat} ref={scrollRef}>
        {history.length === 0 && !currentAnswer ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <EmptyState
              icon="🤖"
              title="Задайте вопрос ИИ-агроному"
              description="Например: когда обрезать малину, чем подкормить томаты, как бороться с тлей."
            />
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {history.map((m, i) => (
              <MessageBubble key={`${i}-${m.role}`} role={m.role} content={m.content} />
            ))}
          </AnimatePresence>
        )}
        <AnimatePresence>
          {currentAnswer && (
            <MessageBubble role="assistant" content={currentAnswer} streaming />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {error && (
            <motion.div
              className={styles.errorBox}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <AlertCircle size={16} />
              <div className={styles.errorText}>{error}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {history.length === 0 && !streaming && (
        <motion.div
          className={styles.suggestions}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {SUGGESTIONS.map((s) => (
            <motion.button
              key={s}
              className={styles.suggestion}
              onClick={() => send(s)}
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.94 }}
            >
              <Lightbulb size={12} /> {s}
            </motion.button>
          ))}
        </motion.div>
      )}

      <form className={styles.composer} onSubmit={handleSubmit}>
        <textarea
          className={styles.textarea}
          placeholder={available ? 'Спросите что-нибудь...' : 'Задайте ключ Groq в .env, чтобы начать'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
          rows={2}
          disabled={streaming}
        />
        {streaming ? (
          <motion.button
            type="button"
            className={`${styles.sendBtn} ${styles.stopBtn}`}
            onClick={stop}
            aria-label="Остановить"
            whileTap={{ scale: 0.85 }}
            whileHover={{ scale: 1.05 }}
          >
            <Square size={16} fill="currentColor" />
          </motion.button>
        ) : (
          <motion.button
            type="submit"
            className={styles.sendBtn}
            disabled={!input.trim()}
            aria-label="Отправить"
            whileTap={input.trim() ? { scale: 0.85 } : undefined}
            whileHover={input.trim() ? { scale: 1.05 } : undefined}
          >
            <Send size={18} />
          </motion.button>
        )}
      </form>

      {streaming && (
        <motion.div
          className={styles.streamingHint}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Spinner size={14} label="Groq думает..." />
        </motion.div>
      )}
    </div>
  );
}

function MessageBubble({
  role,
  content,
  streaming,
}: {
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
}) {
  if (role === 'system') return null;
  const isUser = role === 'user';

  return (
    <motion.div
      className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAi}`}
      variants={fadeUp}
      initial="hidden"
      animate="show"
      layout
    >
      <div className={styles.bubbleLabel}>
        {isUser ? <UserIcon size={12} /> : <Bot size={12} />}
        {isUser ? 'Вы' : 'Агроном'}
        {streaming && (
          <motion.span
            className={styles.streamingDot}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            ●
          </motion.span>
        )}
      </div>
      <div
        className={styles.bubbleContent}
        dangerouslySetInnerHTML={{ __html: renderMd(content) }}
      />
    </motion.div>
  );
}

function renderMd(md: string): string {
  return md
    .split(/\n{2,}/)
    .map((para) => {
      let text = para
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (/^[•\-\*]\s+/.test(text.trim())) {
        const items = text
          .split('\n')
          .map((line) => line.replace(/^\s*[•\-\*]\s+/, '').trim())
          .filter(Boolean)
          .map((line) => {
            const f = line
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/(^|[\s(])_([^_]+)_/g, '$1<em>$2</em>');
            return `<li>${f}</li>`;
          })
          .join('');
        return `<ul>${items}</ul>`;
      }
      const f = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[\s(])_([^_]+)_/g, '$1<em>$2</em>')
        .replace(/\n/g, '<br/>');
      return `<p>${f}</p>`;
    })
    .join('');
}
