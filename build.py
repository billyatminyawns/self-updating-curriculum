#!/usr/bin/env python3
"""Build the demo.
  dist/index.html     self-contained page (audio inlined as data URIs) – open locally, works offline
  dist/artifact.html  same page as a body fragment (no doctype/html/head) for publishing as an Artifact
  docs/index.html     copy of dist/index.html, served by GitHub Pages
Usage: python3 build.py [--no-audio]"""
import base64, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src"); DIST = os.path.join(ROOT, "dist")
os.makedirs(DIST, exist_ok=True)

def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()

content = json.load(open(os.path.join(SRC, "content.json"), encoding="utf-8"))
manifest_path = os.path.join(ROOT, "audio", "manifest.json")
audio = {}
if "--no-audio" not in sys.argv and os.path.exists(manifest_path):
    for key, m in json.load(open(manifest_path)).items():
        p = os.path.join(ROOT, m["file"])
        if not os.path.exists(p):
            continue
        b64 = base64.b64encode(open(p, "rb").read()).decode()
        audio[key] = {"src": "data:audio/mpeg;base64," + b64, "duration": m["duration"], "words": m["words"], "text": m["text"]}

def safe_json(obj):
    # keep </script> from terminating the JSON script blocks
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

tpl = read(os.path.join(SRC, "index.html"))
page = (tpl.replace("/*__CSS__*/", read(os.path.join(SRC, "styles.css")))
           .replace("/*__CONTENT__*/", safe_json(content))
           .replace("/*__AUDIO__*/", safe_json(audio))
           .replace("/*__JS__*/", read(os.path.join(SRC, "app.js"))))

with open(os.path.join(DIST, "artifact.html"), "w", encoding="utf-8") as f:
    f.write(page)
full = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n' + page.split("<header", 1)[0] +
        "</head>\n<body>\n<header" + page.split("<header", 1)[1] + "\n</body>\n</html>\n")
with open(os.path.join(DIST, "index.html"), "w", encoding="utf-8") as f:
    f.write(full)
DOCS = os.path.join(ROOT, "docs"); os.makedirs(DOCS, exist_ok=True)
with open(os.path.join(DOCS, "index.html"), "w", encoding="utf-8") as f:
    f.write(full)
open(os.path.join(DOCS, ".nojekyll"), "w").close()
mb = os.path.getsize(os.path.join(DIST, "index.html")) / 1e6
print(f"built dist/index.html ({mb:.1f} MB) and dist/artifact.html · {len(audio)} audio clips inlined")
