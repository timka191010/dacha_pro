import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import {
  fetchWeather,
  getCachedWeather,
  weatherCodeToEmoji,
  weatherCodeToLabel,
  type WeatherSnapshot,
} from '../../services/weather';
import { fadeUp } from '../../utils/motion';
import styles from './HomePage.module.css';

/**
 * Виджет погоды: текущая температура + прогноз на 3 дня.
 * Использует Open-Meteo (без ключа), кеш в localStorage на 30 мин.
 */
export function WeatherWidget() {
  const [snap, setSnap] = useState<WeatherSnapshot | null>(() => getCachedWeather());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (snap) return; // есть кеш — не дёргаем сеть
    setLoading(true);
    fetchWeather()
      .then((s) => {
        if (cancelled) return;
        if (s) setSnap(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !snap) {
    return (
      <div className={styles.weatherCard}>
        <div className={styles.weatherLoading}>
          <Loader2 size={18} className={styles.spin} />
          <span>Загружаю погоду…</span>
        </div>
      </div>
    );
  }

  if (!snap) {
    return (
      <div className={styles.weatherCard}>
        <div className={styles.weatherLoading}>
          <span>Нет данных о погоде</span>
        </div>
      </div>
    );
  }

  const emoji = weatherCodeToEmoji(snap.current.weatherCode, snap.current.isDay);
  const label = weatherCodeToLabel(snap.current.weatherCode);

  return (
    <motion.div
      className={styles.weatherCard}
      variants={fadeUp}
    >
      <div className={styles.weatherCurrent}>
        <div className={styles.weatherCurrentMain}>
          <span className={styles.weatherEmoji}>{emoji}</span>
          <div>
            <div className={styles.weatherTemp}>{snap.current.temp}°</div>
            <div className={styles.weatherLabel}>{label}</div>
          </div>
        </div>
        <div className={styles.weatherLocation}>{snap.location.label}</div>
      </div>
      <div className={styles.weatherForecast}>
        {snap.forecast.slice(0, 3).map((d, i) => {
          const dt = new Date(d.date);
          const dayLabel =
            i === 0
              ? 'Сегодня'
              : i === 1
                ? 'Завтра'
                : dt.toLocaleDateString('ru-RU', { weekday: 'short' });
          return (
            <div key={d.date} className={styles.weatherDay}>
              <span className={styles.weatherDayLabel}>{dayLabel}</span>
              <span className={styles.weatherDayEmoji}>
                {weatherCodeToEmoji(d.weatherCode, true)}
              </span>
              <span className={styles.weatherDayTemp}>
                {d.tempMax}° <span className={styles.weatherDayTempMin}>{d.tempMin}°</span>
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
