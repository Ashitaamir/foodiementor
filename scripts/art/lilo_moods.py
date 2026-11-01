"""Draw Lilo's mood maps (28 x 26 grid) and render a preview PNG."""
import math
import struct
import sys
import zlib

W, H = 28, 26
CX, CY, R = 13.5, 14.5, 10.6

COLORS = {
    'D': (0x7A, 0x12, 0x35), 'R': (0xE8, 0x32, 0x5F), 'P': (0xFF, 0x7F, 0xA3),
    'W': (0xFF, 0xF8, 0xF0), 'K': (0x1B, 0x1B, 0x3A), 'S': (0xFF, 0xFF, 0xFF),
    'B': (0xFF, 0x9E, 0xB8), 'G': (0x3D, 0xDC, 0x84), 'g': (0x1E, 0x8F, 0x55),
    'M': (0x7A, 0x12, 0x35), 'Y': (0xFF, 0xD2, 0x3F), 'Q': (0x5C, 0xC8, 0xFF),
    'L': (0xAE, 0xB4, 0xBE), 'l': (0xF1, 0xF3, 0xF6), 'T': (0xFF, 0x5C, 0x8A),
}
EYE_L, EYE_R = (8, 13), (17, 13)  # top-left of each 3x3 eye


def base():
    m = [['.'] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            d = math.hypot(x - CX, y - CY)
            if d > R:
                continue
            if d > R - 1.15:
                m[y][x] = 'D'
                continue
            face = ((x - CX) / 7.7) ** 2 + ((y - 15.6) / 6.3) ** 2
            if face <= 1:
                m[y][x] = 'W'
            elif (x + 2 * y) % 5 == 0:
                m[y][x] = 'P'
            else:
                m[y][x] = 'R'
    # shine on the shell, top-left
    for x, y in [(7, 7), (8, 6), (9, 6)]:
        m[y][x] = 'S'
    return m


def px(m, x, y, c):
    if 0 <= y < H and 0 <= x < W:
        m[y][x] = c


def rect(m, x, y, w, h, c):
    for j in range(h):
        for i in range(w):
            px(m, x + i, y + j, c)


def leaf(m):
    for x, y, c in [(13, 3, 'g'), (14, 3, 'g'), (14, 2, 'G'), (15, 2, 'G'), (15, 1, 'G'),
                    (16, 1, 'G'), (16, 0, 'g'), (12, 2, 'G'), (11, 2, 'G'), (11, 1, 'g')]:
        px(m, x, y, c)


def open_eyes(m):
    for ex, ey in (EYE_L, EYE_R):
        rect(m, ex, ey, 3, 3, 'K')
        px(m, ex, ey, 'S')


def blush(m):
    rect(m, 5, 17, 3, 1, 'B')
    rect(m, 20, 17, 3, 1, 'B')


def smile(m):
    for x, y in [(12, 18), (13, 19), (14, 19), (15, 18)]:
        px(m, x, y, 'M')


def grin(m):
    rect(m, 11, 18, 6, 1, 'M')
    rect(m, 12, 19, 4, 1, 'M')
    rect(m, 13, 19, 2, 1, 'T')  # tongue


def happy_eyes(m):
    for ex, ey in (EYE_L, EYE_R):
        px(m, ex, ey + 2, 'K')
        px(m, ex + 1, ey + 1, 'K')
        px(m, ex + 2, ey + 2, 'K')


def welcome():
    m = base(); leaf(m); blush(m); happy_eyes(m); grin(m)
    # little arm waving on the right
    for x, y in [(24, 12), (25, 12), (25, 11), (26, 11), (26, 10), (27, 10), (26, 9)]:
        px(m, x, y, 'R')
    for x, y in [(24, 11), (25, 10), (26, 8), (27, 9), (25, 13), (26, 12), (27, 11)]:
        px(m, x, y, 'D')
    return m


def workout():
    m = base(); blush(m)
    # headband across the shell
    for x in range(W):
        if m[8][x] in 'RPS':
            m[8][x] = 'Y'
        if m[9][x] in 'RPS':
            m[9][x] = 'Y'
    for x, y in [(23, 8), (24, 7), (25, 6), (24, 10), (25, 11)]:
        px(m, x, y, 'Y')
    # determined > < eyes, proud teeth grin
    lx, ly = EYE_L
    rx, ry = EYE_R
    for x, y in [(lx, ly), (lx + 1, ly + 1), (lx + 2, ly + 1), (lx, ly + 2),
                 (rx + 2, ry), (rx + 1, ry + 1), (rx, ry + 1), (rx + 2, ry + 2)]:
        px(m, x, y, 'K')
    rect(m, 11, 18, 6, 2, 'M')
    rect(m, 12, 18, 4, 1, 'S')
    # sweat drop
    for x, y in [(22, 11), (21, 12), (22, 12), (21, 13), (22, 13)]:
        px(m, x, y, 'Q')
    # dumbbell lifted overhead, arms up
    rect(m, 3, 1, 22, 1, 'K')
    rect(m, 0, 0, 3, 3, 'K'); rect(m, 25, 0, 3, 3, 'K')
    px(m, 1, 1, 'L'); px(m, 26, 1, 'L')
    rect(m, 5, 2, 1, 6, 'D'); rect(m, 22, 2, 1, 6, 'D')
    leaf(m)
    rect(m, 3, 1, 22, 1, 'K')  # bar in front of the leaf
    return m


def thinking():
    m = base(); leaf(m); blush(m)
    # eyes looking up
    for ex, ey in (EYE_L, EYE_R):
        rect(m, ex, ey - 1, 3, 3, 'K')
        px(m, ex + 2, ey - 1, 'S')
    # small "hmm" mouth to the side
    rect(m, 15, 18, 2, 1, 'M')
    # thought bubble with dots
    rect(m, 18, 0, 10, 5, 'K')
    rect(m, 19, 1, 8, 3, 'W')
    for x in (20, 22, 24):
        px(m, x, 2, 'K')
    px(m, 26, 2, 'W')
    rect(m, 20, 5, 2, 1, 'K'); px(m, 20, 6, 'K')
    # spoon in her hand on the left
    for j, row in enumerate(['.LL.', 'LllL', 'LlLL', 'LLLL', '.LL.']):
        for i, c in enumerate(row):
            if c != '.':
                px(m, i, 7 + j, c)
    rect(m, 1, 12, 2, 7, 'L')
    rect(m, 3, 15, 1, 2, 'D')
    return m


def chef():
    m = base(); blush(m); open_eyes(m); smile(m)
    # puffy chef hat sitting on top
    hat = [
        '..KKK..KKKK..KKK..',
        '.KWWWKKWWWWKKWWWK.',
        'KWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWK',
        '.KWWWWWWWWWWWWWWK.',
        '..KWWWWWWWWWWWWK..',
        '..KLLLLLLLLLLLLK..',
        '..KKKKKKKKKKKKKK..',
    ]
    for j, row in enumerate(hat):
        for i, c in enumerate(row):
            if c != '.':
                px(m, 5 + i, j - 1, c)
    return m


def goal():
    m = base(); leaf(m); blush(m)
    ex, ey = EYE_L
    rect(m, ex, ey, 3, 3, 'K'); px(m, ex, ey, 'S')
    rx, ry = EYE_R
    for x, y in [(rx, ry + 1), (rx + 1, ry + 2), (rx + 2, ry + 1)]:  # winking eye
        px(m, x, y, 'K')
    grin(m)
    for sx, sy in [(2, 4), (25, 6), (1, 19), (26, 20)]:
        for dx, dy in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]:
            px(m, sx + dx, sy + dy, 'Y')
    return m


