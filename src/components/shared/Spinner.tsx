import styles from './Spinner.module.css';

interface Props {
  size?: number;
  label?: string;
}

export function Spinner({ size = 24, label }: Props) {
  return (
    <div className={styles.wrap} role="status" aria-label={label ?? 'Загрузка'}>
      <div
        className={styles.spinner}
        style={{ width: size, height: size, borderWidth: size > 20 ? 3 : 2 }}
      />
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
