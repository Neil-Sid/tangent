// Edge pairs crossed by the level set for each marching-squares case (corners a=bl, b=br, c=tr, d=tl).
const CASES = { 1: ['LB'], 2: ['BR'], 3: ['LR'], 4: ['RT'], 5: ['LB', 'RT'], 6: ['BT'], 7: ['LT'], 8: ['LT'], 9: ['BT'], 10: ['BR', 'LT'], 11: ['RT'], 12: ['LR'], 13: ['BR'], 14: ['LB'] }

// The curve f(x, y) = level over the rectangle d, chained into polylines of [x, y] points.
export function isolines(f, d, level, n = 160) {
  const dx = (d.x1 - d.x0) / n, dy = (d.y1 - d.y0) / n, v = new Float64Array((n + 1) ** 2)
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) v[j * (n + 1) + i] = f(d.x0 + i * dx, d.y0 + j * dy) - level
  const at = (i, j) => v[j * (n + 1) + i]
  const cross = (p, q) => p / (p - q)
  // edges are named by grid position so neighbouring cells agree on shared points
  const point = id => {
    const [kind, i, j] = id.split(':').map((s, k) => k ? +s : s)
    return kind === 'h' ? [d.x0 + (i + cross(at(i, j), at(i + 1, j))) * dx, d.y0 + j * dy]
      : [d.x0 + i * dx, d.y0 + (j + cross(at(i, j), at(i, j + 1))) * dy]
  }
  const links = new Map()
  const link = (p, q) => { for (const [x, y] of [[p, q], [q, p]]) (links.get(x) ?? links.set(x, []).get(x)).push(y) }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), e = at(i, j + 1)
    if (![a, b, c, e].every(Number.isFinite)) continue
    const idx = (a > 0) | (b > 0) << 1 | (c > 0) << 2 | (e > 0) << 3
    const edge = { B: `h:${i}:${j}`, T: `h:${i}:${j + 1}`, L: `v:${i}:${j}`, R: `v:${i + 1}:${j}` }
    for (const [p, q] of CASES[idx] ?? []) link(edge[p], edge[q])
  }
  const lines = [], seen = new Set()
  const walk = start => {
    const ids = [start]
    seen.add(start)
    for (let cur = start; ;) {
      const next = links.get(cur).find(x => !seen.has(x))
      if (!next) break
      seen.add(next); ids.push(next); cur = next
    }
    const closed = ids.length > 2 && links.get(ids.at(-1)).includes(start)
    lines.push({ points: (closed ? [...ids, start] : ids).map(point), closed })
  }
  // open curves first (they start at the boundary), then loops
  for (const [id, nb] of links) if (nb.length === 1 && !seen.has(id)) walk(id)
  for (const id of links.keys()) if (!seen.has(id)) walk(id)
  // one Newton step pulls each point from the grid interpolation onto the true curve
  const h = 1e-6 * Math.max(d.x1 - d.x0, d.y1 - d.y0)
  const snap = ([x, y]) => {
    const r = f(x, y) - level, gx = (f(x + h, y) - f(x - h, y)) / (2 * h), gy = (f(x, y + h) - f(x, y - h)) / (2 * h), g2 = gx * gx + gy * gy
    const nx = x - r * gx / g2, ny = y - r * gy / g2
    return g2 > 0 && Number.isFinite(nx + ny) && Math.hypot(nx - x, ny - y) < dx ? [nx, ny] : [x, y]
  }
  return lines.filter(l => l.points.length > 2).map(l => ({ ...l, points: l.points.map(snap) }))
}
