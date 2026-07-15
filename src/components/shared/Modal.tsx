import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { modalBackdrop, modalSheet } from '../../utils/motion';
import styles from './Modal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  showClose?: boolean;
}

/**
 * Bottom-sheet модалка в стиле iOS: выезжает снизу с пружиной,
 * backdrop размывается через backdrop-filter.
 */
export function Modal({ open, onClose, title, children, showClose = true }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          onClick={onClose}
          role="presentation"
          variants={modalBackdrop}
          initial="hidden"
          animate="show"
          exit="exit"
          style={{
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <motion.div
            className={styles.sheet}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            variants={modalSheet}
            initial="hidden"
            animate="show"
            exit="exit"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.15}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 400) onClose();
            }}
          >
            <div className={styles.handle} />
            {(title || showClose) && (
              <div className={styles.header}>
                {title && <h2 className={styles.title}>{title}</h2>}
                {showClose && (
                  <button
                    className={styles.close}
                    onClick={onClose}
                    aria-label="Закрыть"
                  >
                    ×
                  </button>
                )}
              </div>
            )}
            <div className={styles.body}>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
