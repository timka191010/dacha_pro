import type { Recommendation } from '../types';

/**
 * Привязка продуктов Органик Микс к месяцам для рекомендаций в календаре.
 * Месяцы нумеруются 1–12.
 */
export const recommendations: Recommendation[] = [
  {
    months: [3, 4],
    productIds: ['spring-fertilizer', 'seedling-soil', 'biokoren'],
    reason: 'Весенняя посевная: замачивание семян, посев рассады, первая подкормка',
  },
  {
    months: [5],
    productIds: ['spring-fertilizer', 'biokoren', 'aminorost'],
    reason: 'Высадка рассады в грунт и теплицы',
  },
  {
    months: [6, 7],
    productIds: ['tomato-fertilizer', 'cucumber-fertilizer', 'aminorost', 'biotonus'],
    reason: 'Активный рост и начало плодоношения',
  },
  {
    months: [7, 8],
    productIds: ['strawberry-fertilizer', 'biotonus', 'aminorost'],
    reason: 'Подкормка ягодных после сбора, защита от жары',
  },
  {
    months: [8, 9],
    productIds: ['autumn-fertilizer', 'aminorost', 'strawberry-fertilizer'],
    reason: 'Подготовка к осени: восстановление сил и закладка урожая будущего года',
  },
  {
    months: [10, 11],
    productIds: ['autumn-fertilizer', 'antizima'],
    reason: 'Обработка от вымерзания, последние подкормки',
  },
  {
    months: [1, 2],
    productIds: ['aminorost', 'biotonus'],
    reason: 'Зимняя рассада и уход за комнатными растениями',
  },
];

/**
 * Возвращает рекомендации, подходящие для указанного месяца (1–12).
 */
export function getRecommendationsForMonth(month: number): Recommendation[] {
  return recommendations.filter((r) => r.months.includes(month));
}
