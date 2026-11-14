"""
Generador de modelos GLB low-poly para "Operación Extracción".

Construye los modelos a partir de cajas (estilo retro de los 90) y los escribe
en formato glTF binario (.glb) usando solo la librería estándar de Python.

Cada modelo se organiza en NODOS con nombre (Hips, Torso, Head, ArmL, ...)
para que el juego pueda animarlos por código (caminar, brazos estirados, etc.).

Uso:
    python tools/generate_models.py
Genera los archivos en  assets/models/
"""
import json
import math
import os
import struct

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "models")


# ----------------------------------------------------------------------------
# Utilidades de color y geometría
# ----------------------------------------------------------------------------
def hex_to_linear(h):
    """'#rrggbb' (sRGB) -> tupla lineal (glTF guarda colores en espacio lineal)."""
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(v ** 2.2 for v in c)


def rot_matrix(rx=0.0, ry=0.0, rz=0.0):
    """Matriz de rotación 3x3 (orden X, luego Y, luego Z)."""
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    mx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
    my = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
    mz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]

    def mul(a, b):
        return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]

    return mul(mz, mul(my, mx))


def apply(m, v):
    return tuple(sum(m[i][k] * v[k] for k in range(3)) for i in range(3))


class Part:
    """Geometría acumulada de un nodo, agrupada por material."""

    def __init__(self):
        self.prims = {}  # material -> {pos, nor, col, idx}

    def box(self, center, size, color, mat="Base", rot=(0, 0, 0)):
        p = self.prims.setdefault(mat, {"pos": [], "nor": [], "col": [], "idx": []})
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        m = rot_matrix(*rot)
        col = hex_to_linear(color)
        # 6 caras con normales planas (look facetado de los 90)
        faces = [
            ((1, 0, 0), [(hx, -hy, hz), (hx, -hy, -hz), (hx, hy, -hz), (hx, hy, hz)]),
            ((-1, 0, 0), [(-hx, -hy, -hz), (-hx, -hy, hz), (-hx, hy, hz), (-hx, hy, -hz)]),
            ((0, 1, 0), [(-hx, hy, hz), (hx, hy, hz), (hx, hy, -hz), (-hx, hy, -hz)]),
            ((0, -1, 0), [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, -hy, hz), (-hx, -hy, hz)]),
            ((0, 0, 1), [(-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]),
            ((0, 0, -1), [(hx, -hy, -hz), (-hx, -hy, -hz), (-hx, hy, -hz), (hx, hy, -hz)]),
        ]
        for n, verts in faces:
            base = len(p["pos"])
            nn = apply(m, n)
            # ligera variación de tono por cara para dar volumen sin texturas
            shade = 1.0 if n[1] >= 0 else 0.8
            for v in verts:
                rv = apply(m, v)
                p["pos"].append((rv[0] + center[0], rv[1] + center[1], rv[2] + center[2]))
                p["nor"].append(nn)
                p["col"].append(tuple(c * shade for c in col))
            p["idx"] += [base, base + 1, base + 2, base, base + 2, base + 3]
        return self


class Node:
    def __init__(self, name, translation=(0, 0, 0), part=None, children=None):
        self.name = name
        self.translation = translation
        self.part = part
        self.children = children or []


