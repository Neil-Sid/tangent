import { Plot2D, fitY } from '../plot/plot2d.js'
import { Plot3D, fitZ } from '../plot/plot3d.js'
import { contourMap } from '../plot/contour.js'
import { T, alpha } from '../plot/theme.js'
import { number } from '../math/expr.js'
import { integrate, fmt } from '../math/numeric.js'
import { exprField, numberField, slider, toggle, examples, section, row, h } from '../ui/controls.js'
import { animate, playButton } from '../ui/anim.js'

const EXAMPLES = [
  { f: '2 - x^2 - y^2', a: '-1', b: '1', lo: 'x^2 - 1', hi: '1 - x^2', tex: '2-x^2-y^2', note: 'Over a lens' },
  { f: 'x y', a: '0', b: '1', lo: '0', hi: 'x', tex: 'xy', note: 'Triangle 0 ≤ y ≤ x' },
  { f: 'sqrt(1 - x^2 - y^2)', a: '-1', b: '1', lo: '-sqrt(1 - x^2)', hi: 'sqrt(1 - x^2)', tex: '\\sqrt{1-x^2-y^2}', note: 'Half a ball' },
  { f: 'e^(-x^2 - y^2)', a: '-1', b: '1', lo: '-sqrt(1 - x^2)', hi: 'sqrt(1 - x^2)', tex: 'e^{-x^2-y^2}', note: 'Unit disk' },
  { f: 'sin(x) sin(y)', a: '0', b: 'pi', lo: '0', hi: 'pi', tex: '\\sin x\\sin y' },
  { f: 'x - y', a: '0', b: '1', lo: '0', hi: '1', tex: 'x-y', note: 'Signed volume cancels' },
  { f: '1', a: '0', b: '2', lo: '0', hi: 'sqrt(x)', tex: '1', note: 'Volume = area of the region' },
]

