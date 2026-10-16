import { heat } from './theme.js'

const niceStep = raw => {
  const p = 10 ** Math.floor(Math.log10(raw)), m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

// Heat map plus contour lines of f(x, y) on a Plot2D, cached until the view or function changes.
export function contourMap(p, f, [z0, z1], cache, { opacity = 0.85, inside = null } = {}) {
  const v = p.view, W = Math.ceil(p.w / 3), H = Math.ceil(p.h / 3)
  const key = [v.x0, v.x1, v.y0, v.y1, W, H, z0, z1, cache.version].join()
  if (cache.key !== key) {
    const grid = new Float64Array((W + 1) * (H + 1))
    for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
      const x = v.x0 + (v.x1 - v.x0) * i / W, y = v.y1 - (v.y1 - v.y0) * j / H
      grid[j * (W + 1) + i] = inside && !inside(x, y) ? NaN : f(x, y)
    }
    const img = new ImageData(W, H)
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const z = (grid[j * (W + 1) + i] + grid[j * (W + 1) + i + 1] + grid[(j + 1) * (W + 1) + i] + grid[(j + 1) * (W + 1) + i + 1]) / 4
      if (!Number.isFinite(z)) continue
      const [r, g, b] = heat((z - z0) / (z1 - z0)), k = (j * W + i) * 4
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255
    }
    const off = cache.canvas ?? (cache.canvas = document.createElement('canvas'))
    off.width = W; off.height = H
    off.getContext('2d').putImageData(img, 0, 0)

    const step = niceStep((z1 - z0) / 12), segs = []
    for (let L = Math.ceil(z0 / step) * step; L <= z1; L += step) segs.push(...march(grid, W, H, L, p.w / W, p.h / H))
    Object.assign(cache, { key, segs })
  }
  const c = p.ctx
  c.save()
  c.globalAlpha = opacity
  c.imageSmoothingEnabled = true
  c.drawImage(cache.canvas, 0, 0, p.w, p.h)
  c.globalAlpha = 1
  c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 1
  c.beginPath()
  for (const [ax, ay, bx, by] of cache.segs) { c.moveTo(ax, ay); c.lineTo(bx, by) }
  c.stroke()
  c.restore()
}

// Marching squares over a corner grid; returns pixel-space segments for level L.
function march(g, W, H, L, cw, ch) {
  const out = []
  const at = (i, j) => g[j * (W + 1) + i]
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
    if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) continue
    const idx = (a > L) | (b > L) << 1 | (c > L) << 2 | (d > L) << 3
    if (idx === 0 || idx === 15) continue
    const lerp = (p, q) => (L - p) / (q - p)
    const top = [(i + lerp(a, b)) * cw, j * ch], right = [(i + 1) * cw, (j + lerp(b, c)) * ch]
    const bottom = [(i + lerp(d, c)) * cw, (j + 1) * ch], left = [i * cw, (j + lerp(a, d)) * ch]
    const pairs = {
      1: [[left, top]], 2: [[top, right]], 3: [[left, right]], 4: [[right, bottom]], 5: [[left, top], [right, bottom]],
      6: [[top, bottom]], 7: [[left, bottom]], 8: [[left, bottom]], 9: [[top, bottom]], 10: [[left, bottom], [top, right]],
      11: [[right, bottom]], 12: [[left, right]], 13: [[top, right]], 14: [[left, top]],
    }[idx]
    for (const [p, q] of pairs) out.push([p[0], p[1], q[0], q[1]])
  }
  return out
}
