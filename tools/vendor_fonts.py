#!/usr/bin/env python3
"""Download Google Fonts woff2 files and build a local fonts.css (offline-first)."""
import re, os, urllib.request, pathlib

CSS_URL = ("https://fonts.googleapis.com/css2?"
           "family=IBM+Plex+Mono:wght@500;600"
           "&family=IBM+Plex+Sans:wght@400;500;600;700"
           "&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700"
           "&display=swap")
KEEP_SUBSETS = {"latin", "latin-ext", "arabic"}
OUT = pathlib.Path("assets/fonts")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=30).read()

css = fetch(CSS_URL).decode("utf-8")
OUT.mkdir(parents=True, exist_ok=True)

# Blocks look like: /* latin */\n@font-face { font-family: ... src: url(...) ...}
blocks = re.findall(r"/\*\s*([a-z-]+)\s*\*/\s*(@font-face\s*\{[^}]+\})", css)
out_css, n = [], 0
for subset, block in blocks:
    if subset not in KEEP_SUBSETS:
        continue
    fam = re.search(r"font-family:\s*'([^']+)'", block).group(1)
    wgt = re.search(r"font-weight:\s*(\d+)", block).group(1)
    url = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
    fname = f"{fam.replace(' ', '')}-{wgt}-{subset}.woff2"
    fpath = OUT / fname
    if not fpath.exists():
        fpath.write_bytes(fetch(url))
    block = block.replace(url, f"fonts/{fname}")
    out_css.append(f"/* {subset}: {fam} {wgt} */\n{block}")
    n += 1
    print(f"OK {fname} ({fpath.stat().st_size} B)")

header = ("/* Vendored from Google Fonts - IBM Plex Sans / IBM Plex Sans Arabic / IBM Plex Mono\n"
          "   Subsets: latin, latin-ext, arabic. Generated for offline use. */\n")
pathlib.Path("assets/fonts.css").write_text(header + "\n".join(out_css) + "\n", encoding="utf-8")
print(f"\n{n} faces -> assets/fonts.css")
