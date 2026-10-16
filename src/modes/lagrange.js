import { Plot2D, fitY } from '../plot/plot2d.js'
import { Plot3D, fitZ } from '../plot/plot3d.js'
import { contourMap } from '../plot/contour.js'
import { T } from '../plot/theme.js'
import { diff, number } from '../math/expr.js'
import { isolines } from '../math/isolines.js'
import { exprField, numberField, slider, toggle, button, examples, section, row, h } from '../ui/controls.js'
import { animate, playButton } from '../ui/anim.js'

const EXAMPLES = [
  { f: 'x y', g: 'x^2 + y^2', c: '1', tex: 'xy,\\ x^2+y^2=1' },
  { f: 'x + y', g: 'x^2 + y^2', c: '1', tex: 'x+y,\\ x^2+y^2=1' },
  { f: '4 - x^2 - 2y^2', g: 'x + y', c: '1', tex: '4-x^2-2y^2,\\ x+y=1' },
  { f: 'x^2 y', g: 'x^2 + y^2', c: '3', tex: 'x^2y,\\ x^2+y^2=3' },
  { f: 'sin(x) cos(y)', g: 'x^2/4 + y^2', c: '1', tex: '\\sin x\\cos y,\\ \\tfrac{x^2}{4}+y^2=1' },
  { f: 'x^2 + y^2', g: 'x^4 + y^4', c: '1', tex: 'x^2+y^2,\\ x^4+y^4=1' },
  { f: '(x^2 + 3y^2) e^(1 - x^2 - y^2)', g: 'x - y', c: '0.5', tex: '(x^2+3y^2)e^{1-x^2-y^2},\\ x-y=\\tfrac12' },
]

const h2 = 1e-5
const grad = f => (x, y) => [(f(x + h2, y) - f(x - h2, y)) / (2 * h2), (f(x, y + h2) - f(x, y - h2)) / (2 * h2)]

