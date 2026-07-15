"""
Парсер каталога organic-mix.ru → backend/data/products.json.

Что делает:
  1) Скачивает sitemap-iblock-9.xml — там ~272 уникальных URL товаров.
  2) По каждому URL заходит на страницу товара и достаёт:
     - name, price, oldPrice, inStock, image, badges
     - **crops** (теги культур) — из вкладки data-tab="CROP" или из slug'а
  3) Сохраняет в backend/data/products.json.
  4) Демо: 5 товаров помечает "Нет в наличии", 7-ми проставляет скидку 15-30%.

Почему через sitemap, а не через пагинацию /catalog/:
  - /catalog/?PAGEN_6=N отдаёт только 12 карточек на странице + блок
    "С этим товаром покупают" (27-39 шт.) — без фильтрации получаются дубли.
  - sitemap — одна загрузка, все URL сразу, без дублей.

Запуск:
    cd backend
    .venv/bin/python scripts/scrape_organic_mix.py

Занимает ~3-5 мин (272 запроса с задержкой 0.3 сек).
"""

from __future__ import annotations

import json
import random
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

BASE = "https://organic-mix.ru"
SITEMAP_URL = f"{BASE}/sitemap-iblock-9.xml"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ru-RU,ru;q=0.9",
}
OUTPUT_PATH = Path(__file__).parent.parent / "data" / "products.json"

# Служебные разделы каталога — их URL есть в sitemap, но это НЕ товары.
SKIP_SECTIONS = {
    "udobreniya", "stimulyatory", "pochvouluchshiteli",
    "sredstva-zashchity-rasteniy", "sredstva-zashchity-ot-vrediteley",
    "sredstva-zashchity-ot-bolezney", "grunty", "kompostirovanie",
    "aksessuary-dlya-sadovoda", "novinki", "aktsii-i-skidki",
    "organik-miks-rekomenduet", "instruktsii", "nabory",
    "universalnye-udobreniya", "monokomponenty", "zhidkie-udobreniya",
    "spetsializirovannye-udobreniya",
}

# Сколько товаров пометить как "Нет в наличии" (для демо в приложении)
FORCE_OUT_OF_STOCK = 5
# Сколько товаров получит искусственную скидку (для демо)
FORCE_SALE = 7

REQUEST_DELAY = 0.3  # сек между запросами — сайт ddos-guard, не наглеть


# ----------------------------------------------------------------------
# Вспомогательные функции
# ----------------------------------------------------------------------

def fetch(url: str) -> BeautifulSoup | None:
    """Скачать страницу и вернуть soup. С 1 retry на 5xx/network."""
    for attempt in (1, 2):
        try:
            r = requests.get(url, timeout=20, headers=HEADERS)
            r.raise_for_status()
            return BeautifulSoup(r.text, "lxml")
        except requests.RequestException as e:
            if attempt == 2:
                print(f"  ✗ {url}: {e}", file=sys.stderr)
                return None
            time.sleep(1)
    return None


def fetch_xml(url: str) -> list[str]:
    """Скачать sitemap и достать все <loc>."""
    r = requests.get(url, timeout=30, headers=HEADERS)
    r.raise_for_status()
    root = ET.fromstring(r.content)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    locs = [el.text.strip() for el in root.findall(".//sm:loc", ns) if el.text]
    return locs


def parse_price(text: str) -> int | None:
    """'1 290 р.' или '1 290' → 1290."""
    digits = re.sub(r"\D", "", text or "")
    return int(digits) if digits else None


def is_visible(el) -> bool:
    """style='display:none' → невидимый (на organic-mix так прячут oldPrice)."""
    if el is None:
        return False
    style = (el.get("style") or "").lower().replace(" ", "")
    return "display:none" not in style


def get_product_urls_from_sitemap() -> list[str]:
    """
    Скачать sitemap-iblock-9.xml, отфильтровать только URL товаров.
    Товарный URL: /catalog/<slug>/, где slug не равен служебному разделу.
    """
    print(f"→ Скачиваю {SITEMAP_URL}…")
    try:
        locs = fetch_xml(SITEMAP_URL)
    except Exception as e:
        print(f"  ✗ не удалось скачать sitemap: {e}", file=sys.stderr)
        return []

    print(f"  в sitemap: {len(locs)} URL")
    product_urls: list[str] = []
    for loc in locs:
        parsed = urlparse(loc)
        # Только /catalog/<slug>/
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) != 2 or parts[0] != "catalog":
            continue
        # Нормализуем slug: %20 → дефис, lowercase — чтобы матчить SKIP_SECTIONS
        # Пример: "Sredstva%20zashchity%20rasteniy" → "sredstva-zashchity-rasteniy"
        slug = parts[1].lower().replace("%20", "-")
        if slug in SKIP_SECTIONS:
            continue
        product_urls.append(loc)
    print(f"  из них товарных: {len(product_urls)}")
    return product_urls


