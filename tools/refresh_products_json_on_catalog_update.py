#!/usr/bin/env python3
"""Isolated post-registration finalizer for this preview catalog.

Run from the preview root after the new product page and exactly one category
card have been created: ``python tools/refresh_products_json_on_catalog_update.py``.
It is deliberately local-only and does not publish, fetch, or edit category pages.
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import tempfile
from pathlib import Path

from bs4 import BeautifulSoup

from apply_related_carousel import CSS_TAG, JS_TAG, inject

ROOT = Path(__file__).resolve().parents[1]
PRODUCT = ROOT / "product"
CATEGORY = ROOT / "category"
INDEX = ROOT / "products.json"
SAFE_PRODUCT = re.compile(r"^\.\./product/([a-z0-9]+(?:-[a-z0-9]+)*)\.html$")
PRICE = re.compile(r"(?:\d{1,3}(?:,\d{3})+|\d+)\s*원")


def clean(text: str) -> str:
    return " ".join(html.unescape(text).split())


def safe_relative(value: str, prefix: str) -> str:
    value = value.replace("\\", "/")
    if not value or ":" in value or "?" in value or "#" in value or value.startswith("/"):
        raise ValueError(f"dangerous URL: {value!r}")
    candidate = (ROOT / value).resolve()
    base = (ROOT / prefix).resolve()
    if base != candidate and base not in candidate.parents:
        raise ValueError(f"path escapes {prefix}: {value!r}")
    return value


def select_price(card: dict) -> str:
    def sale_text(element) -> str:
        return clean(" ".join(
            str(text) for text in element.find_all(string=True)
            if not any(parent.name in {"del", "small"} for parent in text.parents)
        ))

    # A bold amount is the explicit final sale price (for example, after a
    # struck-out regular price).  Otherwise read price markup while excluding
    # old/list amounts in <del> and <small>.
    finals = [amount for bold in card["element"].select("b") for amount in PRICE.findall(sale_text(bold))]
    normal = [
        amount
        for price in card["element"].select(".price-final, .price")
        for amount in PRICE.findall(sale_text(price))
    ]
    candidates = finals or normal
    unique = list(dict.fromkeys(candidates))
    if len(unique) != 1:
        raise ValueError(f"ambiguous or missing price for {card['href']!r}; HOLD")
    return unique[0]


def category_cards() -> dict[str, dict]:
    found: dict[str, dict] = {}
    for page in sorted(CATEGORY.glob("*.html")):
        soup = BeautifulSoup(page.read_text(encoding="utf-8"), "html.parser")
        title = soup.find("h1")
        if not title: raise ValueError(f"missing category title: {page.name}")
        category = clean(title.get_text(" ", strip=True))
        for element in soup.select("a.product-card"):
            match = SAFE_PRODUCT.fullmatch(element.get("href", ""))
            if not match: continue
            slug = match.group(1)
            if slug in found: raise ValueError(f"category ambiguity for {slug}: {found[slug]['category']} and {category}")
            picture = element.select_one("img[src]")
            image = safe_relative((picture.get("src", "") if picture else "").replace("../", "", 1), "images")
            name_element = element.find("strong")
            name = clean(name_element.get_text(" ", strip=True) if name_element else "")
            if not name: raise ValueError(f"missing product name for {slug}")
            # Existing indexed rows are preserved exactly; their legacy card text
            # is not reinterpreted. Price parsing is strict only for a new row.
            found[slug] = {"href": element["href"], "category": category, "name": name, "image": image, "element": element}
    return found


def new_row(slug: str, card: dict) -> dict:
    if not (ROOT / card["image"]).is_file():
        raise ValueError(f"missing representative photo for {slug}: {card['image']}")
    source = (PRODUCT / f"{slug}.html").read_text(encoding="utf-8")
    description = ""
    match = re.search(r'<meta\s+[^>]*name=["\']description["\'][^>]*content=["\'](.*?)["\']', source, re.I | re.S)
    if match: description = clean(match.group(1))
    model = re.search(r"(?:^|-)(\d{4,})(?:$|-)", slug)
    return {"id": slug, "name": card["name"], "model": model.group(1) if model else "", "category": card["category"],
            "traits": [], "public_code": "", "price": select_price(card), "description": description,
            "url": f"product/{slug}.html", "image": card["image"]}


def atomic_write(path: Path, content: str) -> None:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", delete=False, dir=path.parent) as handle:
        handle.write(content); temporary = Path(handle.name)
    os.replace(temporary, path)


def main() -> None:
    if not INDEX.is_file() or not PRODUCT.is_dir() or not CATEGORY.is_dir():
        raise ValueError("must run inside a complete local catalog_preview root")
    catalog = json.loads(INDEX.read_text(encoding="utf-8"))
    products = catalog.get("products")
    if not isinstance(products, list) or catalog.get("count") != len(products):
        raise ValueError("invalid products.json schema/count")
    cards = category_cards()
    pages = {p.stem for p in PRODUCT.glob("*.html")}
    existing = [row.get("id") for row in products]
    if len(existing) != len(set(existing)) or any(not isinstance(x, str) for x in existing):
        raise ValueError("duplicate or invalid existing product IDs")
    missing_links = pages - set(cards)
    if missing_links: raise ValueError(f"product page(s) missing category link: {', '.join(sorted(missing_links))}")
    missing_pages = set(existing) - pages
    if missing_pages: raise ValueError(f"indexed product page(s) missing: {', '.join(sorted(missing_pages))}")
    additions = sorted(pages - set(existing))
    for slug in additions:
        products.append(new_row(slug, cards[slug]))
    catalog["count"] = len(products)
    updated_index = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    html_updates = {}
    for page in sorted(PRODUCT.glob("*.html")):
        original = page.read_text(encoding="utf-8")
        updated = inject(original)
        if updated != original: html_updates[page] = updated
    # All parsing and injection validation happened above; writes start only now.
    if updated_index != INDEX.read_text(encoding="utf-8"): atomic_write(INDEX, updated_index)
    for page, content in html_updates.items(): atomic_write(page, content)
    print(f"OK: {len(products)} indexed products; {len(additions)} added; {len(html_updates)} carousel page(s) updated.")


if __name__ == "__main__":
    try: main()
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"HOLD: {exc}", file=sys.stderr); sys.exit(2)
