import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import { Home, CalendarDays, Sparkles, ShoppingBag, BookOpen } from 'lucide-react';
import styles from './TabBar.module.css';

type Tab = {
  to: string;
  label: string;
  Icon: ComponentType<LucideProps>;
  end?: boolean;
};

const TABS: Tab[] = [
  { to: '/', label: 'Главное', Icon: Home, end: true },
  { to: '/calendar', label: 'Календарь', Icon: CalendarDays },
  { to: '/ai', label: 'ИИ', Icon: Sparkles },
  { to: '/showcase', label: 'Витрина', Icon: ShoppingBag },
  { to: '/articles', label: 'Статьи', Icon: BookOpen },
];

const INDICATOR_ID = 'tabbar-indicator';

export function TabBar() {
  return (
    <nav className={styles.tabbar} aria-label="Главная навигация">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={styles.tab}
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId={INDICATOR_ID}
                  className={styles.indicator}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <motion.span
                className={styles.iconWrap}
                whileTap={{ scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              >
                <t.Icon
                  size={22}
                  strokeWidth={isActive ? 2.4 : 1.8}
                  className={isActive ? styles.iconActive : styles.icon}
                />
              </motion.span>
              <span className={`${styles.label} ${isActive ? styles.labelActive : ''}`}>
                {t.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