# ----------------------------------------------------------------------
# Извлечение культур (томаты/огурцы/цветы…)
# ----------------------------------------------------------------------

# Словарь: фрагмент из slug/названия → нормализованное имя культуры
# (используется в recommender.py для матчинга с plant_name пользователя).
SLUG_TO_CROP = {
    "tomatov": "томаты",
    "tomat": "томаты",
    "pertsev": "перцы",
    "pertsa": "перцы",
    "ogurtsov": "огурцы",
    "ogurtsa": "огурцы",
    "ogurets": "огурцы",
    "klubniki": "клубника",
    "yagod": "ягоды",
    "roz": "розы",
    "tsvetov": "цветы",
    "tsvety": "цветы",
    "petunii": "петунии",
    "gortenzii": "гортензии",
    "gortenziy": "гортензии",
    "vinograda": "виноград",
    "vinograd": "виноград",
    "kapusty": "капуста",
    "kapusta": "капуста",
    "kartofelya": "картофель",
    "kartofel": "картофель",
    "morkovi": "морковь",
    "korneplodov": "корнеплоды",
    "korneplod": "корнеплоды",
    "klematisov": "клематисы",
    "lavandy": "лаванда",
    "pionov": "пионы",
    "piony": "пионы",
    "khvoynykh": "хвойные",
    "khvoynye": "хвойные",
    "tui": "туя",
    "golubiki": "голубика",
    "rassady": "рассада",
    "komnatnykh": "комнатные",
    "fikusov": "фикусы",
    "gazon": "газон",
    "plodovykh": "плодовые",
    "domashnego-ogoroda": "домашний огород",
    "lukovichnykh": "луковичные",
    "zapravki-gryadok": "заправка грядок",
    "gigantskoy-tykvy": "гигантская тыква",
}


def extract_crops_from_text(text: str) -> list[str]:
    """
    Из строки типа "Томат, перец, баклажан и другие пасленовые культуры"
    вытащить список известных культур.

    Логика: смотрим какие ключевые слова из SLUG_TO_CROP есть в тексте.
    Для культур с вариациями ("томат"/"томаты"/"томатов") — нормализуем к одной.
    """
    if not text:
        return []
    text_lower = text.lower()
    found: list[str] = []
    seen: set[str] = set()
    for slug, crop in SLUG_TO_CROP.items():
        if slug in text_lower and crop not in seen:
            found.append(crop)
            seen.add(crop)
    return found


def extract_crops_from_url(url: str) -> list[str]:
    """Из slug вида 'udobrenie-dlya-tomatov-850-gr' вытащить 'томаты'."""
    slug = url.rstrip("/").split("/")[-1].lower()
    for fragment, crop in SLUG_TO_CROP.items():
        if fragment in slug:
            return [crop]
    return []


def extract_crops_from_name(name: str) -> list[str]:
    """Из названия 'Удобрение для томатов 850 гр.' — вытащить 'томаты'."""
    return extract_crops_from_text(name)


def get_crops(soup: BeautifulSoup, url: str, name: str) -> list[str]:
    """
    3 стратегии (по приоритету):
      1) Вкладка data-tab="CROP" на странице товара
      2) Regex по slug URL
      3) Regex по названию товара
    """
    # Стратегия 1: вкладка CROP
    crop_tab = soup.select_one('div.productInfo-item[data-tab="CROP"] .productInfoItem-text')
    if crop_tab:
        text = crop_tab.get_text(" ", strip=True).lower()
        if "подходит для всех культур" in text or "все культуры" in text:
            return []  # универсальное — оставляем пустым (recommender не отфильтрует)
        crops = extract_crops_from_text(text)
        if crops:
            return crops

    # Стратегия 2: slug
    crops = extract_crops_from_url(url)
    if crops:
        return crops

    # Стратегия 3: название
    crops = extract_crops_from_name(name)
    if crops:
        return crops

    return []


# ----------------------------------------------------------------------
# Парсинг страницы товара
# ----------------------------------------------------------------------

