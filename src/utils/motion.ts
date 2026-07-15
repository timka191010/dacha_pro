import type { Variants, Transition } from 'framer-motion';

/**
 * Переиспользуемые motion-варианты и переходы.
 * Помогает держать анимации консистентными.
 * Версия 2: ускоренные анимации для отзывчивости UI.
 */

/* === Переходы === */

export const smoothSpring: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 0.7,
};

export const softSpring: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 26,
  mass: 0.6,
};

export const bouncySpring: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 22,
  mass: 0.5,
};

/** Быстрый tween для мелких элементов (кнопки, ячейки) */
export const quickEase: Transition = {
  type: 'tween',
  ease: [0.16, 1, 0.3, 1],
  duration: 0.18,
};

/* === Контейнеры для stagger-эффекта === */

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.025,
      delayChildren: 0.02,
    },
  },
};

export const staggerContainerSlow: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
};

/* === Появление снизу (y: 30 → 0) === */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: quickEase,
  },
};

export const fadeUpSmall: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: quickEase,
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15 } },
};

/* === Карточки (interactive) === */

export const cardInteractive = {
  whileHover: {
    y: -3,
    scale: 1.015,
    transition: { type: 'spring' as const, stiffness: 480, damping: 24 },
  },
  whileTap: {
    scale: 0.96,
    transition: { type: 'spring' as const, stiffness: 600, damping: 20 },
  },
};

export const cardSubtle = {
  whileHover: {
    y: -2,
    transition: { type: 'spring' as const, stiffness: 480, damping: 24 },
  },
  whileTap: {
    scale: 0.97,
    transition: { type: 'spring' as const, stiffness: 600, damping: 20 },
  },
};

/* === Modal: выезд снизу как в iOS === */

export const modalBackdrop: Variants = {
  hidden: { opacity: 0, backdropFilter: 'blur(0px)' },
  show: {
    opacity: 1,
    backdropFilter: 'blur(12px)',
    transition: { duration: 0.18, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    backdropFilter: 'blur(0px)',
    transition: { duration: 0.14, ease: 'easeIn' },
  },
};

export const modalSheet: Variants = {
  hidden: { y: '100%', opacity: 0.4 },
  show: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 480, damping: 32, mass: 0.7 },
  },
  exit: {
    y: '100%',
    opacity: 0.4,
    transition: { type: 'spring' as const, stiffness: 420, damping: 36, mass: 0.7 },
  },
};

export const modalCenter: Variants = {
  hidden: { scale: 0.92, opacity: 0, y: 12 },
  show: {
    scale: 1,
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 480, damping: 26, mass: 0.6 },
  },
  exit: {
    scale: 0.95,
    opacity: 0,
    y: 8,
    transition: { duration: 0.12, ease: 'easeIn' },
  },
};
