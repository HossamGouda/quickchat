#!/usr/bin/env python3
"""Generate QuickChat PWA icons: any (192/512), maskable 512, apple-touch 180."""
from PIL import Image, ImageDraw

GREEN = (18, 112, 74, 255)       # #12704a
WHITE = (255, 255, 255, 255)

def rounded(size, radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=GREEN)
    return img, d

def bubble(d, box, r):
    d.rounded_rectangle(box, radius=r, fill=WHITE)

def dots(d, cx, cy, r, gap, n=3):
    for i in range(n):
        x = cx + (i - (n - 1) / 2) * gap
        d.ellipse([x - r, cy - r, x + r, cy + r], fill=GREEN)

def tail(d, pts):
    d.polygon(pts, fill=WHITE)

def make(size, pad_ratio=0.0, out="icon.png"):
    img, d = rounded(size)
    # safe area for maskable: content within 40%..60% center circle-ish box
    m = size * pad_ratio
    box = [size*0.22 + m, size*0.26 + m, size*0.78 - m, size*0.66 - m]
    bubble(d, box, r=int(size * 0.09))
    tail(d, [(size*0.34 + m, size*0.65 - m*0.5), (size*0.26 + m, size*0.80 - m),
             (size*0.46 + m, size*0.66 - m*0.5)])
    cy = (box[1] + box[3]) / 2
    dots(d, size / 2, cy, r=size*0.035, gap=size*0.13)
    img.save(out)
    print(out, img.size)

def apple(size=180):
    img, d = rounded(size, radius_ratio=0.0)  # iOS masks itself; full bleed
    box = [size*0.2, size*0.22, size*0.8, size*0.62]
    bubble(d, box, r=int(size * 0.10))
    tail(d, [(size*0.34, size*0.61), (size*0.25, size*0.78), (size*0.47, size*0.62)])
    cy = (box[1] + box[3]) / 2
    dots(d, size / 2, cy, r=size*0.04, gap=size*0.15)
    # flatten to opaque
    bg = Image.new("RGBA", (size, size), GREEN)
    bg.alpha_composite(img)
    bg.convert("RGB").save("apple-touch-icon.png")
    print("apple-touch-icon.png", bg.size)

make(192, out="icon-192.png")
make(512, out="icon-512.png")
make(512, pad_ratio=0.16, out="icon-maskable-512.png")
apple()