export default {
  id: 'double',
  title: 'Double integral',
  nav: 'Double integral',
  blurb: 'Volume under a surface over a region, built from prisms or from slices: integrate across y, then across x.',
  defaults: { f: '2 - x^2 - y^2', a: '-1', b: '1', lo: 'x^2 - 1', hi: '1 - x^2', n: '8', s: '0.3' },

  mount({ controls, stage, state, save }) {
    let e = null, lo = null, hi = null, a = number(state.a), b = number(state.b), n = +state.n, s = +state.s
    let zr = [0, 1]
    const show = { surface: true, prisms: true, slice: true }
    const cache = { version: 0 }
    const f = (x, y) => e.f(x, y)
    const G = x => lo.f(x), H = x => hi.f(x)
    const inside = (x, y) => x >= Math.min(a, b) && x <= Math.max(a, b) && y >= Math.min(G(x), H(x)) && y <= Math.max(G(x), H(x))
    const section_ = x => integrate(y => f(x, y), G(x), H(x), 1e-8).value

    stage.classList.add('multi', 'pair')
    const view = new Plot3D(stage.appendChild(h('div')))
    const map = new Plot2D(stage.appendChild(h('div')), { equal: true })
    const area = new Plot2D(stage.appendChild(h('div')))
    const surf = view.group(), dyn = view.group()
    view.onTheme = () => { rebuild(); place() }

    const ready = () => e && lo && hi
    const field = exprField({ label: 'Function', value: state.f, lhs: 'f(x, y)', vars: ['x', 'y'], onChange(next, src) { e = next; state.f = src; changed() } })
    const loField = exprField({ label: 'y from', value: state.lo, preview: false, onChange(next, src) { lo = next; state.lo = src; changed() } })
    const hiField = exprField({ label: 'y to', value: state.hi, preview: false, onChange(next, src) { hi = next; state.hi = src; changed() } })
    const aField = numberField({ label: 'x from', value: state.a, onChange: (v, src) => { a = v; state.a = src; changed() } })
    const bField = numberField({ label: 'x to', value: state.b, onChange: (v, src) => { b = v; state.b = src; changed() } })
    const nSlider = slider({ label: 'Prisms per side  n', min: 1, max: 40, step: 1, value: n, format: v => String(Math.round(v)), onInput: v => { stopGrow(); n = Math.round(v); place() } })
    const sSlider = slider({ label: 'Slice at  x', min: Math.min(a, b), max: Math.max(a, b), step: 0.01, value: s, onInput: v => { stopSweep(); s = v; place() } })

    const prismToggle = toggle({ label: 'Riemann prisms', value: show.prisms, color: T.s, onChange: v => { show.prisms = v; rebuild(); place() } })
    const sliceToggle = toggle({ label: 'Cross-section slice', value: show.slice, color: T.d, onChange: v => { show.slice = v; place() } })

    // Turn a layer on before animating it.
    const reveal = (key, t) => { if (!show[key]) { show[key] = true; t.set(true); rebuild() } }
    const sweepBtn = h('button', { type: 'button', class: 'btn primary' })
    const stopSweep = playButton(sweepBtn, 'Sweep the slice', done => {
      stopGrow(); reveal('slice', sliceToggle)
      return animate(4500, t => { s = a + (b - a) * t; sSlider.set(s); place() }, done)
    })
    const growBtn = h('button', { type: 'button', class: 'btn' })
    const stopGrow = playButton(growBtn, 'Grow the prisms', done => {
      stopSweep(); reveal('prisms', prismToggle)
      return animate(6000, t => {
        const m = Math.round(1 + 39 * t ** 1.5)
        if (m !== n) { n = m; nSlider.set(n); place() }
      }, done)
    })

    controls.append(
      section(null, field.el, row(aField.el, bField.el), row(loField.el, hiField.el),
        examples(EXAMPLES, ex => {
          aField.set(ex.a); bField.set(ex.b); a = number(ex.a); b = number(ex.b)
          Object.assign(state, { a: ex.a, b: ex.b })
          loField.set(ex.lo); hiField.set(ex.hi); field.set(ex.f)
        })),
      section('Show', h('div', { class: 'toggles' },
        toggle({ label: 'Surface', value: show.surface, color: T.f, onChange: v => { show.surface = v; rebuild(); place() } }).el,
        prismToggle.el, sliceToggle.el,
      ), nSlider.el, sSlider.el, h('div', { class: 'buttons' }, sweepBtn, growBtn)),
    )

    const bar = (get, set, label) => ({ kind: 'bar', color: T.ink, label, pos: () => [get(), 0], drag: x => { set(Math.round(x * 100) / 100); changed() } })
    map.handles = [
      bar(() => a, v => { a = v; state.a = String(v); aField.set(v) }, 'a'),
      bar(() => b, v => { b = v; state.b = String(v); bField.set(v) }, 'b'),
    ]
    area.handles = [{ pos: () => [s, section_(s)], drag: x => { stopSweep(); s = clampS(x); sSlider.set(s); place() }, color: T.d }]

    map.draw = p => {
      contourMap(p, f, zr, cache, { inside, opacity: 0.9 })
      const xs = Array.from({ length: 201 }, (_, i) => a + (b - a) * i / 200)
      p.polyline(xs.map(x => [x, G(x)]), { color: T.ink, width: 2 })
      p.polyline(xs.map(x => [x, H(x)]), { color: T.ink, width: 2 })
      p.segment(a, G(a), a, H(a), { color: T.ink, width: 2 })
      p.segment(b, G(b), b, H(b), { color: T.ink, width: 2 })
      if (show.prisms) for (const [x0, x1, y0, y1] of cells()) p.rect(x0, y0, x1, y1, null, { color: T.surface, width: 0.75, alpha: 0.7 })
      if (show.slice) p.segment(s, G(s), s, H(s), { color: T.d, width: 3 })
    }

    area.draw = p => {
      p.area(section_, Math.min(a, b), Math.max(a, b), alpha(T.f, 0.18), alpha(T.d, 0.18))
      p.curve(section_, { color: T.f, width: 2.5 }, Math.min(a, b), Math.max(a, b))
      p.vline(s, { color: T.d, width: 1, dash: [4, 4] })
    }

    const clampS = x => Math.max(Math.min(a, b), Math.min(Math.max(a, b), x))

    // Prism footprints: n columns in x, each split into n rows between the y-bounds at its midpoint.
    function cells() {
      const out = [], dx = (b - a) / n
      for (let i = 0; i < n; i++) {
        const x0 = a + i * dx, xm = x0 + dx / 2, y0 = G(xm), y1 = H(xm)
        if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue
        const dy = (y1 - y0) / n
        for (let j = 0; j < n; j++) out.push([x0, x0 + dx, y0 + j * dy, y0 + (j + 1) * dy, f(xm, y0 + (j + 0.5) * dy)])
      }
      return out
    }

    function changed() {
      if (!ready()) return
      sSlider.el.querySelector('input').min = Math.min(a, b)
      sSlider.el.querySelector('input').max = Math.max(a, b)
      s = clampS(s); sSlider.set(s)
      rebuild()
      place()
    }

    function bounds() {
      let y0 = Infinity, y1 = -Infinity
      for (let i = 0; i <= 100; i++) {
        const x = a + (b - a) * i / 100
        for (const y of [G(x), H(x)]) if (Number.isFinite(y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
      }
      const px = Math.abs(b - a) * 0.08 || 0.5, py = (y1 - y0) * 0.08 || 0.5
      return { x0: Math.min(a, b) - px, x1: Math.max(a, b) + px, y0: y0 - py, y1: y1 + py }
    }

    function rebuild() {
      if (!ready()) return
      const d = bounds()
      zr = fitZ((x, y) => inside(x, y) ? f(x, y) : NaN, d, true)
      view.setDomain({ ...d, z0: zr[0], z1: zr[1] })
      view.clear(surf)
      const at = (u, v) => { const x = a + (b - a) * u; return [x, G(x) + (H(x) - G(x)) * v] }
      if (show.surface) surf.add(view.surface(f, { n: 90, at, opacity: show.prisms ? 0.55 : 1 }))
      const edge = (from, to, k = 120) => Array.from({ length: k + 1 }, (_, i) => from + (to - from) * i / k)
      const loop = [...edge(a, b).map(x => [x, G(x)]), ...edge(G(b), H(b), 20).map(y => [b, y]), ...edge(b, a).map(x => [x, H(x)]), ...edge(H(a), G(a), 20).map(y => [a, y])]
      surf.add(view.curve(loop.map(([x, y]) => [x, y, 0]), T.ink, 2))
      if (!show.prisms) {
        surf.add(view.curtain(loop.map(([x, y]) => [x, y, 0]), loop.map(([x, y]) => [x, y, f(x, y)]), T.f, 0.16))
      }
      surf.add(view.patch(loop.map(([x, y]) => [x, y, 0]), T.f, 0.12))
      cache.version++
      map.setHome({ ...d })
      const [A0, A1] = fitY(section_, Math.min(a, b), Math.max(a, b))
      const pad = Math.abs(b - a) * 0.08 || 0.5
      area.setHome({ x0: Math.min(a, b) - pad, x1: Math.max(a, b) + pad, y0: A0, y1: A1 })
    }

    function place() {
      if (!ready()) return
      view.clear(dyn)
      const cs = cells()
      if (show.prisms) dyn.add(view.prisms(cs.map(([x0, x1, y0, y1, z]) => [x0, x1, y0, y1, z]), T.s, T.d))
      if (show.slice) {
        const ys = Array.from({ length: 81 }, (_, i) => G(s) + (H(s) - G(s)) * i / 80)
        dyn.add(view.curtain(ys.map(y => [s, y, 0]), ys.map(y => [s, y, f(s, y)]), T.d, 0.55))
        dyn.add(view.curve(ys.map(y => [s, y, f(s, y)]), T.d, 3))
      }
      view.invalidate()

      map.caption(`R:\\ ${fmt(a, 3)} \\le x \\le ${fmt(b, 3)},\\ ${lo.tex} \\le y \\le ${hi.tex}`)
      area.caption(`A(x) = \\int_{${lo.tex}}^{${hi.tex}} f(x,y)\\,dy`)
      area.legend([[T.d, `A(${fmt(s, 3)}) = ${fmt(section_(s), 4)}`]])
      for (const p of [map, area]) p.invalidate()

      save({ f: state.f, a: state.a, b: state.b, lo: state.lo, hi: state.hi, n, s: +s.toFixed(3) })
    }

    return { destroy() { stopSweep(); stopGrow(); view.destroy(); map.destroy(); area.destroy() } }
  },
}
