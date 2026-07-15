import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { articles, getArticleById } from '../../data/articles';
import { ArticleView } from './ArticleView';
import { fadeUp, staggerContainer } from '../../utils/motion';
import { BookOpen } from 'lucide-react';
import styles from './ArticlesPage.module.css';

export function ArticlesPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [tag, setTag] = useState<string | null>(null);

  const article = id ? getArticleById(id) : null;
  const allTags = Array.from(new Set(articles.flatMap((a) => a.tags)));

  if (article) {
    return (
      <ArticleView
        article={article}
        onBack={() => navigate('/articles')}
      />
    );
  }

  const filtered = tag ? articles.filter((a) => a.tags.includes(tag)) : articles;

  return (
    <div className={styles.page}>
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className={styles.title}>
          <BookOpen size={28} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Статьи
        </h1>
        <p className={styles.subtitle}>Практичные советы по сезонным работам</p>
      </motion.header>

      <motion.div
        className={styles.tags}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <motion.button
          className={`${styles.tag} ${tag === null ? styles.tagActive : ''}`}
          onClick={() => setTag(null)}
          whileTap={{ scale: 0.94 }}
        >
          Все
        </motion.button>
        {allTags.map((t) => (
          <motion.button
            key={t}
            className={`${styles.tag} ${tag === t ? styles.tagActive : ''}`}
            onClick={() => setTag(tag === t ? null : t)}
            whileTap={{ scale: 0.94 }}
          >
            {t}
          </motion.button>
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.ul
          key={tag ?? 'all'}
          className={styles.list}
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {filtered.map((a) => (
            <motion.li key={a.id} variants={fadeUp} layout>
              <motion.button
                className={styles.item}
                onClick={() => navigate(`/articles/${a.id}`)}
                whileHover={{ y: -4, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 350, damping: 22 }}
              >
                <motion.div
                  className={styles.cover}
                  aria-hidden="true"
                  whileHover={{ rotate: [0, -6, 6, 0] }}
                  transition={{ duration: 0.4 }}
                >
                  {a.cover}
                </motion.div>
                <div className={styles.info}>
                  <h2 className={styles.titleArticle}>{a.title}</h2>
                  <p className={styles.excerpt}>{a.excerpt}</p>
                  <p className={styles.meta}>
                    ⏱ {a.readMinutes} мин · {a.tags.slice(0, 2).join(' · ')}
                  </p>
                </div>
              </motion.button>
            </motion.li>
          ))}
        </motion.ul>
      </AnimatePresence>
    </div>
  );
}
