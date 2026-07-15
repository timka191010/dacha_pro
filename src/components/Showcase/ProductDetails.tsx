import { useState } from 'react';
import { motion } from 'framer-motion';
import { Modal } from '../shared/Modal';
import { isFavorite, toggleFavorite } from '../../services/storage';
import { fadeUp, staggerContainer } from '../../utils/motion';
import { Star, ShoppingCart } from 'lucide-react';
import type { Product } from '../../types';
import styles from './ShowcasePage.module.css';

interface Props {
  product: Product;
  onClose: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  удобрение: '🌿',
  стимулятор: '✨',
  грунт: '🪴',
  защита: '🛡',
  набор: '🎁',
  почвоулучшитель: '🪨',
  компост: '♻️',
  аксессуар: '🧰',
  прочее: '📦',
};

export function ProductDetails({ product, onClose }: Props) {
  const [fav, setFav] = useState(() => isFavorite(product.id));

  const handleFav = () => {
    const next = toggleFavorite(product.id);
    setFav(next);
  };

  // inStock опциональное — для старых товаров без поля считаем "в наличии"
  const inStock = product.inStock !== false;

  // Есть ли у нас "расширенные" данные (старый формат products.ts) или только бэкенд-минимум
  const hasExtended =
    Boolean(product.fullDesc) ||
    Boolean(product.composition) ||
    Boolean(product.usage) ||
    (product.packageSizes && product.packageSizes.length > 0);

  // Скидка
  const hasDiscount =
    product.oldPrice != null && product.oldPrice > product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.oldPrice! - product.price) / product.oldPrice!) * 100)
    : 0;

  return (
    <Modal open onClose={onClose} title={product.name}>
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div
          className={styles.detailImageWrap}
          variants={fadeUp}
        >
          <img
            src={product.image}
            alt={product.name}
            className={styles.detailImage}
            draggable={false}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
            }}
          />
          {product.badge && (
            <span
              className={`${styles.detailBadgeCorner} ${
                styles[`badge${product.badge}`] ?? ''
              }`}
            >
              {product.badge}
            </span>
          )}
          {!inStock && (
            <span className={styles.detailOutBadge}>Нет в наличии</span>
          )}
        </motion.div>
        <motion.div className={styles.detailHero} variants={fadeUp}>
          <div className={styles.detailCateg}>
            {CATEGORY_ICONS[product.category] ?? '📦'} {product.category}
          </div>
          <h2 className={styles.detailName}>{product.name}</h2>
          <p className={styles.detailPrice}>
            {hasDiscount && (
              <span className={styles.detailOldPrice}>{product.oldPrice} ₽</span>
            )}
            {product.price} ₽
            {product.priceUnit && (
              <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--color-text-muted)' }}>
                {' '}· {product.priceUnit}
              </span>
            )}
            {hasDiscount && (
              <span className={styles.detailDiscount}>−{discountPct}%</span>
            )}
          </p>
        </motion.div>

        {product.shortDesc && (
          <motion.div className={styles.detailSection} variants={fadeUp}>
            <p className={styles.detailText}>{product.shortDesc}</p>
          </motion.div>
        )}

        {hasExtended && product.fullDesc && (
          <motion.div className={styles.detailSection} variants={fadeUp}>
            <h4 className={styles.detailSectionTitle}>Описание</h4>
            <p className={styles.detailText}>{product.fullDesc}</p>
          </motion.div>
        )}

        {hasExtended && product.composition && (
          <motion.div className={styles.detailSection} variants={fadeUp}>
            <h4 className={styles.detailSectionTitle}>Состав</h4>
            <p className={styles.detailText}>{product.composition}</p>
          </motion.div>
        )}

        {hasExtended && product.usage && (
          <motion.div className={styles.detailSection} variants={fadeUp}>
            <h4 className={styles.detailSectionTitle}>Применение</h4>
            <p className={styles.detailText}>{product.usage}</p>
          </motion.div>
        )}

        {hasExtended && product.packageSizes && product.packageSizes.length > 0 && (
          <motion.div className={styles.detailSection} variants={fadeUp}>
            <h4 className={styles.detailSectionTitle}>Фасовки</h4>
            <div className={styles.packageChips}>
              {product.packageSizes.map((p) => (
                <span key={p} className={styles.chip}>{p}</span>
              ))}
            </div>
          </motion.div>
        )}

        {product.crops && product.crops.length > 0 && (
          <motion.div className={styles.detailSection} variants={fadeUp}>
            <h4 className={styles.detailSectionTitle}>Подходит для</h4>
            <div className={styles.cropChips}>
              {product.crops.map((c) => (
                <span key={c} className={styles.cropChip}>{c}</span>
              ))}
            </div>
          </motion.div>
        )}

        <motion.div className={styles.detailActions} variants={fadeUp}>
          <motion.button
            className={`${styles.actionBtn} ${fav ? styles.actionBtnFav : ''}`}
            onClick={handleFav}
            whileTap={{ scale: 0.95 }}
          >
            <Star size={18} fill={fav ? 'currentColor' : 'none'} />
            {fav ? 'В избранном' : 'В избранное'}
          </motion.button>
          {product.url && inStock && (
            <motion.button
              className={styles.actionBtnPrimary}
              onClick={() => window.open(product.url!, '_blank', 'noopener')}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
            >
              <ShoppingCart size={18} />
              Купить
            </motion.button>
          )}
          {product.url && !inStock && (
            <motion.button
              className={`${styles.actionBtnPrimary} ${styles.actionBtnDisabled}`}
              disabled
            >
              Нет в наличии
            </motion.button>
          )}
        </motion.div>
      </motion.div>
    </Modal>
  );
}
