import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { getLunarPhase } from '../../utils/lunar';

/**
 * Широкая карточка фазы луны.
 * Кликабельна — переход в календарь.
 */
export function LunarCard({ onClick }: { onClick: () => void }) {
  const lunar = getLunarPhase();

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -3, scale: 1.005 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 24 }}
      style={{
        width: '100%',
        background: 'linear-gradient(135deg, #1a2530 0%, #2c3e50 50%, #4a3b5a 100%)',
        color: '#fff',
        borderRadius: 24,
        padding: '16px 18px',
        position: 'relative',
        overflow: 'hidden',
        border: 'none',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: '0 8px 30px rgba(26, 37, 48, 0.2)',
        cursor: 'pointer',
      }}
    >
      <motion.div
        animate={{ rotate: [0, 5, -5, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          fontSize: 48,
          lineHeight: 1,
          filter: 'drop-shadow(0 4px 12px rgba(255, 215, 100, 0.4))',
        }}
      >
        {lunar.emoji}
      </motion.div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            opacity: 0.7,
            fontWeight: 700,
            marginBottom: 2,
          }}
        >
          Луна
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 2 }}>
          {lunar.name}
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>{lunar.brief}</div>
      </div>
      <Sparkles size={18} opacity={0.6} />
    </motion.button>
  );
}
