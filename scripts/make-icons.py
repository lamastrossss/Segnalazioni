"""Genera le icone dell'estensione (quadrato nero arrotondato con un pin bianco). Nessuna dipendenza."""
import math
import os
import struct
import zlib


def shape(x, y):
    """Coordinate normalizzate 0..1. Restituisce 'bg', 'pin', 'hole' o None (trasparente)."""
    r = 0.22  # raggio degli angoli
    cx = min(max(x, r), 1 - r)
    cy = min(max(y, r), 1 - r)
    if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
        return None
    px, py, pr = 0.5, 0.42, 0.21  # testa del pin
    d = math.hypot(x - px, y - py)
    if d <= pr:
        return 'hole' if d <= pr * 0.42 else 'pin'
    tip = 0.80  # punta del pin
    if py <= y <= tip:
        half = pr * (tip - y) / (tip - py) * 0.95
        if abs(x - px) <= half:
            return 'pin'
    return 'bg'


COL = {'bg': (17, 17, 17, 255), 'pin': (255, 255, 255, 255), 'hole': (17, 17, 17, 255), None: (0, 0, 0, 0)}


def png(size, ss=4):
    rows = []
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            acc = [0, 0, 0, 0]
            for sj in range(ss):
                for si in range(ss):
                    c = COL[shape((i + (si + .5) / ss) / size, (j + (sj + .5) / ss) / size)]
                    for k in range(3):
                        acc[k] += c[k] * c[3]
                    acc[3] += c[3]
            rgb = [int(acc[k] / acc[3]) if acc[3] else 0 for k in range(3)]
            row += bytes(rgb + [int(acc[3] / (ss * ss))])
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
            f.write(png(s))
    print('icone generate')
