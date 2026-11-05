"""Genera le icone dell'estensione: "Pagina con pin" (finestra del browser con tre puntine colorate).

Nessuna dipendenza: disegna forme vettoriali (coordinate 0..128) con supersampling e scrive PNG a mano.
Il sorgente SVG equivalente è extension/icons/icon.svg.
"""
import math
import os
import struct
import zlib

WHITE = (255, 255, 255)
BORDER = (0xE2, 0xE2, 0xE2)
PAGE = (0xF2, 0xF3, 0xF6)
BAR = (0xE2, 0xE5, 0xEA)
BLOCK = (0xDD, 0xE1, 0xE7)
CORAL = (0xFF, 0x7A, 0x59)
YELLOW = (0xFF, 0xD8, 0x4D)
GREEN = (0x9B, 0xDB, 0x8A)
TEAL = (0x4F, 0xC3, 0xA1)
VIOLET = (0xA9, 0x9B, 0xF0)


def rrect(x, y, w, h, r):
    def inside(px, py):
        if px < x or px > x + w or py < y or py > y + h:
            return False
        cx = min(max(px, x + r), x + w - r)
        cy = min(max(py, y + r), y + h - r)
        return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
    return inside, (x, y, x + w, y + h)


def circle(cx, cy, r):
    return (lambda px, py: (px - cx) ** 2 + (py - cy) ** 2 <= r * r), (cx - r, cy - r, cx + r, cy + r)


def hline(x1, x2, y, width=5):
    return rrect(x1 - width / 2, y - width / 2, x2 - x1 + width, width, width / 2)


def cubic(p0, p1, p2, p3, n=24):
    pts = []
    for i in range(1, n + 1):
        t = i / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t * t
        d = t ** 3
        pts.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return pts


def polygon(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]

    def inside(px, py):
        hit = False
        j = len(pts) - 1
        for i in range(len(pts)):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                hit = not hit
            j = i
        return hit
    return inside, (min(xs), min(ys), max(xs), max(ys))


def pin_outline(x, y, s):
    """Path del pin: M0 50 C-12 36 -26 24 -26 4 a26 26 0 0 1 52 0 c0 20 -14 32 -26 46z (scalato e traslato)."""
    pts = [(0, 50)]
    pts += cubic((0, 50), (-12, 36), (-26, 24), (-26, 4))
    for i in range(1, 33):  # semicerchio superiore da (-26,4) a (26,4)
        a = math.pi + math.pi * i / 32
        pts.append((26 * math.cos(a), 4 + 26 * math.sin(a)))
    pts += cubic((26, 4), (26, 24), (12, 36), (0, 50))
    return [(x + px * s, y + py * s) for px, py in pts]


def pin(color, x, y, s):
    return [(polygon(pin_outline(x, y, s)), color), (circle(x, y + 4 * s, 10 * s), WHITE)]


SHAPES = [
    (rrect(4, 4, 120, 120, 29), BORDER),        # bordo del riquadro
    (rrect(6, 6, 116, 116, 27), WHITE),         # riquadro
    (rrect(16, 22, 96, 84, 12), PAGE),          # pagina
    (rrect(16, 22, 96, 18, 9), BAR),            # barra del browser
    (circle(28, 31, 4), CORAL),
    (circle(40, 31, 4), YELLOW),
    (circle(52, 31, 4), GREEN),
    (rrect(26, 50, 44, 26, 6), BLOCK),          # immagine
    (hline(78, 102, 56), BLOCK),
    (hline(78, 102, 66), BLOCK),
    (hline(26, 102, 88), BLOCK),
    (hline(26, 102, 96), BLOCK),
    *pin(CORAL, 46, 52, .42),
    *pin(TEAL, 92, 60, .36),
    *pin(VIOLET, 74, 84, .32),
]


def render(size, ss=4):
    rows = []
    k = 128 / size
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            r = g = b = a = 0.0
            for sj in range(ss):
                for si in range(ss):
                    px = (i + (si + .5) / ss) * k
                    py = (j + (sj + .5) / ss) * k
                    col = None
                    for (inside, (x0, y0, x1, y1)), c in SHAPES:
                        if x0 <= px <= x1 and y0 <= py <= y1 and inside(px, py):
                            col = c
                    if col:
                        r += col[0]; g += col[1]; b += col[2]; a += 1
            n = ss * ss
            row += bytes([int(r / a) if a else 0, int(g / a) if a else 0, int(b / a) if a else 0, int(255 * a / n)])
        rows.append(bytes(row))

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'extension', 'icons')
    os.makedirs(out, exist_ok=True)
    for s in (16, 32, 48, 128):
        with open(os.path.join(out, f'icon{s}.png'), 'wb') as f:
            f.write(render(s))
    print('icone generate')