def sleepy():
    m = base(); leaf(m); blush(m)
    for ex, ey in (EYE_L, EYE_R):
        rect(m, ex, ey + 2, 3, 1, 'K')
    rect(m, 13, 18, 2, 2, 'M')  # little "o" snore
    big_z = ['KKKKK', '...K.', '..K..', '.K...', 'KKKKK']
    small_z = ['KKKK', '..K.', '.K..', 'KKKK']
    for art, ox, oy in [(big_z, 0, 3), (small_z, 6, 0)]:
        for j, row in enumerate(art):
            for i, c in enumerate(row):
                if c != '.':
                    px(m, ox + i, oy + j, c)
    return m


MOODS = {
    'welcome': (welcome, False),   # (draw, eyes can blink)
    'workout': (workout, False),
    'thinking': (thinking, True),
    'chef': (chef, True),
    'goal': (goal, False),
    'sleepy': (sleepy, False),
}


def blink_rows(m, mood):
    """Rows that change when the eyes close, as {rowIndex: row}."""
    shut = [row[:] for row in m]
    lift = 1 if mood == 'thinking' else 0
    for ex, ey in (EYE_L, EYE_R):
        ey -= lift
        rect(shut, ex, ey, 3, 2, 'W')
        rect(shut, ex, ey + 2, 3, 1, 'K')
    return {y: ''.join(shut[y]) for y in range(H) if shut[y] != m[y]}


def png(path, maps, scale=8, gap=2):
    bg = (0xDC, 0xD3, 0xF7)
    cols = len(maps)
    width = (W + gap) * cols * scale
    height = (H + gap) * scale
    rows = []
    for y in range(height):
        row = bytearray([0])
        gy = y // scale - 1
        for x in range(width):
            cell = x // scale
            idx, gx = divmod(cell, W + gap)
            gx -= 1
            c = bg
            if 0 <= gy < H and 0 <= gx < W and idx < cols:
                ch = maps[idx][gy][gx]
                c = COLORS.get(ch, bg)
            row += bytes(c)
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)


def write_ts(path, drawn):
    lines = [
        '// Generated by scripts/art/lilo_moods.py. Change the drawing there and re-run it:',
        '//   python3 scripts/art/lilo_moods.py preview.png src/components/lilo-moods.ts',
        '',
        f"export type LiloMood = {' | '.join(repr(name) for name in drawn)};",
        '',
        'export const MOOD_COLORS: Record<string, string> = {',
    ]
    lines += [f"  {key}: '#{r:02X}{g:02X}{b:02X}'," for key, (r, g, b) in COLORS.items()]
    lines += [
        '};',
        '',
        '// One letter per pixel; `blink` lists the rows that change when the eyes close',
        'export const MOODS: Record<LiloMood, { map: string[]; blink: Record<number, string> }> = {',
    ]
    for name, (m, blink) in drawn.items():
        lines.append(f'  {name}: {{')
        lines.append('    map: [')
        lines += [f"      '{''.join(row)}'," for row in m]
        lines.append('    ],')
        lines.append('    blink: {' + ''.join(f"\n      {y}: '{row}'," for y, row in blink.items())
                     + ('\n    },' if blink else '},'))
        lines.append('  },')
    lines += ['};', '']
    open(path, 'w').write('\n'.join(lines))


if __name__ == '__main__':
    # usage: lilo_moods.py preview.png [output.ts]
    drawn = {}
    for name, (draw, can_blink) in MOODS.items():
        m = draw()
        drawn[name] = (m, blink_rows(m, name) if can_blink else {})
    png(sys.argv[1], [m for m, _ in drawn.values()])
    if len(sys.argv) > 2:
        write_ts(sys.argv[2], drawn)
