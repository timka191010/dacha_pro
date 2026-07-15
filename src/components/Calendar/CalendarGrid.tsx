import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  getMonthGrid,
  isSameDay,
  sameMonth,
  toDateKey,
} from '../../utils/date';
import { getRecommendationsForMonth } from '../../data/recommendations';
import { useCalendarEntries } from '../../hooks/useCalendarEntries';
import { staggerContainer, fadeUp } from '../../utils/motion';
import styles from './CalendarPage.module.css';

interface Props {
  monthDate: Date;
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
}

export function CalendarGrid({ monthDate, selectedDate, onSelect }: Props) {
  const { entries } = useCalendarEntries();

  const days = useMemo(
    () => getMonthGrid(monthDate.getFullYear(), monthDate.getMonth()),
    [monthDate]
  );

  const entryDates = useMemo(() => new Set(entries.map((e) => e.dateKey)), [entries]);
  const recoDates = useMemo(() => {
    const set = new Set<string>();
    const recos = getRecommendationsForMonth(monthDate.getMonth() + 1);
    if (recos.length > 0) {
      for (let d = 1; d <= 31; d++) {
        const day = new Date(monthDate.getFullYear(), monthDate.getMonth(), d);
        if (day.getMonth() !== monthDate.getMonth()) break;
        set.add(toDateKey(day));
      }
    }
    return set;
  }, [monthDate]);

  const today = new Date();

  return (
    <motion.div
      className={styles.grid}
      key={monthDate.getFullYear() + '-' + monthDate.getMonth()}
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {days.map((d) => {
        const isOutside = !sameMonth(d, monthDate);
        const isToday = isSameDay(d, today);
        const isSelected = selectedDate ? isSameDay(d, selectedDate) : false;
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const key = toDateKey(d);
        const hasEntry = entryDates.has(key);
        const hasReco = recoDates.has(key);

        const cls = [
          styles.cell,
          isOutside ? styles.outside : '',
          isToday ? styles.today : '',
          isSelected ? styles.selected : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <motion.button
            key={key}
            className={cls}
            onClick={isOutside ? undefined : () => onSelect(d)}
            disabled={isOutside}
            variants={fadeUp}
            whileHover={!isSelected && !isOutside ? { y: -2, scale: 1.05 } : undefined}
            whileTap={!isOutside ? { scale: 0.92 } : undefined}
            transition={{ type: 'spring', stiffness: 480, damping: 26 }}
            style={{ color: isSelected ? undefined : isWeekend ? 'var(--color-accent)' : undefined }}
          >
            <span className={styles.dayNum}>{d.getDate()}</span>
            {!isOutside && (
              <div className={styles.dots}>
                {hasEntry && <span className={`${styles.dot} ${styles.dotEntry}`} />}
                {hasReco && <span className={`${styles.dot} ${styles.dotReco}`} />}
              </div>
            )}
          </motion.button>
        );
      })}
    </motion.div>
  );
}
