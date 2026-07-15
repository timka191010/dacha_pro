import { Outlet } from 'react-router-dom';
import { TabBar } from './TabBar';
import styles from './AppLayout.module.css';

export function AppLayout() {
  return (
    <div className="app">
      <main className={styles.main}>
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
