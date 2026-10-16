import { expr, diff } from '../src/math/expr.js'
import { integrate } from '../src/math/numeric.js'
import { isolines } from '../src/math/isolines.js'

// Double integrals against known answers
const cases = [
  ['x y', 0, 1, '0', 'x', 1 / 8],
  ['2 - x^2 - y^2', -1, 1, 'x^2 - 1', '1 - x^2', 88 / 21],
  ['sqrt(1 - x^2 - y^2)', -1, 1, '-sqrt(1 - x^2)', 'sqrt(1 - x^2)', 2 * Math.PI / 3],
  ['sin(x) sin(y)', 0, Math.PI, '0', 'pi', 4],
  ['e^(-x^2 - y^2)', -1, 1, '-sqrt(1 - x^2)', 'sqrt(1 - x^2)', Math.PI * (1 - 1 / Math.E)],
]
let bad = 0
for (const [f, a, b, lo, hi, want] of cases) {
  const F = expr(f, ['x', 'y']), G = expr(lo), H = expr(hi)
  const r = integrate(x => integrate(y => F.f(x, y), G.f(x), H.f(x), 1e-9).value, a, b, 1e-8)
  const ok = Math.abs(r.value - want) < 1e-6
  bad += !ok
  console.log(`${ok ? '✓' : '✗'} ∬ ${f} = ${r.value} (want ${want})`)
}

// Partial derivatives at a point
const g = expr('(x^2 + 3y^2) e^(1 - x^2 - y^2)', ['x', 'y'])
for (const [v, want] of [['x', -1.8122], ['y', -0.3189]]) {
  const d = diff(g, v).f(0.6, -0.9)
  const ok = Math.abs(d - want) < 1e-3
  bad += !ok
  console.log(`${ok ? '✓' : '✗'} f_${v}(0.6, -0.9) = ${d.toFixed(4)}`)
}

// Constraint curves: one closed circle, one open line, two hyperbola branches, all on the curve
const box = { x0: -2, x1: 2, y0: -2, y1: 2 }
for (const [name, g, c, pieces, closed] of [['circle', (x, y) => x * x + y * y, 1, 1, true], ['line', (x, y) => x + y, 1, 1, false], ['hyperbola', (x, y) => x * y, 0.5, 2, false]]) {
  const ls = isolines(g, box, c)
  const err = Math.max(...ls.flatMap(l => l.points.map(([x, y]) => Math.abs(g(x, y) - c))))
  const ok = ls.length === pieces && ls.every(l => l.closed === closed) && err < 1e-6
  bad += !ok
  console.log(`${ok ? '✓' : '✗'} ${name}: ${ls.length} piece(s), closed=${ls.map(l => l.closed)}, max error ${err.toExponential(1)}`)
}

// Loose input
for (const s of ['2xy', 'xsin(y)', '|x|+|y|', 'sin x cos y', 'x²+y²']) console.log(`  ${s} → ${expr(s, ['x', 'y']).text}`)
process.exit(bad ? 1 : 0)
