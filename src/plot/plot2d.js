import { T, onTheme, alpha } from './theme.js'
import { katexInline } from '../ui/tex.js'

const niceStep = raw => {
  const p = 10 ** Math.floor(Math.log10(raw)), m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

// A pannable, zoomable canvas graph. Modes supply draw(plot) and draggable handles.
export class Plot2D {
  constructor(host, { view = { x0: -5, x1: 5, y0: -3, y1: 3 }, equal = false, caption = '' } = {}) {
    this.host = host
    this.home = { ...view }
    this.view = { ...view }
    this.equal = equal
    this.handles = []
    this.links = []
    this.draw = () => {}
    this.onView = () => {}

    host.classList.add('plot')
    host.innerHTML = `<canvas></canvas><div class="plot-caption"></div><div class="plot-legend"></div>
      <button class="plot-reset" title="Reset view" aria-label="Reset view">⟲</button>`
    this.canvas = host.querySelector('canvas')
    this.ctx = this.canvas.getContext('2d')
    this.captionEl = host.querySelector('.plot-caption')
    this.legendEl = host.querySelector('.plot-legend')
    host.querySelector('.plot-reset').onclick = () => this.setView({ ...this.home })
    this.caption(caption)

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(host)
    this.offTheme = onTheme(() => this.invalidate())
    this.bindPointer()
    this.resize()
  }

  destroy() { this.resizeObs.disconnect(); this.offTheme() }

  caption(tex) { this.captionEl.innerHTML = tex ? katexInline(tex) : '' }
  legend(items) {
    this.legendEl.innerHTML = items.map(([color, tex, dashed]) =>
      `<span><i style="--c:${color}" class="${dashed ? 'dashed' : ''}"></i>${katexInline(tex)}</span>`).join('')
  }

  resize() {
    const r = this.host.getBoundingClientRect()
    if (!r.width || !r.height) return
    const dpr = devicePixelRatio || 1
    this.w = r.width; this.h = r.height
    this.canvas.width = Math.round(r.width * dpr)
    this.canvas.height = Math.round(r.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (this.equal) this.fixAspect()
    this.invalidate()
  }

  fixAspect() {
    const v = this.view, cy = (v.y0 + v.y1) / 2
    const half = (v.x1 - v.x0) * this.h / this.w / 2
    v.y0 = cy - half; v.y1 = cy + half
  }

  setView(v, fromLink) {
    this.view = { ...v }
    if (this.equal) this.fixAspect()
    if (!fromLink) for (const p of this.links) p.setView({ ...p.view, x0: v.x0, x1: v.x1 }, true)
    this.onView(this.view)
    this.invalidate()
  }

  setHome(v) { this.home = { ...v }; this.setView(v) }

  // Share the x-range with another plot
  link(other) { this.links.push(other); other.links.push(this) }

  invalidate() {
    if (this.queued) return
    this.queued = true
    requestAnimationFrame(() => { this.queued = false; this.render() })
  }

  px(x) { return (x - this.view.x0) / (this.view.x1 - this.view.x0) * this.w }
  py(y) { return (1 - (y - this.view.y0) / (this.view.y1 - this.view.y0)) * this.h }
  fromPx(px, py) {
    const v = this.view
    return [v.x0 + px / this.w * (v.x1 - v.x0), v.y0 + (1 - py / this.h) * (v.y1 - v.y0)]
  }

  render() {
    if (!this.w) return
    const c = this.ctx
    c.clearRect(0, 0, this.w, this.h)
    this.grid()
    c.save()
    try { this.draw(this) } catch (err) { console.error(err) }
    c.restore()
    for (const hd of this.handles) this.drawHandle(hd)
  }

  grid() {
    const c = this.ctx, v = this.view
    const sx = niceStep((v.x1 - v.x0) * 90 / this.w), sy = niceStep((v.y1 - v.y0) * 70 / this.h)
    const lines = (stepX, stepY, color) => {
      c.strokeStyle = color; c.lineWidth = 1; c.beginPath()
      for (let x = Math.ceil(v.x0 / stepX) * stepX; x <= v.x1; x += stepX) { const p = Math.round(this.px(x)) + .5; c.moveTo(p, 0); c.lineTo(p, this.h) }
      for (let y = Math.ceil(v.y0 / stepY) * stepY; y <= v.y1; y += stepY) { const p = Math.round(this.py(y)) + .5; c.moveTo(0, p); c.lineTo(this.w, p) }
      c.stroke()
    }
    lines(sx / 5, sy / 5, T.gridMinor)
    lines(sx, sy, T.grid)

    // axes
    const ax = Math.min(Math.max(this.py(0), 0), this.h), ay = Math.min(Math.max(this.px(0), 0), this.w)
    c.strokeStyle = T.axis; c.lineWidth = 1.25; c.beginPath()
    if (v.y0 <= 0 && v.y1 >= 0) { c.moveTo(0, Math.round(ax) + .5); c.lineTo(this.w, Math.round(ax) + .5) }
    if (v.x0 <= 0 && v.x1 >= 0) { c.moveTo(Math.round(ay) + .5, 0); c.lineTo(Math.round(ay) + .5, this.h) }
    c.stroke()

    // tick labels, pinned to the edges when the axis is off-screen
    c.font = `500 11px ${T.font}`
    c.fillStyle = T.muted
    const dec = s => Math.max(0, -Math.floor(Math.log10(s) + 1e-9))
    const label = (n, s) => (Math.abs(n) < s / 1e3 ? 0 : n).toFixed(dec(s)).replace('-', '−')
    c.textAlign = 'center'; c.textBaseline = 'top'
    const ly = Math.min(Math.max(ax + 5, 4), this.h - 16)
    for (let x = Math.ceil(v.x0 / sx) * sx; x <= v.x1; x += sx) {
      const p = this.px(x)
      if ((Math.abs(x) < sx / 2 && v.y0 <= 0 && v.y1 >= 0 && v.x0 < 0) || p < 14 || p > this.w - 14) continue
      c.fillText(label(x, sx), p, ly)
    }
    c.textAlign = 'right'; c.textBaseline = 'middle'
    const lx = Math.min(Math.max(ay - 6, 30), this.w - 4)
    for (let y = Math.ceil(v.y0 / sy) * sy; y <= v.y1; y += sy) {
      if (Math.abs(y) < sy / 2) continue
      const p = this.py(y)
      if (p > 10 && p < this.h - 10) c.fillText(label(y, sy), lx, p)
    }
  }

  // ——— drawing helpers used by modes ———

  stroke({ color = T.f, width = 2, dash = null, alpha: a = 1 } = {}) {
    const c = this.ctx
    c.strokeStyle = color; c.lineWidth = width; c.globalAlpha = a
    c.setLineDash(dash ?? []); c.lineJoin = 'round'; c.lineCap = 'round'
    c.stroke()
    c.globalAlpha = 1; c.setLineDash([])
  }

  // Samples f across [from, to] and breaks the path at gaps and asymptotes.
  curve(f, style = {}, from = this.view.x0, to = this.view.x1) {
    const c = this.ctx, n = Math.ceil(this.w * 1.5 * (to - from) / (this.view.x1 - this.view.x0)) + 2
    const lim = this.h * 4
    c.beginPath()
    let pen = false, prev = null
    for (let i = 0; i <= n; i++) {
      const x = from + (to - from) * i / n, y = f(x)
      if (!Number.isFinite(y)) { pen = false; prev = null; continue }
      const X = this.px(x), Y = Math.max(-lim, Math.min(this.h + lim, this.py(y)))
      if (pen && prev !== null && Math.abs(Y - prev) > this.h * 1.5 && (Y < 0 || Y > this.h) !== (prev < 0 || prev > this.h)) pen = false
      if (pen && prev !== null && Math.abs(Y - prev) > this.h * 3) pen = false
      pen ? c.lineTo(X, Y) : c.moveTo(X, Y)
      pen = true; prev = Y
    }
    this.stroke(style)
  }

  polyline(points, style) {
    const c = this.ctx
    c.beginPath()
    points.forEach(([x, y], i) => i ? c.lineTo(this.px(x), this.py(y)) : c.moveTo(this.px(x), this.py(y)))
    this.stroke(style)
  }

  segment(x0, y0, x1, y1, style) { this.polyline([[x0, y0], [x1, y1]], style) }

  // Infinite line through (x, y) with slope m.
  slopeLine(x, y, m, style) {
    const { x0, x1 } = this.view
    this.segment(x0, y + m * (x0 - x), x1, y + m * (x1 - x), style)
  }

  vline(x, style) { this.segment(x, this.view.y0, x, this.view.y1, style) }
  hline(y, style) { this.segment(this.view.x0, y, this.view.x1, y, style) }

  arrow(x0, y0, x1, y1, style = {}) {
    this.segment(x0, y0, x1, y1, style)
    const c = this.ctx, X = this.px(x1), Y = this.py(y1), ang = Math.atan2(Y - this.py(y0), X - this.px(x0)), s = 9
    if (Math.hypot(X - this.px(x0), Y - this.py(y0)) < 2) return
    c.beginPath()
    c.moveTo(X, Y)
    c.lineTo(X - s * Math.cos(ang - 0.4), Y - s * Math.sin(ang - 0.4))
    c.lineTo(X - s * Math.cos(ang + 0.4), Y - s * Math.sin(ang + 0.4))
    c.closePath()
    c.fillStyle = style.color ?? T.ink; c.fill()
  }

  polygon(points, fill, stroke) {
    const c = this.ctx
    c.beginPath()
    points.forEach(([x, y], i) => i ? c.lineTo(this.px(x), this.py(y)) : c.moveTo(this.px(x), this.py(y)))
    c.closePath()
    if (fill) { c.fillStyle = fill; c.fill() }
    if (stroke) this.stroke(stroke)
  }

  rect(x0, y0, x1, y1, fill, stroke) { this.polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], fill, stroke) }


  // Shade between f and the x-axis on [a, b]; positive and negative parts tinted separately.
  area(f, a, b, pos = alpha(T.f, .16), neg = alpha(T.d, .16)) {
    const c = this.ctx, n = Math.max(2, Math.ceil(Math.abs(this.px(b) - this.px(a)) * 1.5))
    const pts = [[a, 0]]
    for (let i = 0; i <= n; i++) {
      const x = a + (b - a) * i / n, y = f(x)
      pts.push([x, Number.isFinite(y) ? Math.max(this.view.y0 - 1e3 * (this.view.y1 - this.view.y0), Math.min(this.view.y1 + 1e3 * (this.view.y1 - this.view.y0), y)) : 0])
    }
    pts.push([b, 0])
    const axis = this.py(0)
    for (const [fill, top, bottom] of [[pos, 0, axis], [neg, axis, this.h]]) {
      c.save(); c.beginPath(); c.rect(0, top, this.w, bottom - top); c.clip()
      this.polygon(pts, fill)
      c.restore()
    }
  }

  text(str, x, y, { color = T.ink2, align = 'left', base = 'bottom', dx = 0, dy = 0, size = 12, weight = 500 } = {}) {
    const c = this.ctx
    c.font = `${weight} ${size}px ${T.font}`
    c.fillStyle = color; c.textAlign = align; c.textBaseline = base
    c.fillText(str, this.px(x) + dx, this.py(y) + dy)
  }

  // ——— interaction ———

  drawHandle(hd) {
    const [x, y] = hd.pos()
    if (!Number.isFinite(x)) return
    const c = this.ctx, X = this.px(x)
    if (hd.kind === 'bar') {
      c.fillStyle = hd.color
      c.beginPath(); c.roundRect(X - 5, this.h - 26, 10, 20, 3); c.fill()
      c.strokeStyle = T.surface; c.lineWidth = 1.5
      c.beginPath(); c.moveTo(X - 1.5, this.h - 20); c.lineTo(X - 1.5, this.h - 12); c.moveTo(X + 1.5, this.h - 20); c.lineTo(X + 1.5, this.h - 12); c.stroke()
      if (hd.label) this.text(hd.label, x, 0, { color: hd.color, align: 'center', base: 'bottom', dy: this.h - this.py(0) - 30, weight: 600 })
      return
    }
    if (!Number.isFinite(y)) return
    const Y = this.py(y)
    c.beginPath(); c.arc(X, Y, hd === this.active || hd === this.hover ? 8 : 6.5, 0, Math.PI * 2)
    c.fillStyle = hd.color; c.fill()
    c.lineWidth = 2.5; c.strokeStyle = T.surface; c.stroke()
    if (hd.label) this.text(hd.label, x, y, { color: hd.color, dx: 10, dy: -8, weight: 600 })
  }

  hit(px, py) {
    let best = null, bd = 16
    for (const hd of this.handles) {
      const [x, y] = hd.pos()
      const d = hd.kind === 'bar'
        ? (py > this.h - 34 ? Math.abs(this.px(x) - px) : Infinity)
        : Math.hypot(this.px(x) - px, this.py(y) - py)
      if (d < bd) { bd = d; best = hd }
    }
    return best
  }

  bindPointer() {
    const el = this.canvas, pts = new Map()
    let pan = null, pinch = null
    const local = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }

    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId)
      const p = local(e)
      pts.set(e.pointerId, p)
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), view: { ...this.view }, c: this.fromPx((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) }
        pan = null; this.active = null
        return
      }
      this.active = this.hit(...p)
      if (!this.active) pan = { p, view: { ...this.view } }
      el.classList.toggle('grabbing', true)
      this.invalidate()
    })

    el.addEventListener('pointermove', e => {
      const p = local(e)
      if (pts.has(e.pointerId)) pts.set(e.pointerId, p)
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()]
        const k = pinch.d / Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1]))
        const v = pinch.view, [cx, cy] = pinch.c
        this.setView({ x0: cx + (v.x0 - cx) * k, x1: cx + (v.x1 - cx) * k, y0: cy + (v.y0 - cy) * k, y1: cy + (v.y1 - cy) * k })
        return
      }
      if (this.active) {
        const [x, y] = this.fromPx(...p)
        this.active.drag(x, y)
        return
      }
      if (pan) {
        const v = pan.view, dx = (p[0] - pan.p[0]) / this.w * (v.x1 - v.x0), dy = (p[1] - pan.p[1]) / this.h * (v.y1 - v.y0)
        this.setView({ x0: v.x0 - dx, x1: v.x1 - dx, y0: v.y0 + dy, y1: v.y1 + dy })
        return
      }
      const h = this.hit(...p)
      if (h !== this.hover) { this.hover = h; el.style.cursor = h ? (h.kind === 'bar' ? 'ew-resize' : 'grab') : ''; this.invalidate() }
    })

    const end = e => {
      pts.delete(e.pointerId)
      if (pts.size < 2) pinch = null
      if (this.active?.end) this.active.end()
      pan = null; this.active = null
      el.classList.remove('grabbing')
      this.invalidate()
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)

    el.addEventListener('wheel', e => {
      e.preventDefault()
      const [cx, cy] = this.fromPx(...local(e))
      const k = Math.exp(e.deltaY * 0.0015), v = this.view
      const ky = e.shiftKey ? 1 : k, kx = e.altKey ? 1 : k
      this.setView({ x0: cx + (v.x0 - cx) * kx, x1: cx + (v.x1 - cx) * kx, y0: cy + (v.y0 - cy) * ky, y1: cy + (v.y1 - cy) * ky })
    }, { passive: false })

    el.addEventListener('dblclick', () => this.setView({ ...this.home }))
  }
}

// Pick a y-window that frames f over [x0, x1], ignoring spikes.
export function fitY(fs, x0, x1, { pad = 0.15, zero = true } = {}) {
  const ys = []
  for (const f of [].concat(fs)) for (let i = 0; i <= 300; i++) { const y = f(x0 + (x1 - x0) * i / 300); if (Number.isFinite(y)) ys.push(y) }
  if (!ys.length) return [-1, 1]
  ys.sort((a, b) => a - b)
  let lo = ys[Math.floor(ys.length * 0.03)], hi = ys[Math.ceil(ys.length * 0.97) - 1]
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0) }
  if (hi - lo < 1e-9) { lo -= 1; hi += 1 }
  const p = (hi - lo) * pad
  return [lo - p, hi + p]
}
