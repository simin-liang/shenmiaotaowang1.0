# -*- coding: utf-8 -*-
"""遗迹骑行 · 单文件构建脚本

用法：python build.py
输入：src/index.html + src/styles.css + src/game.js + vendor/three.module.js
输出：dist/relic-ride.html 和根目录 index.html（发布到线上用的入口，已在 .gitignore 中排除）
"""
import io
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

def read(path):
    with io.open(os.path.join(ROOT, path), "r", encoding="utf-8") as f:
        return f.read()

html = read("src/index.html")
css = read("src/styles.css")
three = read("vendor/three.module.js")
game = read("src/game.js").replace(
    'import * as THREE from "three";',
    'import * as THREE from "__THREE_URL__";',
)

html = html.replace(
    '<link rel="stylesheet" href="styles.css" />',
    "<style>\n" + css + "\n</style>",
)
start = html.index('  <script type="importmap">')
end = html.index("</body>")

loader = """  <script id="three-src" type="text/plain">
""" + three + """
  </script>
  <script id="game-src" type="text/plain">
""" + game + """
  </script>
  <script type="module">
    const t = document.getElementById("three-src").textContent;
    const tu = URL.createObjectURL(new Blob([t], { type: "text/javascript" }));
    const g = document.getElementById("game-src").textContent.split("__THREE_URL__").join(tu);
    const gu = URL.createObjectURL(new Blob([g], { type: "text/javascript" }));
    await import(gu);
  </script>
"""

out = html[:start] + loader + html[end:]

for target in ("dist/relic-ride.html", "index.html"):
    path = os.path.join(ROOT, target)
    os.makedirs(os.path.dirname(path) or ROOT, exist_ok=True)
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(out)
    print("built:", target, len(out.encode("utf-8")), "bytes")
