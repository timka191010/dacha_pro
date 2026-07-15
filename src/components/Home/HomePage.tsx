import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { formatDateHuman, getSeasonPhrase, toDateKey } from '../../utils/date';
import { useCalendarEntries } from '../../hooks/useCalendarEntries';
import { staggerContainer, fadeUp } from '../../utils/motion';
import { WeatherWidget } from './WeatherWidget';
import { MyGardenWidget } from './MyGardenWidget';
import { NextTaskWidget } from './NextTaskWidget';
import { RecommendationWidget } from './RecommendationWidget';
import { LunarCard } from './LunarCard';
import { getGardenPlants, type GardenPlant } from '../../services/storage';
import styles from './HomePage.module.css';

/**
 * Главный экран = дашборд.
 *
 * Структура (сверху вниз):
 *   1. Header: приветствие, дата, сезон + кнопка ИИ в углу
 *   2. WeatherWidget: текущая погода + прогноз на 3 дня
 *   3. NextTaskWidget: ближайшая задача из календаря или сезонный совет
 *   4. MyGardenWidget: карусель растений пользователя
 *   5. RecommendationWidget: рекомендация месяца + 2 товара Органик Микс
 *   6. LunarCard: фаза луны
 */
export function HomePage() {
  const navigate = useNavigate();
  const { entries } = useCalendarEntries();
  const [scrolled, setScrolled] = useState(false);

  // Header sticky-режим: при скролле greeting сжимается, остаётся тонкая полоска
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Клик по растению в "Мой сад" → переход в ИИ-чат с предзаполненным контекстом
  const handleAskAboutPlant = (plant: GardenPlant) => {
    const garden = getGardenPlants()
      .filter((p) => p.enabled)
      .map((p) => p.name)
      .join(', ');
    const q = `У меня в саду: ${garden}. Расскажи про уход за ${plant.name.toLowerCase()} сейчас, в ${getSeasonPhrase()}.`;
    navigate('/ai', { state: { presetQuestion: q } });
  };

  // Клик по ближайшей задаче (AI-совет) → ИИ-чат с предзаполненным вопросом
  const handleAskAiFromTask = (question: string) => {
    navigate('/ai', { state: { presetQuestion: question } });
  };

  const today = toDateKey();
  const todayEntriesCount = entries.filter((e) => e.dateKey === today).length;

  return (
    <div className={styles.page}>
      <motion.header
        className={`${styles.header} ${scrolled ? styles.headerCompact : ''}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {!scrolled ? (
            <motion.div
              key="full"
              className={styles.headerFull}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <div className={styles.greeting}>
                <motion.span
                  className={styles.greetingWave}
                  animate={{ rotate: [0, 14, -8, 14, 0] }}
                  transition={{ duration: 1.2, delay: 0.3, repeat: Infinity, repeatDelay: 3 }}
                >
                  👋
                </motion.span>
                <h1 className={styles.title}>Привет, дачник!</h1>
              </div>
              <p className={styles.subtitle}>
                {formatDateHuman(new Date())} · {getSeasonPhrase()}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="compact"
              className={styles.headerCompactInner}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
            >
              <span className={styles.headerCompactDate}>
                {formatDateHuman(new Date())}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          className={styles.aiButton}
          onClick={() => navigate('/ai')}
          whileHover={{ y: -2, scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          title="Спросить ИИ-агронома"
          aria-label="Спросить ИИ-агронома"
        >
          <Sparkles size={20} strokeWidth={2} />
        </motion.button>
      </motion.header>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className={styles.content}
      >
        {/* Погода */}
        <motion.div variants={fadeUp}>
          <WeatherWidget />
        </motion.div>

        {/* Ближайшая задача или сезонный совет */}
        {todayEntriesCount === 0 && entries.length === 0 ? null : (
          <motion.div variants={fadeUp}>
            <NextTaskWidget onAskAi={handleAskAiFromTask} />
          </motion.div>
        )}

        {/* Мой сад */}
        <motion.div variants={fadeUp}>
          <MyGardenWidget onAskAboutPlant={handleAskAboutPlant} />
        </motion.div>

        {/* Рекомендация месяца + 2 товара */}
        <motion.div variants={fadeUp}>
          <RecommendationWidget />
        </motion.div>

        {/* Луна */}
        <motion.div variants={fadeUp}>
          <LunarCard onClick={() => navigate('/calendar')} />
        </motion.div>
      </motion.div>
    </div>
  );
}
