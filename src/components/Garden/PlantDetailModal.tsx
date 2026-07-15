import { useState } from 'react';
import { Modal } from '../shared/Modal';
import { Camera, MessageCircle, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Diagnosis, UserPlant } from '../../types';
import {
  removeUserPlant,
  toggleGardenPlant,
  removeDiagnosis,
} from '../../services/storage';
import { formatShortDay } from '../../utils/date';
import { GARDEN_PLANT_CATALOG } from '../../services/storage';
import styles from './GardenPage.module.css';

type AnyPlant =
  | { kind: 'preset'; data: (typeof GARDEN_PLANT_CATALOG)[number]; enabled: boolean }
  | { kind: 'user'; data: UserPlant };

interface Props {
  plant: AnyPlant;
  diagnoses: Diagnosis[];
  onClose: () => void;
  onDiagnose: () => void;
  onDeleted: () => void;
}

/**
 * Модалка профиля растения:
 *  - кнопка "Сфоткать" → onDiagnose (открывает PhotoDiagnoseModal)
 *  - кнопка "Спросить ИИ" → /ai с предзаполненным вопросом
 *  - история фото-диагностик
 *  - удалить из сада (только для пользовательских)
 */
export function PlantDetailModal({ plant, diagnoses, onClose, onDiagnose, onDeleted }: Props) {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(
    plant.kind === 'preset' ? plant.enabled : true,
  );

  const isUser = plant.kind === 'user';
  const name = plant.data.name;
  const emoji = plant.data.emoji;

  const handleAsk = () => {
    const q = isUser
      ? `У меня в саду есть ${name.toLowerCase()}. Расскажи, как за ним ухаживать сейчас и на что обратить внимание.`
      : `У меня в саду есть ${name.toLowerCase()}. Расскажи, как за ним ухаживать сейчас.`;
    navigate('/ai', { state: { presetQuestion: q } });
  };

  const handleToggleEnabled = () => {
    if (plant.kind !== 'preset') return;
    const next = toggleGardenPlant(plant.data.id);
    setEnabled(next);
  };

  const handleDeleteUserPlant = () => {
    if (!isUser) return;
    if (!confirm(`Удалить "${name}" из сада? История диагностик тоже удалится.`)) return;
    removeUserPlant(plant.data.id);
    onDeleted();
  };

  const handleDeleteDiagnosis = (id: string) => {
    if (!confirm('Удалить эту диагностику?')) return;
    removeDiagnosis(id);
    // Локально не обновляем — родитель обновит через focus или флаг
    onClose();
    setTimeout(() => onDeleted(), 0);
  };

  return (
    <Modal open onClose={onClose} title="">
      <div className={styles.detailHeader}>
        <div className={styles.detailEmoji}>{emoji}</div>
        <h2 className={styles.detailName}>{name}</h2>
        {plant.kind === 'preset' && !enabled && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Скрыто из ИИ-контекста
          </div>
        )}
      </div>

      <div className={styles.detailActions}>
        <button
          type="button"
          className={`${styles.detailAction} ${styles.detailActionPrimary}`}
          onClick={onDiagnose}
        >
          <Camera size={18} />
          Сфоткать
        </button>
        <button
          type="button"
          className={`${styles.detailAction} ${styles.detailActionSecondary}`}
          onClick={handleAsk}
        >
          <MessageCircle size={18} />
          Спросить ИИ
        </button>
      </div>

      <h3 className={styles.detailSectionTitle}>
        История ({diagnoses.length})
      </h3>

      {diagnoses.length === 0 ? (
        <div className={styles.detailEmpty}>
          Пока ничего нет. Сфоткайте больное растение — ИИ поставит диагноз и подскажет
          продукт Органик Микс.
        </div>
      ) : (
        <div className={styles.detailHistory}>
          {diagnoses.map((d) => (
            <div key={d.id} className={styles.diagnosisCard}>
              {d.thumbBase64 ? (
                <img
                  className={styles.diagnosisThumb}
                  src={`data:image/jpeg;base64,${d.thumbBase64}`}
                  alt=""
                />
              ) : (
                <div className={styles.diagnosisThumbPlaceholder}>{emoji}</div>
              )}
              <div className={styles.diagnosisInfo}>
                <div className={styles.diagnosisDate}>
                  {formatShortDay(new Date(d.createdAt))}
                </div>
                <div className={styles.diagnosisAnswer}>{d.answer}</div>
                {d.productIds.length > 0 && (
                  <div className={styles.diagnosisProducts}>
                    {d.productIds.map((pid) => (
                      <span key={pid} className={styles.diagnosisProduct}>
                        🛒 {pid}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className={styles.diagnosisDelete}
                onClick={() => handleDeleteDiagnosis(d.id)}
                aria-label="Удалить диагностику"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {plant.kind === 'preset' && (
        <button
          type="button"
          className={styles.detailDeletePlant}
          onClick={handleToggleEnabled}
        >
          {enabled ? 'Скрыть из сада' : 'Вернуть в сад'}
        </button>
      )}

      {isUser && (
        <button
          type="button"
          className={styles.detailDeletePlant}
          onClick={handleDeleteUserPlant}
        >
          Удалить из сада
        </button>
      )}
    </Modal>
  );
}
