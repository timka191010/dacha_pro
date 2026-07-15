import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CalendarCheck, ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCalendarEntries } from '../../hooks/useCalendarEntries';
import { toDateKey, formatShortDay, addDays } from '../../utils/date';
import { getRecommendationsForMonth } from '../../data/recommendations';
import { fadeUp } from '../../utils/motion';
import styles from './HomePage.module.css';

interface Props {
  onAskAi: (question: string) => void;
}

/**
 * Виджет "Ближайшая задача":
 *  1) если есть запись в календаре на сегодня/завтра/ближайшие дни — показывает её
 *  2) иначе — общая рекомендация по сезону из data/recommendations
 */
export function NextTaskWidget({ onAskAi }: Props) {
  const navigate = useNavigate();
  const { entries } = useCalendarEntries();

  const next = useMemo(() => {
    const today = toDateKey();
    const sorted = [...entries].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    return sorted.find((e) => e.dateKey >= today) ?? null;
  }, [entries]);

  // Рекомендация по сезону — fallback
  const reco = useMemo(() => {
    const month = new Date().getMonth() + 1;
    const recs = getRecommendationsForMonth(month);
    if (recs.length === 0) return null;
    // Берём первую рекомендацию с текстом reason
    return recs[0];
  }, []);

  if (next) {
    const dt = new Date(next.dateKey);
    const isToday = next.dateKey === toDateKey();
    const isTomorrow = next.dateKey === toDateKey(addDays(new Date(), 1));
    const when = isToday ? 'Сегодня' : isTomorrow ? 'Завтра' : formatShortDay(dt);

    return (
      <motion.button
        className={styles.nextTaskCard}
        onClick={() => navigate('/calendar')}
        variants={fadeUp}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 24 }}
      >
        <div className={styles.nextTaskIcon}>
          <CalendarCheck size={20} strokeWidth={2} />
        </div>
        <div className={styles.nextTaskBody}>
          <div className={styles.nextTaskLabel}>{when}</div>
          <div className={styles.nextTaskText}>{next.text}</div>
        </div>
        <ArrowRight size={18} className={styles.nextTaskArrow} />
      </motion.button>
    );
  }

  if (reco) {
    return (
      <motion.button
        className={styles.nextTaskCard}
        onClick={() =>
          onAskAi(`Дай короткий совет по теме: ${reco.reason}`)
        }
        variants={fadeUp}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 24 }}
      >
        <div className={`${styles.nextTaskIcon} ${styles.nextTaskIconGold}`}>
          <Sparkles size={20} strokeWidth={2} />
        </div>
        <div className={styles.nextTaskBody}>
          <div className={styles.nextTaskLabel}>Совет по сезону</div>
          <div className={styles.nextTaskText}>{reco.reason}</div>
        </div>
        <ArrowRight size={18} className={styles.nextTaskArrow} />
      </motion.button>
    );
  }

  return null;
}
