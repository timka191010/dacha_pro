import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Loader2, AlertCircle, ChevronDown, Check } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { ProductDetails } from './ProductDetails';
import { PartnerInfo } from './PartnerInfo';
import type { Product, ProductCategory } from '../../types';
import { fadeUp, staggerContainer } from '../../utils/motion';
import styles from './ShowcasePage.module.css';

// === ИЗМЕНЕНО: грузим каталог из статики /data/products.json ===
// Бэкенд больше не нужен — продукты лежат в /public/data/.
// Фильтры (категория, культура, наличие, скидка) считаются локально.

// Категории — все, что есть в бэкенде.
const CATEGORIES: { id: 'all' | ProductCategory; label: string; icon: string }[] = [
  { id: 'all', label: 'Все', icon: '🌐' },
  { id: 'удобрение', label: 'Удобрения', icon: '🌿' },
  { id: 'стимулятор', label: 'Стимуляторы', icon: '✨' },
  { id: 'защита', label: 'Защита', icon: '🛡' },
  { id: 'набор', label: 'Наборы', icon: '🎁' },
  { id: 'грунт', label: 'Грунты', icon: '🪴' },
  { id: 'почвоулучшитель', label: 'Почвоулучшители', icon: '🪨' },
];

// Культуры для фильтра — соберём динамически из загруженного каталога
// (но захардкодим основные для UX, чтобы фильтр был сразу).
const COMMON_CROPS = [
  '', 'томаты', 'огурцы', 'перцы', 'клубника', 'ягоды',
  'розы', 'цветы', 'виноград', 'капуста', 'картофель',
  'хвойные', 'голубика', 'рассада', 'комнатные', 'газон',
];

export function ShowcasePage() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<'all' | ProductCategory>('all');
  const [crop, setCrop] = useState<string>('');
  const [cropMenuOpen, setCropMenuOpen] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [onSaleOnly, setOnSaleOnly] = useState(false);

  const [selected, setSelected] = useState<Product | null>(null);

  // Закрываем выпадашку культур по клику вне
  const cropMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!cropMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (cropMenuRef.current && !cropMenuRef.current.contains(e.target as Node)) {
        setCropMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [cropMenuOpen]);

  // === Загрузка каталога из статики (бэкенд больше не нужен) ===
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/data/products.json')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Product[]) => {
        if (!cancelled) {
          setAllProducts(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? `Не удалось загрузить каталог: ${e.message}`
              : 'Не удалось загрузить каталог',
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // === Культуры, реально встречающиеся в загруженном каталоге ===
  const availableCrops = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProducts) {
      for (const c of p.crops || []) set.add(c);
    }
    return Array.from(set).sort();
  }, [allProducts]);

  // Объединяем COMMON_CROPS с тем, что есть в каталоге (на случай если
  // парсер не пометил культуру у конкретного товара).
  const cropOptions = useMemo(() => {
    const all = new Set([...COMMON_CROPS.filter(Boolean), ...availableCrops]);
    return Array.from(all).sort();
  }, [availableCrops]);

  // === Фильтрация ===
  const filtered = useMemo(() => {
    return allProducts.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (crop && !(p.crops || []).map((c) => c.toLowerCase()).includes(crop.toLowerCase())) {
        return false;
      }
      // inStock опциональное — undefined считаем "в наличии"
      if (inStockOnly && p.inStock === false) return false;
      if (onSaleOnly && !(p.oldPrice && p.oldPrice > p.price)) return false;
      return true;
    });
  }, [allProducts, category, crop, inStockOnly, onSaleOnly]);

  return (
    <div className={styles.page}>
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className={styles.title}>
          <ShoppingBag size={28} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Витрина
        </h1>
        <p className={styles.subtitle}>
          Органическая продукция от партнёра «Органик Микс»
        </p>
      </motion.header>

      {/* Фильтры */}
      <motion.div
        className={styles.filters}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className={styles.tabs}>
          {CATEGORIES.map((c) => {
            // Скрываем табы, в которых ничего нет (на случай если recommender не подгрузил)
            if (c.id !== 'all' && !allProducts.some((p) => p.category === c.id)) {
              return null;
            }
            return (
              <motion.button
                key={c.id}
                className={`${styles.tab} ${category === c.id ? styles.tabActive : ''}`}
                onClick={() => setCategory(c.id)}
                whileTap={{ scale: 0.94 }}
              >
                <span aria-hidden="true">{c.icon}</span>
                <span>{c.label}</span>
              </motion.button>
            );
          })}
        </div>

        <div className={styles.filterRow}>
          <div className={styles.filterLabel} ref={cropMenuRef}>
            <span>Культура:</span>
            <button
              type="button"
              className={`${styles.filterSelect} ${
                cropMenuOpen ? styles.filterSelectOpen : ''
              }`}
              onClick={() => setCropMenuOpen((o) => !o)}
            >
              <span className={crop ? '' : styles.filterSelectPlaceholder}>
                {crop || 'Все'}
              </span>
              <ChevronDown
                size={16}
                className={`${styles.filterSelectChevron} ${
                  cropMenuOpen ? styles.filterSelectChevronOpen : ''
                }`}
              />
            </button>

            <AnimatePresence>
              {cropMenuOpen && (
                <motion.ul
                  className={styles.cropMenu}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <li>
                    <button
                      type="button"
                      className={`${styles.cropMenuItem} ${
                        !crop ? styles.cropMenuItemActive : ''
                      }`}
                      onClick={() => {
                        setCrop('');
                        setCropMenuOpen(false);
                      }}
                    >
                      <span>Все</span>
                      {!crop && <Check size={16} />}
                    </button>
                  </li>
                  {cropOptions.map((c) => (
                    <li key={c}>
                      <button
                        type="button"
                        className={`${styles.cropMenuItem} ${
                          crop === c ? styles.cropMenuItemActive : ''
                        }`}
                        onClick={() => {
                          setCrop(c);
                          setCropMenuOpen(false);
                        }}
                      >
                        <span>{c}</span>
                        {crop === c && <Check size={16} />}
                      </button>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          <label className={styles.filterCheck}>
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
            />
            <span>Только в наличии</span>
          </label>

          <label className={styles.filterCheck}>
            <input
              type="checkbox"
              checked={onSaleOnly}
              onChange={(e) => setOnSaleOnly(e.target.checked)}
            />
            <span>Со скидкой</span>
          </label>
        </div>

        <p className={styles.filterCount}>
          {loading
            ? 'Загружаем каталог…'
            : error
              ? 'Ошибка загрузки'
              : `Найдено: ${filtered.length} ${pluralize(filtered.length, ['товар', 'товара', 'товаров'])}`}
        </p>
      </motion.div>

      {loading && (
        <div className={styles.statusBlock}>
          <Loader2 size={32} className="spin" />
          <p>Загружаем каталог Organic Mix…</p>
        </div>
      )}

      {error && (
        <div className={styles.statusBlock}>
          <AlertCircle size={32} color="var(--color-danger)" />
          <p>{error}</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Проверь, что бэкенд запущен на http://127.0.0.1:8001
          </p>
        </div>
      )}

      {!loading && !error && (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${category}|${crop}|${inStockOnly}|${onSaleOnly}`}
            className={styles.grid}
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0 }}
          >
            {filtered.map((p) => (
              <motion.div key={p.id} variants={fadeUp} layout>
                <ProductCard product={p} onOpen={() => setSelected(p)} />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 32 }}>
          Нет товаров по выбранным фильтрам
        </p>
      )}

      <PartnerInfo />

      {selected && (
        <ProductDetails product={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
