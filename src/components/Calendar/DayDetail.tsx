import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '../shared/Modal';
import { getLunarPhase } from '../../utils/lunar';
import { toDateKey, formatShortDay } from '../../utils/date';
import { useCalendarEntries } from '../../hooks/useCalendarEntries';
import { ProductRecommendations } from './ProductRecommendations';
import { staggerContainer, fadeUp } from '../../utils/motion';
import { Sparkles, Plus } from 'lucide-react';
import styles from './CalendarPage.module.css';

interface Props {
  date: Date;
  onClose: () => void;
  onAskAi: () => void;
}

export function DayDetail({ date, onClose, onAskAi }: Props) {
  const { entries, addEntry, removeEntry } = useCalendarEntries();
  const dateKey = toDateKey(date);
  const dayEntries = entries
    .filter((e) => e.dateKey === dateKey)
    .sort((a, b) => b.createdAt - a.createdAt);

  const [text, setText] = useState('');
  const lunar = getLunarPhase(date);

  const handleAdd = () => {
    if (text.trim()) {
      addEntry(dateKey, text);
      setText('');
    }
  };

  return (
    <Modal open onClose={onClose} title={formatShortDay(date)}>
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div className={styles.detailMeta} variants={fadeUp}>
          <div className={styles.lunarRow}>
            <span className={styles.lunarEmoji}>{lunar.emoji}</span>
            <span>
              <strong>{lunar.name}</strong> · {lunar.brief}
            </span>
          </div>
          <motion.button
            onClick={onAskAi}
            className={styles.aiBtn}
            whileHover={{ y: -2, boxShadow: '0 12px 40px rgba(31, 107, 58, 0.3)' }}
            whileTap={{ scale: 0.98 }}
          >
            <span className={styles.aiBtnText}>
              <Sparkles size={18} />
              Совет от ИИ на эту дату
            </span>
          </motion.button>
        </motion.div>

        <motion.div className={styles.entriesSection} variants={fadeUp}>
          <h3 className={styles.entriesTitle}>
            Мои записи {dayEntries.length > 0 && `(${dayEntries.length})`}
          </h3>
          <AnimatePresence>
            {dayEntries.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>
                Записей пока нет. Добавьте первую ниже.
              </p>
            ) : (
              <motion.ul
                className={styles.entryList}
                variants={staggerContainer}
                initial="hidden"
                animate="show"
              >
                <AnimatePresence>
                  {dayEntries.map((e) => (
                    <motion.li
                      key={e.id}
                      className={styles.entry}
                      variants={fadeUp}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20, height: 0 }}
                      layout
                    >
                      <span className={styles.entryText}>{e.text}</span>
                      <button
                        className={styles.entryDelete}
                        onClick={() => removeEntry(e.id)}
                        aria-label="Удалить"
                      >
                        ×
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </AnimatePresence>

          <div className={styles.entryForm}>
            <textarea
              className={styles.entryInput}
              placeholder="Что нужно сделать?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
            />
            <div className={styles.entryFormActions}>
              <motion.button
                onClick={handleAdd}
                disabled={!text.trim()}
                whileTap={{ scale: 0.94 }}
                style={{
                  background: 'var(--color-primary)',
                  color: '#fff',
                  borderRadius: 12,
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: text.trim() ? 1 : 0.5,
                  cursor: text.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                <Plus size={16} /> Добавить
              </motion.button>
            </div>
          </div>
        </motion.div>

        <ProductRecommendations date={date} />
      </motion.div>
    </Modal>
  );
}