def parse_product_page(url: str) -> dict[str, Any] | None:
    """Спарсить одну страницу товара. Возвращает dict или None."""
    soup = fetch(url)
    if soup is None:
        return None

    # Название — h1
    h1 = soup.select_one("h1")
    if not h1:
        return None
    name = h1.get_text(strip=True)
    if not name:
        return None

    # Slug из URL — он же id
    slug = url.rstrip("/").split("/")[-1]

    # Цена — берём любую видимую
    price_el = soup.select_one('[data-entity="price"] .price_value, .current-price, [itemprop="price"]')
    price = parse_price(price_el.get_text() if price_el else "")

    # Если price не нашли — пропускаем
    if not price:
        # Попробуем другой селектор
        price_meta = soup.select_one('meta[itemprop="price"]')
        if price_meta and price_meta.get("content"):
            price = parse_price(price_meta["content"])
    if not price:
        return None

    # Старая цена — только если видимая
    old_price: int | None = None
    old_price_el = soup.select_one(".old-price, .old_price, [data-entity='old-price']")
    if old_price_el and is_visible(old_price_el):
        old_price = parse_price(old_price_el.get_text())

    # Наличие — по кнопке "В корзину" / "Нет в наличии" / "Под заказ"
    in_stock = True
    # Сначала явный признак отсутствия
    no_avail = soup.select_one(".item-noavailable, .out-of-stock, .not-available")
    if no_avail and no_avail.get_text(strip=True):
        in_stock = False
    # Затем по тексту кнопки корзины
    basket = soup.select_one(".basket_action, .add-to-cart, [data-entity='add2basket']")
    if basket:
        bt = basket.get_text(strip=True).lower()
        if any(kw in bt for kw in ["нет в наличии", "нет в продаже", "под заказ", "сообщить"]):
            in_stock = False
    # Если есть блок "Нет в наличии" где-то ещё — тоже учтём
    for el in soup.select("div, span, p"):
        txt = el.get_text(strip=True).lower()
        if txt in {"нет в наличии", "нет в продаже"} and len(el.get_text(strip=True)) < 50:
            in_stock = False
            break

    # Бейджи
    badges: list[str] = []
    if soup.select_one(".action-title, .badge--sale, .label--action"):
        badges.append("АКЦИЯ")
    if soup.select_one(".index-label--novinki, .label--new, .badge--new"):
        badges.append("НОВИНКА")
    if soup.select_one(".badge--hit, .label--hit"):
        badges.append("ХИТ")

    # Картинка
    img = soup.select_one(".product-picture img, .product-detail__picture img, [itemprop='image']")
    image = ""
    if img:
        image = img.get("src") or img.get("data-src") or ""
        if image.startswith("/"):
            image = BASE + image

    # Культуры
    crops = get_crops(soup, url, name)

    # Категория (наша внутренняя)
    category = map_category(url, name, old_price, in_stock)

    return {
        "id": slug,
        "category": category,
        "name": name,
        "crops": crops,
        "price": price,
        "oldPrice": old_price,
        "inStock": in_stock,
        "url": url,
        "image": image,
        "badges": badges,
    }


# ----------------------------------------------------------------------
# Маппинг категории (используется в recommender.py)
# ----------------------------------------------------------------------

# Категории organic-mix определяются по URL:
#   /catalog/udobreniya/... → удобрение
#   /catalog/stimulyatory/... → стимулятор
#   /catalog/pochvouluchshiteli/... → почвоулучшитель
#   /catalog/sredstva-zashchity-rasteniy/... → защита
#   /catalog/grunty/... → грунт
#   /catalog/nabory/... → набор
# В sitemap только URL товаров, но slug содержит корень категории.

CATEGORY_PATTERNS = [
    ("stimulyat", "стимулятор"),
    ("udobreniy", "удобрение"),
    ("udobreni", "удобрение"),
    ("podkorm", "удобрение"),
    ("pochvou", "почвоулучшитель"),
    ("zashchit", "защита"),
    ("grunt", "грунт"),
    ("nabor", "набор"),
    ("kompost", "компост"),
    ("aksessu", "аксессуар"),
]


def map_category(url: str, name: str, old_price: int | None, in_stock: bool) -> str:
    """
    Категория organic-mix → наш внутренний slug.

    Стратегия (по убыванию приоритета):
      1) По ключевым словам в названии (точнее — slug товара мало что даёт,
         т.к. в sitemap URL идёт сразу /catalog/<slug>/ без подраздела)
      2) Защита: "АРОМАЩИТ", "АНТИТРИПСИН", "БЕЗ ХЛОРОЗА", "АКВАСЕЙФ", "АНТИ..." и т.п.
      3) Стимулятор: "ЭЛИКСИР", "коктейль", "АнтиСтресс", "Аминорост", "БиоКорень"
      4) Удобрение: всё остальное с пометкой "удобрение" в названии/тегах
    """
    nm = name.lower()

    # Защита — самое важное: препараты от вредителей/болезней
    protection_keywords = [
        "аромащит", "антитрипсин", "без хлороза", "аквасейф",
        "антимуравьин", "антикрот", "биос", "био хантер", "биозащитин",
        "мучнистоп", "почвочист", "биоружье", "анти", "защит",
    ]
    for kw in protection_keywords:
        if kw in nm:
            return "защита"

    # Стимуляторы / антистрессы / ускорители
    stimulator_keywords = [
        "эликсир", "коктейль", "антистресс", "амино", "биокорень",
        "биотонус", "прилипай", "ускоритель", "реаниматор",
        "антизим", "дозреватель", "антивершинк", "антихлорозин",
    ]
    for kw in stimulator_keywords:
        if kw in nm:
            return "стимулятор"

    # Наборы / комбо
    if "комбо" in nm or "набор" in nm or "(5 шт.)" in nm or "(10 шт.)" in nm:
        return "набор"

    # Грунты
    if "грунт" in nm or "почва" in nm:
        return "грунт"

    # Компост / почвоулучшители
    if "компост" in nm or "разрыхл" in nm or "мульч" in nm or "вермикулит" in nm:
        return "почвоулучшитель"

    # Всё остальное с привязкой к "удобрение" в названии
    if "удобрение" in nm or "подкормк" in nm or "ленивый" in nm or "морской" in nm:
        return "удобрение"

    # Удобрения по умолчанию (Эликсиры, Коктейли, и пр. — это удобрения в широком смысле)
    return "удобрение"


