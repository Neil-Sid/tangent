import { Plot2D } from '../plot/plot2d.js'
import { Plot3D, fitZ } from '../plot/plot3d.js'
import { contourMap } from '../plot/contour.js'
import { T } from '../plot/theme.js'
import { diff } from '../math/expr.js'
import { fmt } from '../math/numeric.js'
import { exprField, slider, toggle, button, examples, section, h } from '../ui/controls.js'
import { playButton } from '../ui/anim.js'

const EXAMPLES = [
  { f: 'x^2 + y^2', tex: 'x^2+y^2' },
  { f: 'x^2 - y^2', tex: 'x^2-y^2', note: 'Saddle' },
  { f: 'sin(x) cos(y)', tex: '\\sin x\\cos y' },
  { f: '(x^2 + 3y^2) e^(1 - x^2 - y^2)', tex: '(x^2+3y^2)e^{1-x^2-y^2}' },
  { f: 'x y e^(-(x^2 + y^2)/2)', tex: 'xy\\,e^{-(x^2+y^2)/2}' },
  { f: 'sin(sqrt(x^2 + y^2))', tex: '\\sin\\sqrt{x^2+y^2}' },
  { f: 'x^3 - 3x y^2', tex: 'x^3-3xy^2', note: 'Monkey saddle' },
  { f: 'ln(x^2 + y^2 + 1)', tex: '\\ln(x^2+y^2+1)' },
]

const h2 = 1e-4
const numX = f => (x, y) => (f(x + h2, y) - f(x - h2, y)) / (2 * h2)
const numY = f => (x, y) => (f(x, y + h2) - f(x, y - h2)) / (2 * h2)

