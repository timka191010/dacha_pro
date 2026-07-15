import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Plus, Check, ArrowRight } from 'lucide-react';
import {
  getGardenPlants,
  toggleGardenPlant,
  getUserPlants,
  type GardenPlant,
} from '../../services/storage';
import { fadeUp, staggerContainer } from '../../utils/motion';
import { AddPlantModal } from '../Garden/AddPlantModal';
import styles from './HomePage.module.css';

interface Props {
  onAskAboutPlant: (plant: GardenPlant) => void;
}

/**
 * Hero-секция "Мой сад" на главной.
 *
 * Карусель растений с кнопкой "+" в конце для быстрого добавления.
 * Под каруселью — кнопка "Открыть сад" → /garden.
 *
 * Без таба в TabBar — пользователь сказал "не делай кнопку снизу".
 */
export function MyGardenWidget({ onAskAboutPlant }: Props) {
  const navigate = useNavigate();
  const [plants, setPlants] = useState<GardenPlant[]>(() => getGardenPlants());
  const [userCount, setUserCount] = useState(() => getUserPlants().length);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const onFocus = () => {
      setPlants(getGardenPlants());
      setUserCount(getUserPlants().length);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const handleToggle = (id: string) => {
    toggleGardenPlant(id);
    setPlants(getGardenPlants());
  };

  const total = plants.length + userCount;
  const enabledCount = plants.filter((p) => p.enabled).length + userCount;

  return (
    <motion.section
      className={styles.gardenCard}
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Мой сад</h2>
        <span className={styles.gardenCount}>
          {enabledCount} активн.
        </span>
      </div>

      <div className={styles.gardenScroll}>
        {plants.map((p) => (
          <motion.div
            key={p.id}
            className={`${styles.gardenItem} ${!p.enabled ? styles.gardenItemOff : ''}`}
            variants={fadeUp}
          >
            <button
              className={styles.gardenIconBtn}
              onClick={() => onAskAboutPlant(p)}
              disabled={!p.enabled}
              title={p.enabled ? `Спросить ИИ про ${p.name.toLowerCase()}` : p.name}
            >
              <span className={styles.gardenEmoji}>{p.emoji}</span>
              <span className={styles.gardenName}>{p.name}</span>
            </button>
            <button
              className={styles.gardenToggle}
              onClick={() => handleToggle(p.id)}
              title={p.enabled ? 'Убрать из сада' : 'Добавить в сад'}
              aria-label={p.enabled ? `Убрать ${p.name} из сада` : `Добавить ${p.name} в сад`}
            >
              {p.enabled ? <Check size={14} /> : <Plus size={14} />}
            </button>
          </motion.div>
        ))}

        {/* Кнопка "Добавить" внутри карусели */}
        <motion.div className={styles.gardenItem} variants={fadeUp}>
          <button
            className={styles.gardenIconBtn}
            onClick={() => setAddOpen(true)}
            title="Добавить растение"
            style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
          >
            <Plus size={28} className={styles.gardenAddIcon} />
            <span className={styles.gardenName} style={{ color: 'var(--color-text-muted)' }}>
              Своё
            </span>
          </button>
        </motion.div>
      </div>

      <motion.button
        className={styles.gardenOpenBtn}
        onClick={() => navigate('/garden')}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      >
        <span>
          🌱 Открыть сад
          {total > 0 && <span className={styles.gardenOpenBtnCount}> · {total}</span>}
        </span>
        <ArrowRight size={16} />
      </motion.button>

      {addOpen && (
        <AddPlantModal
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setUserCount(getUserPlants().length);
          }}
        />
      )}
    </motion.section>
  );
}
