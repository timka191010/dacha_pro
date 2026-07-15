/** Утилиты для работы с датами без внешних библиотек. */

const MONTHS_RU_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const MONTHS_RU_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export const SEASONS = ['зима', 'весна', 'лето', 'осень'] as const;
export type SeasonRu = (typeof SEASONS)[number];

/** Возвращает "YYYY-MM-DD" для переданной даты (или сегодня). */
export function toDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "15 июля 2026" */
export function formatDateHuman(date: Date = new Date()): string {
  return `${date.getDate()} ${MONTHS_RU_GENITIVE[date.getMonth()]} ${date.getFullYear()}`;
}

/** "Июль 2026" */
export function formatMonthYear(date: Date): string {
  return `${MONTHS_RU_NOMINATIVE[date.getMonth()]} ${date.getFullYear()}`;
}

/** Алиас для formatMonthYear — используется в Calendar. */
export const formatMonthLabel = formatMonthYear;

/** "Пн, 15 июля" */
export function formatShortDay(date: Date): string {
  return `${WEEKDAYS_SHORT[date.getDay()]}, ${date.getDate()} ${MONTHS_RU_GENITIVE[date.getMonth()]}`;
}

export function getSeason(date: Date = new Date()): SeasonRu {
  const m = date.getMonth() + 1;
  if (m === 12 || m <= 2) return 'зима';
  if (m >= 3 && m <= 5) return 'весна';
  if (m >= 6 && m <= 8) return 'лето';
  return 'осень';
}

export function getSeasonPhrase(date: Date = new Date()): string {
  const m = date.getMonth() + 1;
  if (m === 12 || m <= 2) return 'середина зимы, пора планировать сезон';
  if (m === 3 || m === 4 || m === 5) {
    if (m === 3) return 'начало весны, время рассады';
    if (m === 4) return 'середина весны, активная посевная';
    return 'поздняя весна, высадка в грунт';
  }
  if (m === 6) return 'начало лета, уход за посадками';
  if (m === 7) return 'середина лета, жаркая пора';
  if (m === 8) return 'конец лета, сбор урожая';
  if (m === 9) return 'начало осени, заготовки';
  if (m === 10) return 'середина осени, подготовка к зиме';
  return 'поздняя осень, последние работы';
}

/** Кол-во дней в месяце. */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Сетка месяца: 5 или 6 строк (35–42 ячейки) в зависимости от месяца. */
export function getMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Понедельник = 0
  const daysInMonth = getDaysInMonth(year, month);
  // Минимум строк: 5 (если 1-е на пн и ≤28 дней), иначе 6.
  // Надёжнее: ceil((startOffset + daysInMonth) / 7), минимум 5.
  const rows = Math.max(5, Math.ceil((startOffset + daysInMonth) / 7));
  const totalCells = rows * 7;
  const result: Date[] = [];

  for (let i = 0; i < totalCells; i++) {
    // dayNum считаем так, чтобы 1 = первое число month.
    // Если i < startOffset → dayNum отрицательный (предыдущий месяц).
    // Если i >= startOffset + daysInMonth → dayNum > daysInMonth (следующий месяц).
    // JS Date сам переносит: new Date(2026, 6, 32) === new Date(2026, 7, 1) === 1 августа.
    // Поэтому просто передаём dayNum — никакой арифметики «- daysInMonth» не нужно,
    // иначе получается дубль первых дней текущего месяца в конце сетки.
    const dayNum = i - startOffset + 1;
    result.push(new Date(year, month, dayNum));
  }
  return result;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addMonths(date: Date, count: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + count);
  return d;
}

/** Сдвиг даты на N дней. */
export function addDays(date: Date, count: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + count);
  return d;
}

export function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