export default {
  id: 'lagrange',
  title: 'Lagrange multipliers',
  nav: 'Lagrange multipliers',
  blurb: 'Climb a surface while staying on a curve. The highs and lows come where a level curve of f just touches the constraint.',
  defaults: { f: 'x y', g: 'x^2 + y^2', c: '1', r: '2', k: '0', s: '0.4' },

  mount({ controls, readout, stage, state, save }) {
    let e = null, ge = null, c = number(state.c), r = +state.r, k = +state.k, s = +state.s
    let gradF, gradG, lines = [], arcs = [], zr = [-1, 1]
    const show = { wall: true, level: true, grads: true, plane: false }
    const cache = { version: 0 }
    const f = (x, y) => e.f(x, y)
    const g = (x, y) => ge.f(x, y)
    const domain = () => ({ x0: -r, x1: r, y0: -r, y1: r })

    stage.classList.add('multi', 'pair')
    const view = new Plot3D(stage.appendChild(h('div')))
    const map = new Plot2D(stage.appendChild(h('div')), { equal: true })
    const along = new Plot2D(stage.appendChild(h('div')))
    const surf = view.group(), dyn = view.group()
    view.onPick = (x, y) => { stopWalk(); moveTo(x, y) }
    view.onTheme = () => { rebuild(); place() }

    const ready = () => e && ge
    const fField = exprField({
      label: 'Maximize or minimize', value: state.f, lhs: 'f(x, y)', vars: ['x', 'y'],
      onChange(next, src) { e = next; state.f = src; const d = diff(e, 'x'), d2 = diff(e, 'y'); gradF = d && d2 ? (x, y) => [d.f(x, y), d2.f(x, y)] : grad(f); rebuild(); place() },
    })
    const gField = exprField({
      label: 'Subject to', value: state.g, lhs: `g(x, y)`, vars: ['x', 'y'],
      onChange(next, src) { ge = next; state.g = src; const d = diff(ge, 'x'), d2 = diff(ge, 'y'); gradG = d && d2 ? (x, y) => [d.f(x, y), d2.f(x, y)] : grad(g); trace(); rebuild(); place() },
    })
    const cField = numberField({ label: 'g(x, y) =', value: state.c, onChange: (v, src) => { c = v; state.c = src; trace(); rebuild(); place() } })
    const rSlider = slider({ label: 'Domain  |x|, |y| ≤', min: 0.5, max: 10, step: 0.1, value: r, onInput: v => { r = v; trace(); rebuild(); place() } })

    const walkBtn = h('button', { type: 'button', class: 'btn primary' })
    const stopWalk = playButton(walkBtn, 'Walk the constraint', done => {
      const line = lines[k]
      if (!line) { done(); return () => {} }
      const len = arcs[k].at(-1), s0 = s
      // loops go once around; open curves go to the far end and back
      return animate(9000, t => {
        s = line.closed ? (s0 + len * t) % len : len * (1 - Math.abs(1 - 2 * ((s0 / len / 2 + t) % 1)))
        place()
      }, done)
    })
    const snapBtn = button('Snap to a tangency', () => { stopWalk(); snap() })

    controls.append(
      section(null, fField.el, gField.el, row(cField.el), examples(EXAMPLES, ex => {
        cField.set(ex.c); c = number(ex.c); state.c = ex.c
        gField.set(ex.g); fField.set(ex.f)
      })),
      section('Show', h('div', { class: 'toggles' },
        toggle({ label: 'Constraint wall', value: show.wall, color: T.d, onChange: v => { show.wall = v; rebuild(); place() } }).el,
        toggle({ label: 'Level curve through P', value: show.level, color: T.s, onChange: v => { show.level = v; place() } }).el,
        toggle({ label: 'Gradients ∇f and ∇g', value: show.grads, color: T.g, onChange: v => { show.grads = v; place() } }).el,
        toggle({ label: 'Level plane z = f(P)', value: show.plane, color: T.ink, onChange: v => { show.plane = v; place() } }).el,
      ), rSlider.el, h('div', { class: 'buttons' }, walkBtn, snapBtn)),
    )
    readout.append(section(null, h('p', { class: 'explain' }, 'Drag P along the orange constraint, on the map or the lower graph. Watch the purple level curve: where it just touches the constraint, ∇f and ∇g line up.')))

    map.handles = [{ pos: () => at(k, s), drag: (x, y) => { stopWalk(); moveTo(x, y) }, color: T.ink, label: 'P' }]
    along.handles = [{ pos: () => [s, f(...at(k, s))], drag: x => { stopWalk(); s = clampS(x); place() }, color: T.d }]

    map.draw = p => {
      contourMap(p, f, zr, cache)
      for (const l of lines) p.polyline(l.points, { color: T.d, width: 3 })
      if (!lines.length) return
      const [px, py] = at(k, s)
      if (show.level) for (const l of isolines(f, domain(), f(px, py), 120)) p.polyline(l.points, { color: T.s, width: 2, dash: [6, 4] })
      if (show.grads) {
        const L = r * 0.3
        for (const [v, color] of [[gradF(px, py), T.s], [gradG(px, py), T.g]]) {
          const m = Math.hypot(...v)
          if (m > 1e-12) p.arrow(px, py, px + v[0] / m * L, py + v[1] / m * L, { color, width: 2.5 })
        }
      }
    }

    along.draw = p => {
      if (!lines[k]) return
      p.curve(t => f(...at(k, t)), { color: T.d, width: 2.5 }, 0, arcs[k].at(-1))
      p.vline(s, { color: T.d, width: 1, dash: [4, 4] })
    }

    // Constraint g = c traced over the domain, with running arc lengths for each piece.
    function trace() {
      if (!ge) return
      lines = isolines(g, domain(), c, 200)
      arcs = lines.map(({ points: q }) => {
        const acc = [0]
        for (let i = 1; i < q.length; i++) acc.push(acc[i - 1] + Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]))
        return acc
      })
      if (!lines[k]) k = 0
      s = clampS(s)
    }

    const clampS = v => lines[k] ? Math.max(0, Math.min(arcs[k].at(-1), v)) : 0

    // Point at arc length t along piece j.
    function at(j, t) {
      const pts = lines[j]?.points, acc = arcs[j]
      if (!pts) return [NaN, NaN]
      let lo = 0, hi = acc.length - 1
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; acc[mid] <= t ? lo = mid : hi = mid }
      const u = (t - acc[lo]) / ((acc[hi] - acc[lo]) || 1)
      return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * u, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * u]
    }

    // Put P at the point of the constraint nearest (x, y).
    function moveTo(x, y) {
      let best = Infinity
      lines.forEach((l, j) => l.points.forEach((q, i) => {
        if (!i) return
        const p0 = l.points[i - 1], vx = q[0] - p0[0], vy = q[1] - p0[1], len2 = vx * vx + vy * vy || 1
        const u = Math.max(0, Math.min(1, ((x - p0[0]) * vx + (y - p0[1]) * vy) / len2))
        const dist = Math.hypot(p0[0] + vx * u - x, p0[1] + vy * u - y)
        if (dist < best) { best = dist; k = j; s = arcs[j][i - 1] + (arcs[j][i] - arcs[j][i - 1]) * u }
      }))
      place()
    }

    // Nearest local max or min of f along the constraint; that's where the level curve is tangent.
    function snap() {
      const line = lines[k]
      if (!line) return
      const len = arcs[k].at(-1), N = 600, hs = []
      for (let i = 0; i <= N; i++) hs.push(f(...at(k, len * i / N)))
      let best = null
      for (let i = 0; i <= N; i++) {
        const prev = i ? i - 1 : line.closed ? N - 1 : null, next = i < N ? i + 1 : line.closed ? 1 : null
        if (prev === null || next === null) continue
        const [l, m, n] = [hs[prev], hs[i], hs[next]]
        if (!((m >= l && m >= n) || (m <= l && m <= n)) || l === n && l === m) continue
        const curv = l - 2 * m + n, shift = curv ? (l - n) / (2 * curv) : 0
        const t = len * (i + Math.max(-1, Math.min(1, shift))) / N
        const dist = line.closed ? Math.min(Math.abs(t - s), len - Math.abs(t - s)) : Math.abs(t - s)
        if (dist > 1e-9 * len && (!best || dist < best.dist)) best = { t, dist }
      }
      if (best) { s = (best.t + len) % len; if (!line.closed) s = clampS(best.t); place() }
    }

    function rebuild() {
      if (!ready()) return
      const d = domain()
      zr = fitZ(f, d)
      view.setDomain({ ...d, z0: zr[0], z1: zr[1] })
      view.clear(surf)
      surf.add(view.surface(f, { n: 110 }))
      for (const l of lines) {
        if (show.wall) surf.add(view.curtain(l.points.map(([x, y]) => [x, y, zr[0]]), l.points.map(([x, y]) => [x, y, zr[1]]), T.d, 0.12))
        surf.add(view.curve(l.points.map(([x, y]) => [x, y, f(x, y)]), T.d, 4))
        surf.add(view.curve(l.points.map(([x, y]) => [x, y, zr[0]]), T.d, 2))
      }
      cache.version++
      map.setHome({ x0: -r * 1.04, x1: r * 1.04, y0: -r * 1.04, y1: r * 1.04 })
      if (lines[k]) {
        const len = arcs[k].at(-1), [y0, y1] = fitY(t => f(...at(k, t)), 0, len, { zero: false, pad: 0.2 })
        along.setHome({ x0: -len * 0.03, x1: len * 1.03, y0, y1 })
      }
    }

    function place() {
      if (!ready()) return
      const d = view.domain
      view.clear(dyn)
      map.caption(lines.length ? `f(x, y) = ${e.tex}` : `\\text{The constraint misses this window}`)
      map.legend([[T.d, `g = ${state.c}`], show.level && [T.s, 'f = f(P)', true], show.grads && [T.s, '\\nabla f'], show.grads && [T.g, '\\nabla g']].filter(Boolean))
      along.caption('f\\ \\text{along the constraint}')
      if (lines[k]) {
        const [px, py] = at(k, s), z = f(px, py)
        dyn.add(view.point(px, py, z, T.ink))
        dyn.add(view.curve([[px, py, d.z0], [px, py, z]], T.ink, 1.25, { dashed: true }))
        if (show.level) for (const l of isolines(f, domain(), z, 120)) dyn.add(view.curve(l.points.map(([x, y]) => [x, y, z]), T.s, 3))
        if (show.plane) dyn.add(view.patch([[d.x0, d.y0, z], [d.x1, d.y0, z], [d.x1, d.y1, z], [d.x0, d.y1, z]], T.ink, 0.12))
        if (show.grads) {
          const L = r * 0.3
          for (const [v, color] of [[gradF(px, py), T.s], [gradG(px, py), T.g]]) {
            const m = Math.hypot(...v)
            if (m > 1e-12) dyn.add(view.arrow([px, py, d.z0], [px + v[0] / m * L, py + v[1] / m * L, d.z0], color))
          }
        }
      }
      view.invalidate()
      for (const p of [map, along]) p.invalidate()
      save({ f: state.f, g: state.g, c: state.c, r, k, s: +s.toFixed(4) })
    }

    return { destroy() { stopWalk(); view.destroy(); map.destroy(); along.destroy() } }
  },
}
