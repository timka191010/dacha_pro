import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { getRecommendationsForMonth } from '../../data/recommendations';
import { getProductsByIds } from '../../data/products';
import { staggerContainer, fadeUp } from '../../utils/motion';
import styles from './CalendarPage.module.css';

interface Props {
  date: Date;
}

const CATEGORY_ICONS: Record<string, string> = {
  удобрение: '🌿',
  стимулятор: '✨',
  грунт: '🪴',
};

export function ProductRecommendations({ date }: Props) {
  const month = date.getMonth() + 1;
  const recos = getRecommendationsForMonth(month);
  if (recos.length === 0) return null;

  const reason = recos[0]?.reason ?? '';
  const productIds = Array.from(new Set(recos.flatMap((r) => r.productIds)));
  const products = getProductsByIds(productIds).slice(0, 4);
  if (products.length === 0) return null;

  return (
    <motion.div
      className={styles.recoSection}
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      <motion.h3 className={styles.entriesTitle} variants={fadeUp}>
        Рекомендуем Органик Микс
      </motion.h3>
      {reason && (
        <motion.p className={styles.recoReason} variants={fadeUp}>
          {reason}
        </motion.p>
      )}
      <motion.ul
        className={styles.recoList}
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {products.map((p) => (
          <motion.li key={p.id} variants={fadeUp}>
            <Link
              to="/showcase"
              className={styles.recoCard}
              style={{ display: 'flex' }}
            >
              <div className={styles.recoIcon} aria-hidden="true">
                {CATEGORY_ICONS[p.category] ?? '📦'}
              </div>
              <div className={styles.recoInfo}>
                <p className={styles.recoName}>{p.name}</p>
                <p className={styles.recoDesc}>{p.shortDesc}</p>
              </div>
              <span className={styles.recoPrice}>{p.price} ₽</span>
            </Link>
          </motion.li>
        ))}
      </motion.ul>
    </motion.div>
  );
}
