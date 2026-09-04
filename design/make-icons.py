#!/usr/bin/env python3
"""Иконки приложения без внешних зависимостей: SDF-рендер + свой PNG-энкодер."""
import zlib, struct, math, os

MAGENTA = (255, 45, 138)
CYAN = (0, 224, 255)
WHITE = (255, 255, 255)

def write_png(path, n, buf):
    raw = bytearray()
    for y in range(n):
        raw.append(0)
        raw += buf[y * n * 3:(y + 1) * n * 3]
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    out = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(out)

def render(n):
    buf = bytearray(n * n * 3)
    rings = [(0.5, 0.288, 0.176, 0.050, MAGENTA), (0.5, 0.712, 0.176, 0.050, CYAN)]
    puck = (0.5, 0.5, 0.104)
    for y in range(n):
        fy = (y + 0.5) / n
        for x in range(n):
            fx = (x + 0.5) / n
            # фон: мягкий подъём к центру
            d = math.hypot(fx - 0.5, fy - 0.5) / 0.707
            k = min(1.0, d)
            r = 13 + (4 - 13) * k
            g = 20 + (5 - 20) * k
            b = 36 + (10 - 36) * k
            # кольца бит: свечение + чёткий штрих
            for (rx, ry, rad, th, col) in rings:
                dist = math.hypot(fx - rx, fy - ry)
                glow = math.exp(-((dist - rad) ** 2) / (2 * 0.052 ** 2))
                r += col[0] * glow * 0.42
                g += col[1] * glow * 0.42
                b += col[2] * glow * 0.42
                cov = max(0.0, min(1.0, (th / 2 - abs(dist - rad)) * n + 0.5))
                if cov > 0:
                    r += (col[0] - r) * cov
                    g += (col[1] - g) * cov
                    b += (col[2] - b) * cov
            # шайба
            dist = math.hypot(fx - puck[0], fy - puck[1])
            glow = math.exp(-((dist - puck[2]) ** 2) / (2 * 0.062 ** 2))
            r += 190 * glow * 0.5; g += 225 * glow * 0.5; b += 255 * glow * 0.5
            cov = max(0.0, min(1.0, (puck[2] - dist) * n + 0.5))
            if cov > 0:
                r += (255 - r) * cov; g += (255 - g) * cov; b += (255 - b) * cov
            i = (y * n + x) * 3
            buf[i] = int(max(0, min(255, r)))
            buf[i + 1] = int(max(0, min(255, g)))
            buf[i + 2] = int(max(0, min(255, b)))
    return buf

if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__), '..', 'icons')
    os.makedirs(out, exist_ok=True)
    for size in (180, 192, 512):
        write_png(os.path.join(out, f'icon-{size}.png'), size, render(size))
        print('icon-%d.png' % size)
