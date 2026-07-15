import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { addMonths, formatMonthLabel, toDateKey } from '../../utils/date';
import { CalendarGrid } from './CalendarGrid';
import { DayDetail } from './DayDetail';
import { AiAdviceModal } from './AiAdviceModal';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { fadeUp, staggerContainer } from '../../utils/motion';
import styles from './CalendarPage.module.css';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function CalendarPage() {
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [aiModalDate, setAiModalDate] = useState<Date | null>(null);

  return (
    <div className={styles.page}>
      <motion.header
        className={styles.header}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className={styles.title}>Календарь</h1>
        <p className={styles.subtitle}>
          Записи · ИИ-советы · рекомендации Органик Микс
        </p>
      </motion.header>

      <motion.div
        className={styles.controls}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03, duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.button
          className={styles.navBtn}
          onClick={() => setMonthDate(addMonths(monthDate, -1))}
          whileTap={{ scale: 0.85 }}
        >
          <ChevronLeft size={20} />
        </motion.button>
        <AnimatePresence mode="wait">
          <motion.h2
            key={monthDate.toISOString()}
            className={styles.monthLabel}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {formatMonthLabel(monthDate)}
          </motion.h2>
        </AnimatePresence>
        <motion.button
          className={styles.navBtn}
          onClick={() => setMonthDate(addMonths(monthDate, 1))}
          whileTap={{ scale: 0.85 }}
        >
          <ChevronRight size={20} />
        </motion.button>
      </motion.div>

      <motion.div
        className={styles.weekdays}
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {WEEKDAYS.map((w, i) => (
          <motion.div
            key={w}
            className={`${styles.weekday} ${(i === 5 || i === 6) ? styles.weekend : ''}`}
            variants={fadeUp}
          >
            {w}
          </motion.div>
        ))}
      </motion.div>

      <CalendarGrid
        monthDate={monthDate}
        onSelect={setSelectedDate}
        selectedDate={selectedDate}
      />

      <motion.div
        className={styles.aiShortcut}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.button
          className={styles.aiBtn}
          onClick={() => setAiModalDate(new Date())}
          whileHover={{ y: -2, boxShadow: '0 12px 40px rgba(31, 107, 58, 0.3)' }}
          whileTap={{ scale: 0.98 }}
        >
          <span className={styles.aiBtnText}>
            <Sparkles size={18} />
            Совет от ИИ на сегодня
          </span>
          <span className={styles.aiBtnHint}>{toDateKey()}</span>
        </motion.button>
      </motion.div>

      {selectedDate && (
        <DayDetail
          date={selectedDate}
          onClose={() => setSelectedDate(null)}
          onAskAi={() => {
            const d = selectedDate;
            setSelectedDate(null);
            setTimeout(() => setAiModalDate(d), 200);
          }}
        />
      )}

      {aiModalDate && (
        <AiAdviceModal
          date={aiModalDate}
          onClose={() => setAiModalDate(null)}
        />
      )}
    </div>
  );
}
