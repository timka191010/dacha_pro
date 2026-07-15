import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { getRecommendationsForMonth } from '../../data/recommendations';
import { getProductsByIds } from '../../data/products';
import { staggerContainer, fadeUp } from '../../utils/motion';
import styles from './HomePage.module.css';

/**
 * Виджет "Рекомендация месяца": текущий сезон + 1-2 товара Органик Микс.
 * НЕ дублирует витрину — это узкий сезонный подбор, не каталог.
 */
export function RecommendationWidget() {
  const navigate = useNavigate();

  const reco = useMemo(() => {
    const month = new Date().getMonth() + 1;
    const recs = getRecommendationsForMonth(month);
    if (recs.length === 0) return null;
    return recs[0]; // берём первую — она обычно самая общая
  }, []);

  if (!reco) return null;

  const products = getProductsByIds(reco.productIds).slice(0, 2);

  return (
    <motion.section
      className={styles.recoCard}
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>Рекомендация месяца</h2>
          <p className={styles.recoReason}>{reco.reason}</p>
        </div>
        <button
          className={styles.sectionLink}
          onClick={() => navigate('/showcase')}
        >
          <ShoppingBag size={14} />
          <span>Витрина</span>
        </button>
      </div>

      <div className={styles.recoProducts}>
        {products.map((p) => (
          <motion.button
            key={p.id}
            className={styles.recoProduct}
            onClick={() => navigate('/showcase')}
            variants={fadeUp}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          >
            <div className={styles.recoProductImageWrap}>
              <img
                src={p.image}
                alt={p.name}
                className={styles.recoProductImage}
                loading="lazy"
              />
            </div>
            <div className={styles.recoProductInfo}>
              <div className={styles.recoProductName}>{p.name}</div>
              <div className={styles.recoProductPrice}>{p.price} ₽</div>
            </div>
            <ArrowRight size={16} className={styles.recoProductArrow} />
          </motion.button>
        ))}
      </div>
    </motion.section>
  );
}
