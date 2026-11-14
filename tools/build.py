"""
Empaqueta el juego en UN SOLO archivo  index.html  que se abre con doble clic.

Por seguridad, los navegadores no dejan que una página abierta como file://
cargue otros .js locales ni archivos .glb. Por eso este script:
  1. Une todos los módulos de src/ en un solo <script type="module">.
     Cada módulo queda envuelto en su propia función, así que sus variables no se mezclan.
  2. Incrusta los modelos GLB en base64 (window.EMBEDDED_MODELS).
  3. Incrusta style.css.

Uso (después de modificar algo en src/ o en assets/):
    python tools/build.py
"""
import base64
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "src")
# Orden de dependencias (cada módulo después de los que importa)
ORDER = ["config", "audio", "textures", "effects", "level", "player",
         "weapons", "zombies", "pickups", "hud", "main"]

IMPORT_LOCAL = re.compile(r"^import\s*\{([^}]*)\}\s*from\s*'\./(\w+)\.js';\s*$", re.M)
IMPORT_THREE = re.compile(r"^import .* from 'three(/addons/[^']*)?';\s*$", re.M)
EXPORT_DECL = re.compile(r"^export\s+(class|function|const|let)\s+(\w+)", re.M)


def bundle_js():
    parts = []
    for name in ORDER:
        code = open(os.path.join(SRC, name + ".js"), encoding="utf-8").read()
        code = IMPORT_THREE.sub("", code)
        code = IMPORT_LOCAL.sub(lambda m: f"const {{{m.group(1)}}} = __mod_{m.group(2)};", code)
        exports = [m.group(2) for m in EXPORT_DECL.finditer(code)]
        code = EXPORT_DECL.sub(lambda m: f"{m.group(1)} {m.group(2)}", code)
        assert "export " not in re.sub(r"//.*", "", code), f"export sin procesar en {name}.js"
        parts.append(
            f"// ===== src/{name}.js =====\n"
            f"const __mod_{name} = (() => {{\n{code}\nreturn {{ {', '.join(exports)} }};\n}})();\n")
    header = ("import * as THREE from 'three';\n"
              "import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\n\n")
    return header + "\n".join(parts)


def embedded_models():
    models_dir = os.path.join(ROOT, "assets", "models")
    entries = []
    for f in sorted(os.listdir(models_dir)):
        if f.endswith(".glb"):
            data = base64.b64encode(open(os.path.join(models_dir, f), "rb").read()).decode()
            entries.append(f'  "assets/models/{f}": "{data}"')
    return "window.EMBEDDED_MODELS = {\n" + ",\n".join(entries) + "\n};"


def main():
    html = open(os.path.join(ROOT, "dev.html"), encoding="utf-8").read()
    css = open(os.path.join(ROOT, "style.css"), encoding="utf-8").read()
    js = bundle_js()
    assert "</script" not in js and "</style" not in css

    html = html.replace('<link rel="stylesheet" href="style.css" />', f"<style>\n{css}\n</style>")
    html = re.sub(r"\s*<!-- Versión de desarrollo.*?-->\s*<script type=\"module\" src=\"src/main.js\"></script>",
                  "\n  <script>\n" + embedded_models() + "\n  </script>\n"
                  "  <script type=\"module\">\n" + js + "\n  </script>", html, flags=re.S)
    assert 'src="src/main.js"' not in html, "no se reemplazó el script principal"
    html = html.replace("<html lang=\"es\">",
                        "<html lang=\"es\">\n<!-- ARCHIVO GENERADO por tools/build.py: editar src/ y volver a generar -->", 1)
    out = os.path.join(ROOT, "index.html")
    open(out, "w", encoding="utf-8").write(html)
    open(os.path.join(ROOT, "tools", ".bundle_check.mjs"), "w", encoding="utf-8").write(js)
    print(f"index.html generado ({os.path.getsize(out)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
