import { useRef, useState } from 'react';
import { Modal } from '../shared/Modal';
import { Camera, Image as ImageIcon, Loader2, Sparkles, BookOpen, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { compressImage } from '../../services/aiProviders';
import { addDiagnosis } from '../../services/storage';
import { diagnose as runDiagnose, type DiagnoseProgress } from '../../services/diagnose';
import { getEmbedder, getActiveDevice } from '../../services/embedding';
import styles from './GardenPage.module.css';

interface Props {
  plantId: string;
  plantName: string;
  // productList больше не нужен на фронте — RAG-модель сама решает, что рекомендовать.
  // Оставляем, чтобы не ломать сигнатуру, но игнорируем.
  productList?: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Модалка фото-диагностики — тонкий клиент Python-бэкенда.
 *
 * Шаги:
 *  1) Сжимаем фото через canvas (как раньше)
 *  2) POST /api/diagnose на http://localhost:8000
 *  3) Бэкенд делает: vision → FAISS → RAG-промпт → Groq
 *  4) Получаем { disease, answer, sources[] } — показываем пользователю
 *  5) Кнопка "Открыть книгу" рядом с каждым источником — открывает текст
 */
export function PhotoDiagnoseModal({
  plantId,
  plantName,
  onClose,
  onSaved,
}: Props) {
  const navigate = useNavigate();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [previewThumb, setPreviewThumb] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    disease: string;
    answer: string;
    sources: { text: string; source: string; page: string; score: number }[];
    recommended_products?: {
      id: string;
      name: string;
      category: string;
      shortDesc?: string;
      price: number;
      oldPrice?: number | null;
      inStock: boolean;
      priceUnit?: string;
      url: string;
      image: string;
      badge?: string;
      score: number;
    }[];
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [expandedSource, setExpandedSource] = useState<number | null>(null);

  // === НОВОЕ: ML в браузере + Vercel Function (без отдельного бэкенда) ===
  // Логика теперь в src/services/diagnose.ts — там же RAG-поиск и рекомендации.
  // Groq-ключ спрятан в env на Vercel, не в браузере.

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setSaved(false);
    try {
      const { base64, thumbBase64 } = await compressImage(file);
      setPreviewBase64(base64);
      setPreviewThumb(thumbBase64);
      setPreview(`data:image/jpeg;base64,${base64}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось обработать фото');
    }
  };

  const handleSubmit = async () => {
    if (!previewBase64) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    setLoadingStep('Загружаю модель…');

    try {
      // Прелоадим модель с прогрессом (если ещё не загружена)
      await getEmbedder((p) => {
        if (p.status === 'progress' && p.progress != null) {
          setLoadingStep(`Загружаю модель: ${Math.round(p.progress)}%`);
        } else if (p.status === 'done' || p.status === 'ready') {
          const dev = getActiveDevice();
          setLoadingStep(dev ? `Модель готова (${dev.toUpperCase()})` : 'Модель готова');
        } else if (p.status === 'download') {
          setLoadingStep(`Скачиваю ${p.name ?? 'модель'}…`);
        }
      });

      const data = await runDiagnose(
        {
          imageBase64: previewBase64,
          plantName,
          userNote: note,
        },
        (p: DiagnoseProgress) => {
          setLoadingStep(p.message);
        }
      );
      setResult(data);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const isNetwork =
        raw === 'Load failed' ||
        raw === 'Failed to fetch' ||
        raw === 'NetworkError when attempting to fetch resource';
      const msg = isNetwork
        ? 'Не удалось связаться с сервером. Проверь, что Vercel Function /api/diagnose доступна.'
        : raw;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!result || !previewBase64 || !previewThumb) return;
    addDiagnosis({
      plantId,
      plantName,
      imageBase64: previewBase64,
      thumbBase64: previewThumb,
      question: note,
      answer: result.answer,
      // productIds больше не извлекаем — рекомендации приходят в тексте ответа
      // и не привязаны к конкретным product.id. Оставляем пустой массив,
      // чтобы не ломать тип Diagnosis.
      productIds: [],
    });
    setSaved(true);
    onSaved();
  };

  const handleAskMore = () => {
    const q = `У меня ${plantName.toLowerCase()}. Диагноз: ${result?.disease ?? '?'}. ИИ-консультант дал такой ответ:\n\n${result?.answer ?? ''}\n\nЧто ещё посоветуешь?`;
    navigate('/ai', { state: { presetQuestion: q } });
  };

  return (
    <Modal open onClose={onClose} title={`Диагностика: ${plantName}`}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {preview ? (
        <div className={styles.diagnosePreview}>
          <img className={styles.diagnosePreviewImage} src={preview} alt="Превью" />
          <div className={styles.diagnosePreviewActions}>
            <button
              type="button"
              className={styles.diagnosePreviewBtn}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera size={14} /> Переснять
            </button>
            <button
              type="button"
              className={styles.diagnosePreviewBtn}
              onClick={() => galleryInputRef.current?.click()}
            >
              <ImageIcon size={14} /> Другое фото
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.diagnoseUpload}>
          <div className={styles.diagnoseUploadIcon}>
            <Camera size={28} />
          </div>
          <div className={styles.diagnoseUploadTitle}>Сфоткайте больное место</div>
          <div className={styles.diagnoseUploadHint}>
            Чёткое фото поражённого листа, стебля или плода. Желательно при дневном свете.
            Ответ будет опираться на 4 книги по агрономии.
          </div>
          <div className={styles.diagnoseUploadButtons}>
            <button
              type="button"
              className={styles.diagnoseUploadBtn}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera size={16} /> Сделать снимок
            </button>
            <button
              type="button"
              className={`${styles.diagnoseUploadBtn} ${styles.diagnoseUploadBtnAlt}`}
              onClick={() => galleryInputRef.current?.click()}
            >
              <ImageIcon size={16} /> Из галереи
            </button>
          </div>
        </div>
      )}

      {preview && !result && (
        <>
          <div className={styles.diagnoseField}>
            <label className={styles.diagnoseFieldLabel}>
              Что беспокоит? (опционально)
            </label>
            <textarea
              className={styles.diagnoseFieldInput}
              placeholder="Например: жёлтые пятна на нижних листьях…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
            />
          </div>
          <button
            type="button"
            className={styles.diagnoseSubmit}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="spin" />
                ИИ анализирует и ищет в книгах…
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Отправить на диагностику
              </>
            )}
          </button>
        </>
      )}

      {loading && (
        <div className={styles.diagnoseSpinner}>
          <Loader2 size={20} className="spin" />
          {loadingStep || 'Анализирую…'} (10–20 сек)
        </div>
      )}

      {error && <div className={styles.diagnoseError}>{error}</div>}

      {result && !loading && (
        <>
          <div className={styles.diagnoseResult}>
            <div className={styles.diagnoseResultHeader}>
              <Sparkles size={14} />
              {result.disease}
            </div>
            <div className={styles.diagnoseResultText}>{result.answer}</div>
          </div>

          {result.recommended_products && result.recommended_products.length > 0 && (
            <div className={styles.diagnoseResultProducts}>
              <h3 className={styles.detailSectionTitle}>
                <ShoppingBag size={12} /> Подходящие продукты Organic Mix
              </h3>
              {result.recommended_products.map((p) => {
                const isOut = !p.inStock;
                const hasDiscount = p.oldPrice && p.oldPrice > p.price;
                const discountPct = hasDiscount
                  ? Math.round(((p.oldPrice! - p.price) / p.oldPrice!) * 100)
                  : 0;
                // Если нет в наличии — рендерим как <div>, а не <a> (не кликабельный)
                const Wrapper: any = isOut ? 'div' : 'a';
                const wrapperProps = isOut
                  ? { className: `${styles.diagnoseResultProduct} ${styles.productOutOfStock}` }
                  : {
                      href: p.url,
                      target: '_blank',
                      rel: 'noopener noreferrer',
                      className: styles.diagnoseResultProduct,
                    };
                return (
                  <Wrapper key={p.id} {...wrapperProps}>
                    <img
                      className={styles.diagnoseResultProductImage}
                      src={p.image}
                      alt={p.name}
                    />
                    <div className={styles.diagnoseResultProductInfo}>
                      <div className={styles.diagnoseResultProductName}>
                        {p.name}
                        {p.badge && p.badge !== 'АКЦИЯ' && (
                          <span className={styles.productBadge}> · {p.badge}</span>
                        )}
                      </div>
                      <div className={styles.diagnoseResultProductPrice}>
                        {hasDiscount && (
                          <span className={styles.productOldPrice}>{p.oldPrice} ₽</span>
                        )}
                        <span>{p.price} ₽</span>
                        <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>
                          {' '}· {p.priceUnit}
                        </span>
                        {hasDiscount && (
                          <span className={styles.productDiscount}>−{discountPct}%</span>
                        )}
                      </div>
                    </div>
                    {isOut && (
                      <span className={styles.productOutBadge}>Нет в наличии</span>
                    )}
                  </Wrapper>
                );
              })}
            </div>
          )}

          {result.sources.length > 0 && (
            <div className={styles.diagnoseResultProducts}>
              <h3 className={styles.detailSectionTitle}>
                <BookOpen size={12} /> Источники из книг ({result.sources.length})
              </h3>
              {result.sources.map((src, i) => (
                <div
                  key={i}
                  className={styles.sourceCard}
                  onClick={() =>
                    setExpandedSource(expandedSource === i ? null : i)
                  }
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.sourceHead}>
                    <span className={styles.sourceNum}>{i + 1}</span>
                    <span className={styles.sourceMeta}>
                      {src.source} · стр. {src.page}
                    </span>
                    <span className={styles.sourceScore}>
                      {Math.round(src.score * 100)}%
                    </span>
                  </div>
                  <div
                    className={`${styles.sourceText} ${
                      expandedSource === i ? styles.sourceTextOpen : ''
                    }`}
                  >
                    {src.text}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              type="button"
              className={`${styles.detailAction} ${styles.detailActionSecondary}`}
              onClick={handleAskMore}
            >
              <Sparkles size={16} /> Уточнить у ИИ
            </button>
            <button
              type="button"
              className={`${styles.detailAction} ${styles.detailActionPrimary}`}
              onClick={handleSave}
              disabled={saved}
              style={{ flex: 1 }}
            >
              {saved ? '✓ Сохранено' : 'Сохранить в историю'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
