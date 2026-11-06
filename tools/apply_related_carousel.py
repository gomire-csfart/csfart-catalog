#!/usr/bin/env python3
"""Idempotently add the shared related-carousel resources to product pages."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PRODUCT_DIR = ROOT / "product"
CSS_TAG = '<link rel="stylesheet" href="../assets/related-carousel.css">'
JS_TAG = '<script src="../assets/related-carousel.js" defer></script>'

def inject(html: str) -> str:
    additions = []
    if CSS_TAG not in html:
        additions.append(CSS_TAG)
    if JS_TAG not in html:
        additions.append(JS_TAG)
    if not additions:
        return html
    match = re.search(r'</head\s*>', html, flags=re.IGNORECASE)
    if not match:
        raise ValueError('missing </head>')
    return html[:match.start()] + '\n' + '\n'.join(additions) + '\n' + html[match.start():]

def main() -> None:
    pages = sorted(PRODUCT_DIR.glob('*.html'))
    for page in pages:
        original = page.read_text(encoding='utf-8')
        updated = inject(original)
        if updated != original:
            page.write_text(updated, encoding='utf-8', newline='')
    print(f'Processed {len(pages)} product HTML files.')

if __name__ == '__main__':
    main()
