export type ProductCategory =
  | 'удобрение'
  | 'стимулятор'
  | 'грунт'
  | 'защита'
  | 'набор'
  | 'почвоулучшитель'
  | 'компост'
  | 'аксессуар'
  | 'прочее';

export type Season = 'весна' | 'лето' | 'осень' | 'зима';

export interface Product {
  id: string;
  category: ProductCategory;
  name: string;
  shortDesc: string;
  // Опциональные поля — есть только у захардкоженных в products.ts
  // (для товаров с бэкенда /api/products их нет, и UI должен это учитывать).
  fullDesc?: string;
  composition?: string;
  usage?: string;
  price: number;
  oldPrice?: number | null;
  priceUnit: string;
  packageSizes?: string[];
  seasons?: Season[];
  crops: string[];
  url: string | null;
  image: string; // URL или путь относительно /public
  // Опционально — у товаров с бэкенда всегда true/false, у захардкоженных
  // (старый products.ts) может отсутствовать (считаем "в наличии" по умолчанию).
  inStock?: boolean;
  badge?: 'АКЦИЯ' | 'НОВИНКА' | 'ХИТ';
}

export interface CalendarEntry {
  id: string;
  dateKey: string; // YYYY-MM-DD
  text: string;
  createdAt: number;
}

export interface AiCacheEntry {
  question: string;
  answer: string;
  dateKey: string;
  createdAt: number;
}

export interface Article {
  id: string;
  title: string;
  excerpt: string;
  cover: string; // emoji или короткий текст
  readMinutes: number;
  body: string; // многострочный текст с \n\n для абзацев
  tags: string[];
}

export interface Recommendation {
  months: number[]; // 1-12
  productIds: string[];
  reason: string;
}

export interface AppSettings {
  region: string;
}

/* ============== Мой сад ============== */

export interface UserPlant {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
}

export interface Diagnosis {
  id: string;
  plantId: string;
  plantName: string; // denormalized — на случай если растение удалят
  thumbBase64: string; // маленькое превью для списка истории (~10 КБ)
  imageBase64: string; // полное изображение для просмотра в модалке
  question: string;
  answer: string;
  productIds: string[]; // ID продуктов Органик Микс, которые ИИ упомянул
  createdAt: number;
}

export type RootStackParamList = {
  Home: undefined;
  Calendar: undefined;
  Showcase: undefined;
  Articles: undefined;
};