# ----------------------------------------------------------------------------
# Escritor GLB
# ----------------------------------------------------------------------------
def write_glb(path, root, materials):
    """materials: dict nombre -> dict de material glTF (pbrMetallicRoughness...)."""
    gltf = {
        "asset": {"version": "2.0", "generator": "operacion-extraccion/generate_models.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [],
        "meshes": [],
        "materials": [],
        "accessors": [],
        "bufferViews": [],
        "buffers": [],
    }
    mat_index = {}
    for name, mdef in materials.items():
        mat_index[name] = len(gltf["materials"])
        gltf["materials"].append(dict(name=name, **mdef))

    blob = bytearray()

    def add_view(data, target):
        while len(blob) % 4:
            blob.append(0)
        off = len(blob)
        blob.extend(data)
        gltf["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(data), "target": target})
        return len(gltf["bufferViews"]) - 1

    def add_vec3(values, with_minmax=False):
        data = b"".join(struct.pack("<3f", *v) for v in values)
        view = add_view(data, 34962)
        acc = {"bufferView": view, "componentType": 5126, "count": len(values), "type": "VEC3"}
        if with_minmax:
            acc["min"] = [min(v[i] for v in values) for i in range(3)]
            acc["max"] = [max(v[i] for v in values) for i in range(3)]
        gltf["accessors"].append(acc)
        return len(gltf["accessors"]) - 1

    def add_indices(idx):
        big = max(idx) > 65535
        fmt = "<I" if big else "<H"
        data = b"".join(struct.pack(fmt, i) for i in idx)
        view = add_view(data, 34963)
        gltf["accessors"].append({
            "bufferView": view, "componentType": 5125 if big else 5123,
            "count": len(idx), "type": "SCALAR"})
        return len(gltf["accessors"]) - 1

    def add_node(node):
        ni = len(gltf["nodes"])
        nd = {"name": node.name}
        gltf["nodes"].append(nd)
        if any(node.translation):
            nd["translation"] = list(node.translation)
        if node.part and node.part.prims:
            prims = []
            for mname, p in node.part.prims.items():
                prims.append({
                    "attributes": {
                        "POSITION": add_vec3(p["pos"], True),
                        "NORMAL": add_vec3(p["nor"]),
                        "COLOR_0": add_vec3(p["col"]),
                    },
                    "indices": add_indices(p["idx"]),
                    "material": mat_index[mname],
                })
            gltf["meshes"].append({"name": node.name + "_mesh", "primitives": prims})
            nd["mesh"] = len(gltf["meshes"]) - 1
        if node.children:
            nd["children"] = [add_node(c) for c in node.children]
        return ni

    add_node(root)
    while len(blob) % 4:
        blob.append(0)
    gltf["buffers"].append({"byteLength": len(blob)})

    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(js) % 4:
        js += b" "
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON"))
        f.write(js)
        f.write(struct.pack("<I4s", len(blob), b"BIN\x00"))
        f.write(blob)
    print(f"  {os.path.basename(path):22s} {total/1024:6.1f} KB")


def mat_base(rough=0.9, metal=0.0):
    return {"pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": metal, "roughnessFactor": rough}}


def mat_glow(color):
    c = hex_to_linear(color)
    return {"pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 1},
            "emissiveFactor": list(c)}


# ----------------------------------------------------------------------------
# Modelos
# ----------------------------------------------------------------------------
def zombie_soldier():
    """Zombi soldado (uniforme caqui, piel verdosa). Mira hacia +Z."""
    skin, skin_d = "#8fa86a", "#6b8048"
    cloth, cloth_d = "#6e6a3e", "#55522f"
    blood = "#7a1010"
    boot = "#2b2620"

    head = Part()
    head.box((0, 0.16, 0), (0.30, 0.32, 0.30), skin)
    head.box((0, 0.33, -0.02), (0.32, 0.08, 0.32), cloth_d)          # casco/gorra
    head.box((0, 0.02, 0.10), (0.20, 0.06, 0.12), skin_d)            # mandíbula
    head.box((0.04, 0.0, 0.155), (0.10, 0.05, 0.02), blood)          # boca
    head.box((0.075, 0.18, 0.152), (0.07, 0.05, 0.02), "#ff2a2a", mat="Eyes")
    head.box((-0.075, 0.18, 0.152), (0.07, 0.05, 0.02), "#ff2a2a", mat="Eyes")

    torso = Part()
    torso.box((0, 0.30, 0), (0.52, 0.60, 0.28), cloth)
    torso.box((0, 0.02, 0), (0.50, 0.08, 0.30), "#3a3424")           # cinturón
    torso.box((0.10, 0.38, 0.145), (0.16, 0.18, 0.02), blood)        # mancha de sangre
    torso.box((-0.13, 0.20, 0.145), (0.12, 0.10, 0.03), cloth_d)     # bolsillo
    torso.box((0, 0.58, 0), (0.14, 0.06, 0.14), skin_d)              # cuello

    def arm(side):
        a = Part()
        a.box((0, -0.15, 0), (0.15, 0.32, 0.16), cloth)
        a.box((0, -0.43, 0), (0.12, 0.28, 0.12), skin)
        a.box((0, -0.62, 0.02), (0.13, 0.12, 0.10), skin_d)          # mano
        if side < 0:
            a.box((0, -0.30, 0.07), (0.13, 0.08, 0.03), blood)
        return a

    def leg(side):
        l = Part()
        l.box((0, -0.24, 0), (0.19, 0.50, 0.21), cloth_d)
        l.box((0, -0.66, 0), (0.17, 0.36, 0.19), cloth)
        l.box((0, -0.88, 0.04), (0.19, 0.12, 0.28), boot)
        return l

    hips = Part().box((0, 0, 0), (0.46, 0.18, 0.26), cloth_d)
    return Node("Zombie", children=[
        Node("Hips", (0, 0.96, 0), hips, [
            Node("Torso", (0, 0.06, 0), torso, [
                Node("Head", (0, 0.62, 0), head),
                Node("ArmL", (0.34, 0.54, 0), arm(1)),
                Node("ArmR", (-0.34, 0.54, 0), arm(-1)),
            ]),
            Node("LegL", (0.12, -0.04, 0), leg(1)),
            Node("LegR", (-0.12, -0.04, 0), leg(-1)),
        ])
    ])


def zombie_scientist():
    """Zombi científico (bata de laboratorio). Más delgado: se usa para los 'corredores'."""
    skin, skin_d = "#a7b98a", "#7c8f5e"
    coat, coat_d = "#cfcfc0", "#a3a393"
    pants = "#2f3a4a"
    blood = "#8a0d0d"

    head = Part()
    head.box((0, 0.15, 0), (0.27, 0.30, 0.27), skin)
    head.box((0, 0.31, -0.03), (0.28, 0.06, 0.26), "#3b2a1a")       # pelo
    head.box((0, 0.17, 0.142), (0.24, 0.04, 0.02), "#222222")        # gafas
    head.box((0, 0.03, 0.12), (0.12, 0.05, 0.04), blood)
    head.box((0.065, 0.17, 0.152), (0.06, 0.035, 0.02), "#ff3b1f", mat="Eyes")
    head.box((-0.065, 0.17, 0.152), (0.06, 0.035, 0.02), "#ff3b1f", mat="Eyes")

    torso = Part()
    torso.box((0, 0.30, 0), (0.44, 0.60, 0.24), coat)
    torso.box((0, 0.30, 0.125), (0.06, 0.58, 0.02), coat_d)
    torso.box((-0.10, 0.25, 0.13), (0.20, 0.26, 0.02), blood)
    torso.box((0.12, 0.42, 0.13), (0.08, 0.10, 0.02), "#4466aa")     # credencial
    torso.box((0, 0.58, 0), (0.12, 0.06, 0.12), skin_d)

    def arm():
        a = Part()
        a.box((0, -0.16, 0), (0.12, 0.34, 0.13), coat)
        a.box((0, -0.44, 0), (0.10, 0.26, 0.10), skin)
        a.box((0, -0.62, 0.02), (0.11, 0.11, 0.09), skin_d)
        return a

    def leg():
        l = Part()
        l.box((0, -0.12, 0), (0.20, 0.26, 0.21), coat)                # faldón de bata
        l.box((0, -0.50, 0), (0.15, 0.56, 0.17), pants)
        l.box((0, -0.86, 0.04), (0.16, 0.10, 0.25), "#1c1c1c")
        return l

    hips = Part().box((0, 0, 0), (0.40, 0.16, 0.22), coat_d)
    return Node("Zombie", children=[
        Node("Hips", (0, 0.92, 0), hips, [
            Node("Torso", (0, 0.06, 0), torso, [
                Node("Head", (0, 0.62, 0), head),
                Node("ArmL", (0.29, 0.54, 0), arm()),
                Node("ArmR", (-0.29, 0.54, 0), arm()),
            ]),
            Node("LegL", (0.11, -0.04, 0), leg()),
            Node("LegR", (-0.11, -0.04, 0), leg()),
        ])
    ])


def pistol():
    """Pistola 9mm. Mira hacia -Z (hacia adelante de la cámara)."""
    metal, metal_d, grip = "#4a4f57", "#2c3036", "#3a2a1e"
    p = Part()
    p.box((0, 0.05, -0.12), (0.06, 0.06, 0.30), metal)                # corredera
    p.box((0, 0.012, -0.10), (0.05, 0.03, 0.24), metal_d)             # armazón
    p.box((0, 0.05, -0.275), (0.025, 0.025, 0.02), "#15171a")          # boca del cañón
    p.box((0, 0.085, -0.25), (0.012, 0.015, 0.015), "#c9c9c9")         # mira delantera
    p.box((0, 0.085, 0.01), (0.04, 0.015, 0.015), "#c9c9c9")           # mira trasera
    p.box((0, -0.07, 0.0), (0.05, 0.16, 0.07), grip, rot=(-0.25, 0, 0))  # empuñadura
    p.box((0, -0.03, -0.07), (0.015, 0.05, 0.06), metal_d)            # guardamonte
    for i in range(4):                                                 # estrías
        p.box((0.031, 0.06, -0.01 - i * 0.02), (0.004, 0.035, 0.008), metal_d)
    return Node("Pistol", children=[
        Node("Body", (0, 0, 0), p),
        Node("Muzzle", (0, 0.05, -0.30)),
    ])


def plasma_rifle():
    """Rifle de plasma rojo con celdas verdes y mira circular (inspirado en la captura)."""
    red, red_d, red_l = "#9a1c12", "#6a120c", "#c0392b"
    gold, green = "#d8a020", "#3cff5a"
    body = Part()
    body.box((0, 0, -0.05), (0.16, 0.14, 0.50), red)                  # cuerpo
    body.box((0, -0.02, -0.38), (0.12, 0.10, 0.20), red_d)            # cañón
    body.box((0, 0.075, -0.05), (0.12, 0.02, 0.44), red_l)            # lomo
    body.box((0, -0.12, 0.10), (0.07, 0.16, 0.09), red_d, rot=(-0.3, 0, 0))  # empuñadura
    body.box((0, -0.04, 0.24), (0.13, 0.11, 0.10), red_d)             # culata
    for i in range(4):                                                 # placas
        body.box((0.082, 0.0, 0.12 - i * 0.11), (0.006, 0.10, 0.07), red_l)
        body.box((-0.082, 0.0, 0.12 - i * 0.11), (0.006, 0.10, 0.07), red_l)
    # celdas de energía verdes
    for i in range(3):
        body.box((0.085, 0.03, -0.02 - i * 0.07), (0.03, 0.04, 0.05), green, mat="Plasma")
    body.box((0, -0.02, -0.485), (0.08, 0.06, 0.012), green, mat="Plasma")  # emisor
    # mira circular (octógono de cajas) sobre un poste
    body.box((0, 0.13, -0.18), (0.015, 0.10, 0.015), gold)
    ring_c, r = (0, 0.24, -0.18), 0.065
    for k in range(8):
        a = k * math.pi / 4
        body.box((ring_c[0] + r * math.cos(a), ring_c[1] + r * math.sin(a), ring_c[2]),
                 (0.054, 0.016, 0.016), gold, rot=(0, 0, a + math.pi / 2))
    body.box(ring_c, (0.008, 0.07, 0.004), "#ff3cc8", mat="Reticle")
    body.box(ring_c, (0.07, 0.008, 0.004), "#ff3cc8", mat="Reticle")
    return Node("PlasmaRifle", children=[
        Node("Body", (0, 0, 0), body),
        Node("Muzzle", (0, -0.02, -0.50)),
    ])


def ammo_box():
    p = Part()
    p.box((0, 0.16, 0), (0.62, 0.32, 0.38), "#4f5a2a")
    p.box((0, 0.33, 0), (0.64, 0.04, 0.40), "#3c4520")
    p.box((0, 0.17, 0.195), (0.62, 0.07, 0.01), "#e0b020")
    p.box((0, 0.17, -0.195), (0.62, 0.07, 0.01), "#e0b020")
    p.box((0, 0.37, 0), (0.18, 0.04, 0.05), "#2a2a2a")                 # asa
    for i in range(5):                                                 # balas encima
        p.box((-0.2 + i * 0.1, 0.40, 0.1), (0.04, 0.08, 0.04), "#c8a040")
    return Node("AmmoBox", children=[Node("Body", (0, 0, 0), p)])


def plasma_cell():
    p = Part()
    p.box((0, 0.05, 0), (0.30, 0.10, 0.30), "#3a3a3a")
    p.box((0, 0.50, 0), (0.30, 0.10, 0.30), "#3a3a3a")
    for a in (0, math.pi / 2):
        p.box((0, 0.27, 0), (0.05, 0.40, 0.32), "#555555", rot=(0, a, 0))
    p.box((0, 0.27, 0), (0.20, 0.38, 0.20), "#3cff5a", mat="Plasma")
    return Node("PlasmaCell", children=[Node("Body", (0, 0, 0), p)])


def adrenaline():
    p = Part()
    p.box((0, 0.25, 0), (0.12, 0.34, 0.12), "#30a0ff", mat="Boost")
    p.box((0, 0.45, 0), (0.15, 0.06, 0.15), "#dddddd")
    p.box((0, 0.52, 0), (0.04, 0.10, 0.04), "#dddddd")
    p.box((0, 0.05, 0), (0.15, 0.06, 0.15), "#dddddd")
    p.box((0, -0.04, 0), (0.015, 0.14, 0.015), "#cccccc")
    return Node("Adrenaline", children=[Node("Body", (0, 0, 0), p)])


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Generando modelos GLB en", os.path.abspath(OUT_DIR))
    write_glb(os.path.join(OUT_DIR, "zombie_soldier.glb"), zombie_soldier(),
              {"Base": mat_base(), "Eyes": mat_glow("#ff2020")})
    write_glb(os.path.join(OUT_DIR, "zombie_scientist.glb"), zombie_scientist(),
              {"Base": mat_base(), "Eyes": mat_glow("#ff3010")})
    write_glb(os.path.join(OUT_DIR, "pistol.glb"), pistol(),
              {"Base": mat_base(0.5, 0.6)})
    write_glb(os.path.join(OUT_DIR, "plasma_rifle.glb"), plasma_rifle(),
              {"Base": mat_base(0.6, 0.3), "Plasma": mat_glow("#30ff50"), "Reticle": mat_glow("#ff30c0")})
    write_glb(os.path.join(OUT_DIR, "ammo_box.glb"), ammo_box(), {"Base": mat_base()})
    write_glb(os.path.join(OUT_DIR, "plasma_cell.glb"), plasma_cell(),
              {"Base": mat_base(0.5, 0.5), "Plasma": mat_glow("#30ff50")})
    write_glb(os.path.join(OUT_DIR, "adrenaline.glb"), adrenaline(),
              {"Base": mat_base(), "Boost": mat_glow("#2080ff")})
    print("Listo.")
