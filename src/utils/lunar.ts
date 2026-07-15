/**
 * Простой расчёт фазы Луны (без точной астрономии, но достаточно близко).
 * Алгоритм синодического месяца (~29.53 дня) от опорной даты 2000-01-06 (новолуние).
 */

const SYNODIC_MONTH = 29.530588853;
const REFERENCE = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC — известное новолуние

export type LunarPhaseName =
  | 'новолуние'
  | 'растущая'
  | 'первая четверть'
  | 'растущая (выпуклая)'
  | 'полнолуние'
  | 'убывающая (выпуклая)'
  | 'последняя четверть'
  | 'убывающая';

export interface LunarInfo {
  name: LunarPhaseName;
  emoji: string;
  /** 0..1, 0 = новолуние, 0.5 = полнолуние */
  illumination: number;
  /** 0..7, для отображения как сегмент */
  segment: number;
  brief: string;
}

export function getLunarPhase(date: Date = new Date()): LunarInfo {
  const days = (date.getTime() - REFERENCE) / (1000 * 60 * 60 * 24);
  const cycles = (days % SYNODIC_MONTH + SYNODIC_MONTH) % SYNODIC_MONTH;
  const fraction = cycles / SYNODIC_MONTH; // 0..1

  let name: LunarPhaseName;
  let segment: number;
  if (fraction < 0.03 || fraction > 0.97) {
    name = 'новолуние';
    segment = 0;
  } else if (fraction < 0.22) {
    name = 'растущая';
    segment = 1;
  } else if (fraction < 0.28) {
    name = 'первая четверть';
    segment = 2;
  } else if (fraction < 0.47) {
    name = 'растущая (выпуклая)';
    segment = 3;
  } else if (fraction < 0.53) {
    name = 'полнолуние';
    segment = 4;
  } else if (fraction < 0.72) {
    name = 'убывающая (выпуклая)';
    segment = 5;
  } else if (fraction < 0.78) {
    name = 'последняя четверть';
    segment = 6;
  } else {
    name = 'убывающая';
    segment = 7;
  }

  const illumination = Math.abs(Math.cos(fraction * Math.PI * 2)) * 0.5 + 0.5;

  return {
    name,
    emoji: segmentEmojis[segment],
    illumination,
    segment,
    brief: segmentBriefs[segment],
  };
}

const segmentEmojis = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
const segmentBriefs = [
  'Новолуние — не лучшее время для пересадок и обрезки',
  'Растущая луна — благоприятны посевы и подкормки',
  'Первая четверть — хорошее время для большинства работ',
  'Луна на пике роста — максимум энергии для растений',
  'Полнолуние — не рекомендуется обрезка и пересадка',
  'Убывающая выпуклая — хорошее время для корневых подкормок',
  'Последняя четверть — благоприятно для борьбы с вредителями',
  'Убывающая луна — благоприятна для обрезки и формирования',
];