export default {
  id: 'partial',
  title: 'Partial derivatives',
  nav: 'Partial derivatives',
  blurb: 'Slice a surface along x or y and each slice is an ordinary curve with its own slope. Together they build the gradient and the tangent plane.',
  defaults: { f: '(x^2 + 3y^2) e^(1 - x^2 - y^2)', a: '0.6', b: '-0.9', r: '2.5', theta: '45' },

  mount({ controls, readout, stage, state, save }) {
    let e = null, a = +state.a, b = +state.b, r = +state.r, theta = +state.theta
    let fx, fy, fxx, fxy, fyy, trail = []
    const show = { slices: true, plane: true, grad: true, dir: false }
    const cache = { version: 0 }
    let zr = [-1, 1]
    const f = (x, y) => e.f(x, y)

    stage.classList.add('multi')
    const view = new Plot3D(stage.appendChild(h('div')))
    const map = new Plot2D(stage.appendChild(h('div')), { equal: true })
    const sliceX = new Plot2D(stage.appendChild(h('div')))
    const sliceY = new Plot2D(stage.appendChild(h('div')))
    const surf = view.group(), dyn = view.group()
    view.onPick = (x, y) => move(x, y)
    view.onTheme = () => { rebuild(); place() }

    const field = exprField({
      label: 'Function', value: state.f, lhs: 'f(x, y)', vars: ['x', 'y'],
      onChange(next, src) {
        e = next; state.f = src
        const dx = diff(e, 'x'), dy = diff(e, 'y')
        fx = dx?.f ?? numX(f); fy = dy?.f ?? numY(f)
        fxx = (dx && diff(dx, 'x'))?.f ?? numX(fx)
        fxy = (dx && diff(dx, 'y'))?.f ?? numY(fx)
        fyy = (dy && diff(dy, 'y'))?.f ?? numY(fy)
        stopClimb(); trail = []
        rebuild()
        place()
      },
    })
    const rSlider = slider({ label: 'Domain  |x|, |y| ≤', min: 0.5, max: 10, step: 0.1, value: r, onInput: v => { r = v; rebuild(); place() } })
    const tSlider = slider({ label: 'Direction  θ', min: 0, max: 360, step: 1, value: theta, format: v => `${Math.round(v)}°`, onInput: v => { theta = v; place() } })
    const snap = button('Snap to critical point', () => newton())

    // P rolls uphill along ∇f at a steady speed until it reaches a peak or the edge.
    const climbBtn = h('button', { type: 'button', class: 'btn primary' })
    const stopClimb = playButton(climbBtn, 'Climb the gradient', done => {
      trail = [[a, b]]
      let id, last = null, steps = 0
      const hstep = r * 0.002, speed = r * 0.45
      const stepOnce = () => {
        const [gx, gy] = [fx(a, b), fy(a, b)], g = Math.hypot(gx, gy)
        if (!(g > 1e-7)) return false
        const mx = a + gx / g * hstep / 2, my = b + gy / g * hstep / 2
        const [hx, hy] = [fx(mx, my), fy(mx, my)], g2 = Math.hypot(hx, hy)
        if (!(g2 > 1e-7)) return false
        const nx = a + hx / g2 * hstep, ny = b + hy / g2 * hstep
        if (Math.abs(nx) > r || Math.abs(ny) > r || !(f(nx, ny) > f(a, b)) || ++steps > 20000) return false
        a = nx; b = ny; trail.push([a, b])
        return true
      }
      const frame = now => {
        let budget = last === null ? hstep : (now - last) / 1000 * speed
        last = now
        for (; budget > 0; budget -= hstep) if (!stepOnce()) { place(); return done() }
        place()
        id = requestAnimationFrame(frame)
      }
      id = requestAnimationFrame(frame)
      return () => cancelAnimationFrame(id)
    })

    controls.append(
      section(null, field.el, examples(EXAMPLES, ex => field.set(ex.f))),
      section('Show', h('div', { class: 'toggles' },
        toggle({ label: 'Slices and their tangents', value: show.slices, color: T.d, onChange: v => { show.slices = v; place() } }).el,
        toggle({ label: 'Tangent plane', value: show.plane, color: T.ink, onChange: v => { show.plane = v; place() } }).el,
        toggle({ label: 'Gradient', value: show.grad, color: T.s, onChange: v => { show.grad = v; place() } }).el,
        toggle({ label: 'Directional derivative', value: show.dir, color: T.s, onChange: v => { show.dir = v; place() } }).el,
      ), tSlider.el, rSlider.el, h('div', { class: 'buttons' }, climbBtn, snap)),
    )

    readout.append(section(null, h('p', { class: 'explain' }, 'Click the surface or drag P on the contour map to move the point. The orange slice holds y fixed (∂/∂x); the green one holds x fixed (∂/∂y).')))

    map.handles = [{ pos: () => [a, b], drag: (x, y) => move(x, y), color: T.ink, label: 'P' }]
    sliceX.handles = [{ pos: () => [a, f(a, b)], drag: x => move(x, b), color: T.d }]
    sliceY.handles = [{ pos: () => [b, f(a, b)], drag: y => move(a, y), color: T.g }]

    map.draw = p => {
      contourMap(p, f, zr, cache)
      const gx = fx(a, b), gy = fy(a, b), g = Math.hypot(gx, gy), span = r * 2
      if (show.slices) {
        p.hline(b, { color: T.d, width: 2 })
        p.vline(a, { color: T.g, width: 2 })
      }
      if (g > 1e-9) p.slopeLine(a, b, -gx / gy, { color: T.ink, width: 1.25, dash: [5, 4], alpha: 0.7 })
      if (trail.length > 1) p.polyline(trail, { color: T.s, width: 3.5 })
      if (show.grad && g > 1e-9) {
        const L = Math.min(0.35, 0.08 + 0.05 * g) * span
        p.arrow(a, b, a + gx / g * L, b + gy / g * L, { color: T.s, width: 2.5 })
      }
      if (show.dir) {
        const t = theta * Math.PI / 180
        p.arrow(a, b, a + Math.cos(t) * span * 0.18, b + Math.sin(t) * span * 0.18, { color: T.s, width: 2, dash: [4, 3] })
      }
    }

    sliceX.draw = p => {
      p.curve(x => f(x, b), { color: T.d, width: 2.5 })
      p.slopeLine(a, f(a, b), fx(a, b), { color: T.ink, width: 1.5, dash: [6, 4] })
    }
    sliceY.draw = p => {
      p.curve(y => f(a, y), { color: T.g, width: 2.5 })
      p.slopeLine(b, f(a, b), fy(a, b), { color: T.ink, width: 1.5, dash: [6, 4] })
    }

    function move(x, y) {
      stopClimb(); trail = []
      a = Math.max(-r, Math.min(r, x)); b = Math.max(-r, Math.min(r, y))
      place()
    }

    // Newton's method on ∇f = 0 from the current point.
    function newton() {
      let x = a, y = b
      for (let i = 0; i < 40; i++) {
        const gx = fx(x, y), gy = fy(x, y), A = fxx(x, y), B = fxy(x, y), C = fyy(x, y), det = A * C - B * B
        if (!Number.isFinite(det) || Math.abs(det) < 1e-12) break
        const dx = (C * gx - B * gy) / det, dy = (A * gy - B * gx) / det
        x -= dx; y -= dy
        if (Math.hypot(dx, dy) < 1e-12) break
      }
      if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= r && Math.abs(y) <= r) move(x, y)
    }

    // Surface, frame and slice-plot windows: only when f or the domain changes.
    function rebuild() {
      if (!e) return
      const d = { x0: -r, x1: r, y0: -r, y1: r }
      zr = fitZ(f, d)
      view.setDomain({ ...d, z0: zr[0], z1: zr[1] })
      view.clear(surf)
      surf.add(view.surface(f, { n: 110 }))
      cache.version++
      map.setHome({ x0: -r * 1.04, x1: r * 1.04, y0: -r * 1.04, y1: r * 1.04 })
      sliceX.setHome({ x0: -r, x1: r, y0: zr[0], y1: zr[1] })
      sliceY.setHome({ x0: -r, x1: r, y0: zr[0], y1: zr[1] })
      a = Math.max(-r, Math.min(r, a)); b = Math.max(-r, Math.min(r, b))
    }

    // Everything that depends on the point P.
    function place() {
      if (!e) return
      const d = view.domain, z = f(a, b), gx = fx(a, b), gy = fy(a, b), g = Math.hypot(gx, gy), span = d.x1 - d.x0
      const t = theta * Math.PI / 180, ux = Math.cos(t), uy = Math.sin(t), Du = gx * ux + gy * uy
      const lin = (n, from, to) => Array.from({ length: n + 1 }, (_, i) => from + (to - from) * i / n)
      view.clear(dyn)
      if (Number.isFinite(z)) {
        dyn.add(view.point(a, b, z, T.ink))
        dyn.add(view.curve([[a, b, d.z0], [a, b, z]], T.ink, 1.25, { dashed: true }))
      }
      const L = span * 0.22
      if (show.slices) {
        const xs = lin(160, d.x0, d.x1), ys = lin(160, d.y0, d.y1)
        dyn.add(view.curtain(xs.map(x => [x, b, d.z0]), xs.map(x => [x, b, d.z1]), T.d, 0.1))
        dyn.add(view.curve(xs.map(x => [x, b, f(x, b)]), T.d, 3.5))
        dyn.add(view.curtain(ys.map(y => [a, y, d.z0]), ys.map(y => [a, y, d.z1]), T.g, 0.1))
        dyn.add(view.curve(ys.map(y => [a, y, f(a, y)]), T.g, 3.5))
        dyn.add(view.curve(lin(20, -L, L).map(s => [a + s, b, z + gx * s]), T.d, 2.5))
        dyn.add(view.curve(lin(20, -L, L).map(s => [a, b + s, z + gy * s]), T.g, 2.5))
      }
      if (trail.length > 1) dyn.add(view.curve(trail.map(([x, y]) => [x, y, f(x, y)]), T.s, 5))
      if (show.plane && Number.isFinite(z)) {
        const s = span * 0.16, plane = (dx, dy) => [a + dx, b + dy, z + gx * dx + gy * dy]
        dyn.add(view.patch([plane(-s, -s), plane(s, -s), plane(s, s), plane(-s, s)], T.ink, 0.22))
        dyn.add(view.curve([plane(-s, -s), plane(s, -s), plane(s, s), plane(-s, s), plane(-s, -s)], T.ink, 1.5))
      }
      if (show.grad && g > 1e-9) {
        const Lg = Math.min(0.35, 0.08 + 0.05 * g) * span
        dyn.add(view.arrow([a, b, d.z0], [a + gx / g * Lg, b + gy / g * Lg, d.z0], T.s))
      }
      if (show.dir) {
        const ts = lin(160, -span, span).filter(s => Math.abs(a + s * ux) <= r && Math.abs(b + s * uy) <= r)
        dyn.add(view.curtain(ts.map(s => [a + s * ux, b + s * uy, d.z0]), ts.map(s => [a + s * ux, b + s * uy, d.z1]), T.s, 0.1))
        dyn.add(view.curve(ts.map(s => [a + s * ux, b + s * uy, f(a + s * ux, b + s * uy)]), T.s, 3))
        dyn.add(view.curve(lin(20, -L, L).map(s => [a + s * ux, b + s * uy, z + Du * s]), T.s, 2.5))
        dyn.add(view.arrow([a, b, d.z0], [a + ux * span * 0.18, b + uy * span * 0.18, d.z0], T.s, 2.5))
      }
      view.invalidate()

      map.caption(`f(x, y) = ${e.tex}`)
      map.legend([[T.d, 'y = b'], [T.g, 'x = a'], show.grad && [T.s, '\\nabla f']].filter(Boolean))
      sliceX.caption(`f(x, ${fmt(b, 3)})\\quad \\text{slope } f_x = ${fmt(gx, 4)}`)
      sliceY.caption(`f(${fmt(a, 3)}, y)\\quad \\text{slope } f_y = ${fmt(gy, 4)}`)
      for (const p of [map, sliceX, sliceY]) p.invalidate()
      save({ f: state.f, a: +a.toFixed(3), b: +b.toFixed(3), r, theta: Math.round(theta) })
    }

    return { destroy() { stopClimb(); view.destroy(); map.destroy(); sliceX.destroy(); sliceY.destroy() } }
  },
}

