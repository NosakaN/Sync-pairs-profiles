#!/usr/bin/env python3
from pathlib import Path
import shutil, sys

HERE = Path(__file__).resolve().parent.parent
ASSET_VERSION = "pmex-level-18"

if len(sys.argv) != 3:
    raise SystemExit("Usage: build_site.py <upstream-folder> <output-folder>")

upstream = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
if not (upstream / "index.html").exists():
    raise SystemExit("Upstream index.html not found")
if output.exists():
    shutil.rmtree(output)
shutil.copytree(upstream, output, ignore=shutil.ignore_patterns(".git", ".github"))
(output / "js").mkdir(exist_ok=True)
(output / "css").mkdir(exist_ok=True)
shutil.copy2(HERE / "overlay/js/profile-manager.js", output / "js/profile-manager.js")
shutil.copy2(HERE / "overlay/css/profile-manager.css", output / "css/profile-manager.css")
shutil.copy2(HERE / "overlay/js/pair-levels.js", output / "js/pair-levels.js")
shutil.copy2(HERE / "overlay/css/pair-levels.css", output / "css/pair-levels.css")

index = output / "index.html"
html = index.read_text(encoding="utf-8")
profile_css_tag = f'<link rel="stylesheet" type="text/css" href="css/profile-manager.css?v={ASSET_VERSION}">'
level_css_tag = f'<link rel="stylesheet" type="text/css" href="css/pair-levels.css?v={ASSET_VERSION}">'
profile_js_tag = f'<script type="text/javascript" src="js/profile-manager.js?v={ASSET_VERSION}"></script>'
level_js_tag = f'<script type="text/javascript" src="js/pair-levels.js?v={ASSET_VERSION}"></script>'
css_anchor = '<link rel="stylesheet" type="text/css" id="viewModeCss" href="css/viewmode.css" disabled>'
js_anchor = '<script type="module" src="js/script.js"></script>'

if profile_css_tag not in html:
    if css_anchor not in html:
        raise SystemExit("CSS integration anchor not found")
    html = html.replace(css_anchor, css_anchor + "\n" + profile_css_tag, 1)

if level_css_tag not in html:
    html = html.replace(profile_css_tag, profile_css_tag + "\n" + level_css_tag, 1)

if '<link rel="manifest" href="manifest.webmanifest">' not in html:
    meta = '\n'.join([
        '<link rel="manifest" href="manifest.webmanifest">',
        '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">',
        '<meta http-equiv="Pragma" content="no-cache">',
        '<meta http-equiv="Expires" content="0">',
        '<meta name="apple-mobile-web-app-capable" content="yes">',
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
        '<meta name="apple-mobile-web-app-title" content="Sync Pairs Tracker">'
    ])
    html = html.replace("</head>", meta + "\n</head>", 1)

if profile_js_tag not in html:
    if js_anchor not in html:
        raise SystemExit("JavaScript integration anchor not found")
    html = html.replace(js_anchor, js_anchor + "\n" + profile_js_tag, 1)

if level_js_tag not in html:
    html = html.replace(profile_js_tag, profile_js_tag + "\n" + level_js_tag, 1)

index.write_text(html, encoding="utf-8")
(output / "manifest.webmanifest").write_text(f'''{{
  "name": "Sync Pairs Tracker — Profiles",
  "short_name": "Sync Pairs",
  "description": "Sync Pairs Tracker with local multi-profile support.",
  "start_url": "./?v={ASSET_VERSION}",
  "scope": "./",
  "display": "standalone",
  "background_color": "#eef6f7",
  "theme_color": "#32788c"
}}\n''', encoding="utf-8")
(output / ".nojekyll").write_text("", encoding="utf-8")
print(f"Built site in {output} ({ASSET_VERSION})")
