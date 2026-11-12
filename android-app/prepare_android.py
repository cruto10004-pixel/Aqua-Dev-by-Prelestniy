"""Подготовка созданного Capacitor-проекта: разрешения микрофона и иконка приложения.
Запускается из android-app/ после `npx cap add android`. Нужен Pillow (pip install pillow)."""
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "android/app/src/main/AndroidManifest.xml"
RES = ROOT / "android/app/src/main/res"
ICON = ROOT.parent / "frontend/assets/icon-512.png"
PERMS = ["android.permission.INTERNET", "android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS",
         "android.permission.POST_NOTIFICATIONS"]


def patch_manifest() -> None:
    text = MANIFEST.read_text(encoding="utf-8")
    add = "".join(f'    <uses-permission android:name="{p}" />\n' for p in PERMS if p not in text)
    if add:
        text = re.sub(r"</manifest>", add + "</manifest>", text, count=1)
        MANIFEST.write_text(text, encoding="utf-8")
    final = MANIFEST.read_text(encoding="utf-8")
    missing = [p for p in PERMS if p not in final]
    if missing:
        sys.exit(f"Не удалось добавить разрешения: {missing}")
    print("manifest ok")


def make_icons() -> None:
    shutil.rmtree(RES / "mipmap-anydpi-v26", ignore_errors=True)   # адаптивные значки Capacitor → используем обычные PNG
    src = Image.open(ICON).convert("RGBA")
    for density, size in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        folder = RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        icon = src.resize((size, size), Image.LANCZOS)
        for name in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
            icon.save(folder / name)
    print("icons ok")


if __name__ == "__main__":
    patch_manifest()
    make_icons()
