import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Camera, ArrowLeft, Sprout, Sparkles, Carrot, Flower2 } from 'lucide-react';
import {
  GARDEN_PLANT_CATALOG,
  getUserPlants,
  getDiagnoses,
  getGardenPlants,
} from '../../services/storage';
import type { UserPlant, Diagnosis, PlantCategory } from '../../types';
import { staggerContainer, fadeUp } from '../../utils/motion';
import { AddPlantModal } from './AddPlantModal';
import { PlantDetailModal } from './PlantDetailModal';
import { PhotoDiagnoseModal } from './PhotoDiagnoseModal';
import { products } from '../../data/products';
import styles from './GardenPage.module.css';

type AnyPlant =
  | { kind: 'preset'; data: (typeof GARDEN_PLANT_CATALOG)[number]; enabled: boolean }
  | { kind: 'user'; data: UserPlant };

/**
 * Страница «Мой сад» — отдельный роут /garden.
 * Доступ без таба снизу — через карусель на главной.
 *
 * Внутри две вкладки: «Огород» и «Сад». Пресеты разнесены по категориям
 * в GARDEN_PLANT_CATALOG; пользовательские растения получают категорию
 * в момент добавления через AddPlantModal.
 */
export function GardenPage() {
  const navigate = useNavigate();
  const [userPlants, setUserPlants] = useState<UserPlant[]>(() => getUserPlants());
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const p of getGardenPlants()) m[p.id] = p.enabled;
    return m;
  });
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>(() => getDiagnoses());

  const [addOpen, setAddOpen] = useState(false);
  const [detailPlant, setDetailPlant] = useState<AnyPlant | null>(null);
  const [diagnoseTarget, setDiagnoseTarget] = useState<{
    plantId: string;
    plantName: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<PlantCategory>('огород');

  // Синхронизация при фокусе
  useEffect(() => {
    const onFocus = () => {
      setUserPlants(getUserPlants());
      setDiagnoses(getDiagnoses());
      const m: Record<string, boolean> = {};
      for (const p of getGardenPlants()) m[p.id] = p.enabled;
      setEnabledMap(m);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Собираем все растения: предустановленные + пользовательские
  const allPlants: AnyPlant[] = useMemo(() => {
    const presets: AnyPlant[] = GARDEN_PLANT_CATALOG.map((p) => ({
      kind: 'preset' as const,
      data: p,
      enabled: enabledMap[p.id] ?? true,
    }));
    const custom: AnyPlant[] = userPlants.map((p) => ({
      kind: 'user' as const,
      data: p,
    }));
    return [...presets, ...custom];
  }, [userPlants, enabledMap]);

  // Считаем количество в каждой категории (с учётом toggle пресетов)
  const counts = useMemo(() => {
    const acc: Record<PlantCategory, number> = { огород: 0, сад: 0 };
    for (const p of allPlants) {
      if (p.kind === 'preset' && !p.enabled) continue;
      acc[p.data.category] += 1;
    }
    return acc;
  }, [allPlants]);

  // Дефолтный таб — какой больше (при равном — огород)
  useEffect(() => {
    if (counts.огород >= counts.сад) {
      setActiveTab('огород');
    } else {
      setActiveTab('сад');
    }
  }, [counts.огород, counts.сад]);

  // Растения для текущей вкладки
  const visiblePlants = useMemo(
    () => allPlants.filter((p) => p.data.category === activeTab),
    [allPlants, activeTab],
  );

  // Считаем диагностики по каждому растению
  const diagnosesByPlant = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of diagnoses) {
      map[d.plantId] = (map[d.plantId] ?? 0) + 1;
    }
    return map;
  }, [diagnoses]);

  const handleDiagnoseClick = (e: React.MouseEvent, plant: AnyPlant) => {
    e.stopPropagation();
    const id = plant.data.id;
    const name = plant.data.name;
    setDiagnoseTarget({ plantId: id, plantName: name });
  };

  const handlePlantAdded = () => {
    setUserPlants(getUserPlants());
  };

  const handleDiagnosisSaved = () => {
    setDiagnoses(getDiagnoses());
  };

  const productList = products.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className={styles.page}>
      <motion.header
        className={styles.header}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <button
          className={styles.backBtn}
          onClick={() => navigate('/')}
          aria-label="Назад"
        >
          <ArrowLeft size={22} />
        </button>
        <div className={styles.headerCenter}>
          <h1 className={styles.title}>
            <Sprout size={22} /> Мой сад
          </h1>
          <p className={styles.subtitle}>
            {allPlants.length} {pluralPlants(allPlants.length)} · {diagnoses.length} диагностик
          </p>
        </div>
        <button
          className={styles.addBtn}
          onClick={() => setAddOpen(true)}
          aria-label="Добавить растение"
        >
          <Plus size={20} />
        </button>
      </motion.header>

      <motion.div
        className={styles.howItWorks}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <div className={styles.howItWorksIcon}>
          <Camera size={18} />
        </div>
        <div>
          <div className={styles.howItWorksTitle}>Фото-ассистент по болезням</div>
          <div className={styles.howItWorksText}>
            Сфоткайте больное растение — ИИ поставит диагноз и подскажет, какой продукт
            Органик Микс поможет.
          </div>
        </div>
      </motion.div>

      {/* === Табы Огород / Сад === */}
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'огород'}
          className={`${styles.tab} ${
            activeTab === 'огород' ? `${styles.tabActive} ${styles.tabActiveOgorod}` : ''
          }`}
          onClick={() => setActiveTab('огород')}
        >
          <Carrot size={16} />
          <span>Огород</span>
          <span className={styles.tabCount}>{counts.огород}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'сад'}
          className={`${styles.tab} ${
            activeTab === 'сад' ? `${styles.tabActive} ${styles.tabActiveSad}` : ''
          }`}
          onClick={() => setActiveTab('сад')}
        >
          <Flower2 size={16} />
          <span>Сад</span>
          <span className={styles.tabCount}>{counts.сад}</span>
        </button>
      </div>

      <motion.div
        className={styles.grid}
        key={activeTab}
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {visiblePlants.map((plant) => {
          const id = plant.data.id;
          const photoCount = diagnosesByPlant[id] ?? 0;
          const isOff = plant.kind === 'preset' && !plant.enabled;
          return (
            <motion.button
              key={id}
              className={`${styles.plantCard} ${isOff ? styles.plantCardOff : ''}`}
              onClick={() => setDetailPlant(plant)}
              variants={fadeUp}
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            >
              <div className={styles.plantEmoji}>{plant.data.emoji}</div>
              <div className={styles.plantName}>{plant.data.name}</div>
              <div className={styles.plantMeta}>
                {photoCount > 0 ? (
                  <span className={styles.plantMetaCount}>
                    📷 {photoCount}
                  </span>
                ) : (
                  <span className={styles.plantMetaHint}>
                    <Sparkles size={11} /> нажмите
                  </span>
                )}
              </div>
              <button
                className={styles.plantCamera}
                onClick={(e) => handleDiagnoseClick(e, plant)}
                aria-label={`Сфоткать ${plant.data.name.toLowerCase()}`}
              >
                <Camera size={16} />
              </button>
            </motion.button>
          );
        })}

        {/* Кнопка "Добавить" в виде карточки (в активной категории) */}
        <motion.button
          className={styles.plantAddCard}
          onClick={() => setAddOpen(true)}
          variants={fadeUp}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        >
          <div className={styles.plantAddIcon}>
            <Plus size={28} />
          </div>
          <div className={styles.plantAddText}>
            Добавить в {activeTab === 'огород' ? 'огород' : 'сад'}
          </div>
        </motion.button>
      </motion.div>

      <AnimatePresence>
        {addOpen && (
          <AddPlantModal
            onClose={() => setAddOpen(false)}
            onAdded={handlePlantAdded}
            defaultCategory={activeTab}
          />
        )}
        {detailPlant && (
          <PlantDetailModal
            plant={detailPlant}
            diagnoses={diagnoses.filter(
              (d) => d.plantId === detailPlant.data.id,
            )}
            onClose={() => setDetailPlant(null)}
            onDiagnose={() => {
              const id = detailPlant.data.id;
              const name = detailPlant.data.name;
              setDetailPlant(null);
              setDiagnoseTarget({ plantId: id, plantName: name });
            }}
            onDeleted={() => {
              setDetailPlant(null);
              setUserPlants(getUserPlants());
            }}
          />
        )}
        {diagnoseTarget && (
          <PhotoDiagnoseModal
            plantId={diagnoseTarget.plantId}
            plantName={diagnoseTarget.plantName}
            productList={productList}
            onClose={() => setDiagnoseTarget(null)}
            onSaved={handleDiagnosisSaved}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function pluralPlants(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'растение';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'растения';
  return 'растений';
}
