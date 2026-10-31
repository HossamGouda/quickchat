#!/usr/bin/env python3
"""Assemble the Capacitor web bundle (www/) from the app shell.

Copies exactly the files the service worker precaches plus the manifest and
install screenshots — the same set GitHub Pages serves — so the native app
and the PWA always run identical code. Run after any app change, before
`npx cap sync`."""
import pathlib, shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "www"

FILES = ["index.html", "styles.css", "sw.js", "qrcode.js", "manifest.webmanifest",
         "icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png",
         "apple-touch-icon.png", "screenshot-chat.png", "screenshot-followups.png"]
DIRS = ["js", "assets"]

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()
for f in FILES:
    shutil.copy2(ROOT / f, OUT / f)
for d in DIRS:
    shutil.copytree(ROOT / d, OUT / d)
print(f"www/ assembled: {len(FILES)} files + {len(DIRS)} dirs")