# ----------------------------------------------------------------------
# Главный цикл
# ----------------------------------------------------------------------

def main():
    product_urls = get_product_urls_from_sitemap()
    if not product_urls:
        print("✗ Не удалось получить URL товаров. Прерываю.", file=sys.stderr)
        sys.exit(1)

    print(f"→ Парсю {len(product_urls)} страниц товаров (это ~{len(product_urls) * REQUEST_DELAY:.0f} сек)…")
    products: list[dict[str, Any]] = []
    errors = 0
    for i, url in enumerate(product_urls, 1):
        if i % 20 == 0:
            print(f"  [{i}/{len(product_urls)}] собрано {len(products)}")
        try:
            p = parse_product_page(url)
            if p:
                products.append(p)
            else:
                errors += 1
        except Exception as e:
            errors += 1
            print(f"  ✗ {url}: {e}", file=sys.stderr)
        time.sleep(REQUEST_DELAY)

    print(f"  успешно: {len(products)}, ошибок: {errors}")

    if not products:
        print("✗ Не удалось спарсить ни одного товара.", file=sys.stderr)
        sys.exit(1)

    # Демо: пометить 5 товаров как "Нет в наличии"
    in_stock_picks = [p for p in products if p.get("inStock") and p.get("category") in {"защита", "стимулятор", "аксессуар"}]
    for p in in_stock_picks[-FORCE_OUT_OF_STOCK:]:
        p["inStock"] = False
    print(f"  помечено как «нет в наличии» (демо): {min(FORCE_OUT_OF_STOCK, len(in_stock_picks))}")

    # Демо: проставить скидку 7 случайным товарам 15-30%
    random.seed(42)
    sale_candidates = [p for p in products if p.get("inStock") and p.get("price") and 500 < p["price"] < 3000]
    sale_picks = random.sample(sale_candidates, min(FORCE_SALE, len(sale_candidates)))
    for p in sale_picks:
        pct = random.choice([15, 20, 25, 30])
        p["oldPrice"] = round(p["price"] / (1 - pct / 100))
        if "АКЦИЯ" not in p.get("badges", []):
            p["badges"] = list({*p.get("badges", []), "АКЦИЯ"})
    print(f"  добавлено скидок (демо): {len(sale_picks)}")

    # Сортировка: акции/новинки сначала, потом по имени
    def sort_key(p):
        is_sale = "АКЦИЯ" in p.get("badges", [])
        is_new = "НОВИНКА" in p.get("badges", [])
        return (not is_sale, not is_new, p["name"])

    products.sort(key=sort_key)

    # Сохраняем
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Сохранил {len(products)} товаров в {OUTPUT_PATH}")
    print(f"  В наличии: {sum(1 for p in products if p.get('inStock'))}")
    print(f"  Со скидкой: {sum(1 for p in products if p.get('oldPrice'))}")
    print(f"  АКЦИЯ: {sum(1 for p in products if 'АКЦИЯ' in p.get('badges', []))}")
    print(f"  НОВИНКА: {sum(1 for p in products if 'НОВИНКА' in p.get('badges', []))}")
    with_crops = sum(1 for p in products if p.get("crops"))
    print(f"  С тегами культур: {with_crops} из {len(products)}")

    # Покажем статистику по категориям
    from collections import Counter
    print("\n  По категориям:")
    for cat, n in Counter(p["category"] for p in products).most_common():
        print(f"    {cat}: {n}")

    # Покажем статистику по культурам
    crop_counter: Counter = Counter()
    for p in products:
        for c in p.get("crops", []):
            crop_counter[c] += 1
    print("\n  По культурам (топ-15):")
    for c, n in crop_counter.most_common(15):
        print(f"    {c}: {n}")


if __name__ == "__main__":
    main()
