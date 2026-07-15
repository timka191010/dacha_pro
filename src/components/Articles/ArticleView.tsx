import { motion } from 'framer-motion';
import { ArrowLeft, Clock } from 'lucide-react';
import type { Article } from '../../types';
import { staggerContainer } from '../../utils/motion';
import styles from './ArticlesPage.module.css';

interface Props {
  article: Article;
  onBack: () => void;
}

export function ArticleView({ article, onBack }: Props) {
  return (
    <div className={styles.page}>
      <motion.button
        className={styles.back}
        onClick={onBack}
        whileHover={{ x: -3 }}
        whileTap={{ scale: 0.95 }}
      >
        <ArrowLeft size={18} />
        К статьям
      </motion.button>
      <motion.div
        className={styles.viewCover}
        aria-hidden="true"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      >
        {article.cover}
      </motion.div>
      <motion.h1
        className={styles.viewTitle}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {article.title}
      </motion.h1>
      <motion.p
        className={styles.viewMeta}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Clock size={12} style={{ verticalAlign: 'middle' }} /> {article.readMinutes} мин · {article.tags.join(' · ')}
      </motion.p>
      <motion.article
        className={styles.viewBody}
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        dangerouslySetInnerHTML={{ __html: renderBody(article.body) }}
      />
    </div>
  );
}

function renderBody(md: string): string {
  return md
    .split('\n\n')
    .map((para) => {
      const escaped = para
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const formatted = escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br/>');
      return `<p>${formatted}</p>`;
    })
    .join('');
}
