#!/usr/bin/env python3
"""Build an offline single-file preview from the readable Aqua source files."""
from pathlib import Path
import base64
import mimetypes
import re

root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text(encoding='utf-8')


def embed_assets(content):
    def substitute(match):
        path = root / match.group(0)
        if not path.is_file():
            raise FileNotFoundError(path)
        mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        return f'data:{mime};base64,{base64.b64encode(path.read_bytes()).decode("ascii")}'
    return re.sub(r'assets/[A-Za-z0-9._/-]+', substitute, content)


def stylesheet(match):
    name = match.group(1).split('?', 1)[0]
    content = embed_assets((root / name).read_text(encoding='utf-8'))
    if re.search(r'</style', content, re.I):
        raise ValueError(f'Unexpected closing style tag in {name}')
    return f'<style>\n/* {name}: edit the source file, then rebuild. */\n{content}\n</style>'


def script(match):
    name = match.group(1).split('?', 1)[0]
    content = embed_assets((root / name).read_text(encoding='utf-8'))
    if re.search(r'</script', content, re.I):
        raise ValueError(f'Unexpected closing script tag in {name}')
    return f'<script>\n/* {name}: edit the source file, then rebuild. */\n{content}\n</script>'


html = re.sub(r'<link\s+rel="preload".*?/>', '', html, flags=re.S)
html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>', stylesheet, html)
html = re.sub(r'<script\s+src="([^"]+)"></script>', script, html)
html = embed_assets(html)
html = html.replace('<div id="app"></div>', '''<div id="app"><div style="padding:32px;font:16px/1.5 sans-serif;color:#e6ebf7;background:#111214;min-height:100vh">
    Aqua не удалось запустить. Включите JavaScript в браузере и откройте файл заново. Если страница всё ещё не работает, попробуйте другой браузер или откройте прототип через локальный сервер.
    </div></div>''')
(root / 'aqua-standalone.html').write_text(html, encoding='utf-8')
print('Built aqua-standalone.html')
