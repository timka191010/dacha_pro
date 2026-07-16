import { useState } from 'react';
import { Modal } from '../shared/Modal';
import { addUserPlant } from '../../services/storage';
import type { PlantCategory } from '../../types';
import { Sprout, Carrot, Flower2 } from 'lucide-react';
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
  defaultCategory?: PlantCategory;
}

/**
 * Модалка добавления пользовательского растения.
 * Ввод: название + выбор эмодзи + выбор категории (огород / сад).
 *
 * `defaultCategory` — какой таб активен в `GardenPage` сейчас; с него
 * начинаем выбор, но юзер может переключить внутри модалки.
 */
export function AddPlantModal({ onClose, onAdded, defaultCategory = 'огород' }: Props) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🌱');
  const [category, setCategory] = useState<PlantCategory>(defaultCategory);

  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    addUserPlant(name, emoji, category);
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

        <div className={styles.addLabel}>Категория</div>
        <div className={styles.categoryPicker} role="radiogroup" aria-label="Категория">
          <button
            type="button"
            role="radio"
            aria-checked={category === 'огород'}
            data-cat="огород"
            className={`${styles.categoryOption} ${
              category === 'огород' ? styles.categoryOptionActive : ''
            }`}
            onClick={() => setCategory('огород')}
          >
            <Carrot size={16} />
            <span>Огород</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={category === 'сад'}
            data-cat="сад"
            className={`${styles.categoryOption} ${
              category === 'сад' ? styles.categoryOptionActive : ''
            }`}
            onClick={() => setCategory('сад')}
          >
            <Flower2 size={16} />
            <span>Сад</span>
          </button>
        </div>

        <div className={styles.addPreview}>
          <Sprout size={14} />
          <span>
            Будет добавлено в <strong>{category === 'огород' ? 'Огород' : 'Сад'}</strong>:{' '}
            <strong>{emoji} {name.trim() || 'Без названия'}</strong>
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
