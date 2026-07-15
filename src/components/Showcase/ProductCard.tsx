import { motion } from 'framer-motion';
import type { Product } from '../../types';
import styles from './ShowcasePage.module.css';

interface Props {
  product: Product;
  onOpen: () => void;
}

/**
 * inStock — опциональное поле: для товаров с бэкенда /api/products
 * оно всегда есть, а для старых захардкоженных в products.ts может быть undefined
 * (в этом случае считаем товар "в наличии").
 */
function isInStock(p: Product): boolean {
  return p.inStock !== false;
}

export function ProductCard({ product, onOpen }: Props) {
  const hasDiscount =
    product.oldPrice != null && product.oldPrice > product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.oldPrice! - product.price) / product.oldPrice!) * 100)
    : 0;
  const inStock = isInStock(product);

  return (
    <motion.button
      className={`${styles.card} ${
        !inStock ? styles.cardOutOfStock : ''
      }`}
      onClick={onOpen}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      layout
    >
      <div className={styles.cardHeader}>
        {product.badge && (
          <span
            className={`${styles.badge} ${styles[`badge${product.badge}`] ?? ''}`}
          >
            {product.badge}
          </span>
        )}
        <img
          src={product.image}
          alt={product.name}
          className={styles.cardImage}
          loading="lazy"
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
          }}
        />
      </div>
      <p className={styles.cardPrice}>
        {hasDiscount && (
          <span className={styles.cardOldPrice}>{product.oldPrice} ₽</span>
        )}
        {product.price} ₽
        {hasDiscount && (
          <span className={styles.cardDiscount}>−{discountPct}%</span>
        )}
      </p>
      <p className={styles.cardName}>{product.name}</p>
      {!inStock && (
        <span className={styles.cardOutBadge}>Нет в наличии</span>
      )}
    </motion.button>
  );
}
