import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '../shared/Modal';
import { Spinner } from '../shared/Spinner';
import { getAdvice } from '../../services/ai';
import { getLunarPhase } from '../../utils/lunar';
import { formatDateHuman, getSeason, toDateKey } from '../../utils/date';
import { Send } from 'lucide-react';
import { fadeUp, staggerContainer } from '../../utils/motion';
import styles from './CalendarPage.module.css';

interface Props {
  date: Date;
  onClose: () => void;
}

const PRESETS = [
  'Что посадить в эту дату?',
  'Чем подкормить рассаду?',
  'Какие работы в огороде сейчас актуальны?',
  'Как защитить растения от жары?',
];

export function AiAdviceModal({ date, onClose }: Props) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(false);

  const lunar = getLunarPhase(date);

  const ask = async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setQuestion(q);
    setAnswer(null);
    setCached(false);

    const result = await getAdvice({
      date: toDateKey(date),
      dateHuman: formatDateHuman(date),
      season: getSeason(date),
      lunarPhase: lunar.name,
      question: q,
    });
    setAnswer(result.answer);
    setCached(result.cached);
    setLoading(false);
  };

  return (
    <Modal open onClose={onClose} title="Совет от ИИ">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div className={styles.aiContext} variants={fadeUp}>
          <span>📅 {formatDateHuman(date)}</span>
          <span>·</span>
          <span>{getSeason(date)}</span>
          <span>·</span>
          <span>{lunar.emoji} {lunar.name}</span>
        </motion.div>

        <motion.textarea
          className={styles.aiInput}
          placeholder="Задайте вопрос..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          disabled={loading}
          variants={fadeUp}
        />

        <motion.div variants={fadeUp} style={{ marginTop: 10 }}>
          <motion.button
            className={styles.aiBtn}
            onClick={() => ask(question)}
            disabled={!question.trim() || loading}
            whileHover={question.trim() && !loading ? { y: -2 } : undefined}
            whileTap={question.trim() && !loading ? { scale: 0.98 } : undefined}
            style={{ opacity: !question.trim() || loading ? 0.5 : 1 }}
          >
            <span className={styles.aiBtnText}>
              {loading ? <Spinner size={16} label="" /> : <Send size={18} />}
              {loading ? 'Думаю...' : 'Получить совет'}
            </span>
            <span className={styles.aiBtnHint}>{lunar.emoji}</span>
          </motion.button>
        </motion.div>

        <motion.div className={styles.presetList} variants={fadeUp}>
          {PRESETS.map((p) => (
            <motion.button
              key={p}
              className={styles.preset}
              onClick={() => ask(p)}
              disabled={loading}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.94 }}
            >
              {p}
            </motion.button>
          ))}
        </motion.div>

        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', justifyContent: 'center', padding: 24 }}
            >
              <Spinner size={32} label="Получаю совет..." />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {answer && !loading && (
            <motion.div
              className={styles.aiAnswer}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              <div className={styles.aiAnswerHeader}>
                <span>Ответ</span>
                {cached && <span className={styles.cachedTag}>из кэша</span>}
              </div>
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(answer) }} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Modal>
  );
}

function renderMarkdown(md: string): string {
  return md
    .split(/\n{2,}/)
    .map((para) => {
      let text = para
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (/^[•\-]\s+/.test(text.trim())) {
        const items = text
          .split('\n')
          .map((line) => line.replace(/^\s*[•\-]\s+/, '').trim())
          .filter(Boolean)
          .map((line) => {
            const formatted = line
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/(^|[\s(])_([^_]+)_/g, '$1<em>$2</em>');
            return `<li>${formatted}</li>`;
          })
          .join('');
        return `<ul>${items}</ul>`;
      }
      const formatted = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[\s(])_([^_]+)_/g, '$1<em>$2</em>')
        .replace(/\n/g, '<br/>');
      return `<p>${formatted}</p>`;
    })
    .join('');
}
