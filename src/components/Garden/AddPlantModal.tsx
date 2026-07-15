import { useState } from 'react';
import { Modal } from '../shared/Modal';
import { addUserPlant } from '../../services/storage';
import { Sprout } from 'lucide-react';
import styles from './GardenPage.module.css';

const EMOJIS = [
  '🍅', '🥒', '🍓', '🌶', '🥕', '🥬', '🌽', '🧅', '🧄', '🥔',
  '🍇', '🍒', '🍑', '🍐', '🍏', '🥦', '🥗', '🍆', '🫛', '🫑',
  '🌻', '🌼', '🌷', '🌳', '🌲', '🌵', '🌴', '🍀', '🌿', '☘️',
  '🌱', '🍃', '🍂', '🌾', '🌺', '🌸', '🪷', '🪻', '💐', '🪴',
];

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

/**
 * Модалка добавления пользовательского растения.
 * Ввод: название + выбор эмодзи из 40 вариантов.
 */
export function AddPlantModal({ onClose, onAdded }: Props) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🌱');

  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    addUserPlant(name, emoji);
    onAdded();
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Новое растение">
      <div className={styles.addForm}>
        <div className={styles.addLabel}>Название</div>
        <input
          type="text"
          className={styles.addInput}
          placeholder="Например: Малина, Перец, Туя…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoFocus
        />

        <div className={styles.addLabel}>Иконка</div>
        <div className={styles.emojiGrid}>
          {EMOJIS.map((e) => (
            <button
              key={e}
              className={`${styles.emojiCell} ${emoji === e ? styles.emojiCellActive : ''}`}
              onClick={() => setEmoji(e)}
              type="button"
            >
              {e}
            </button>
          ))}
        </div>

        <div className={styles.addPreview}>
          <Sprout size={14} />
          <span>
            Будет добавлено: <strong>{emoji} {name.trim() || 'Без названия'}</strong>
          </span>
        </div>

        <div className={styles.addActions}>
          <button
            type="button"
            className={styles.addCancel}
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className={styles.addSave}
            onClick={handleSave}
            disabled={!canSave}
          >
            Добавить
          </button>
        </div>
      </div>
    </Modal>
  );
}
