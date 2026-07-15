import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon = '🌿', title, description, action }: Props) {
  return (
    <div className={styles.wrap}>
      <div className={styles.icon} aria-hidden="true">
        {icon}
      </div>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.desc}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
