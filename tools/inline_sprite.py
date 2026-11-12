#!/usr/bin/env python3
"""Вставляет спрайт frontend/assets/icons.svg внутрь HTML-файлов.

Иконки подключаются инлайном (а не <use href="icons.svg#...">), потому что
внешние спрайты не работают при открытии через file:// и дают мигание при загрузке.

Запуск из корня проекта:  python3 tools/inline_sprite.py
Заменяет содержимое <svg id="icon-sprite" ...> ... </svg> в index.html и icons-demo.html.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "frontend"
sprite = (ROOT / "assets" / "icons.svg").read_text(encoding="utf-8")

# Берём только <symbol>…</symbol> (без внешней обёртки и комментариев)
symbols = "\n".join(re.findall(r"<symbol.*?</symbol>", sprite, flags=re.S))
block = (
    '<svg id="icon-sprite" width="0" height="0" style="position:absolute" '
    'aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">\n'
    + symbols + "\n</svg>"
)
pattern = re.compile(r'<svg id="icon-sprite".*?</svg>', re.S)

for name in ("index.html", "icons-demo.html"):
    path = ROOT / name
    if not path.exists():
        continue
    html = path.read_text(encoding="utf-8")
    if not pattern.search(html):
        sys.exit(f"{name}: не найден <svg id=\"icon-sprite\">")
    # lambda — чтобы обратные слэши в SVG не трактовались как escape-последовательности
    path.write_text(pattern.sub(lambda _m: block, html, count=1), encoding="utf-8")
    print("обновлён", name)
