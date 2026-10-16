const XGK = [0.991455371120812639, 0.949107912342758525, 0.864864423359769073, 0.741531185599394440,
  0.586087235467691130, 0.405845151377397167, 0.207784955007898468, 0]
const WGK = [0.022935322010529225, 0.063092092629978553, 0.104790010322250184, 0.140653259715525919,
  0.169004726639267903, 0.190350578064785410, 0.204432940075298892, 0.209482141084727828]
const WG = [0.129484966168869693, 0.279705391489276668, 0.381830050505118945, 0.417959183673469388]

function kronrod(f, a, b) {
  const c = (a + b) / 2, h = (b - a) / 2
  const fc = f(c)
  let k = fc * WGK[7], g = fc * WG[3]
  for (let i = 0; i < 7; i++) {
    const s = f(c - h * XGK[i]) + f(c + h * XGK[i])
    k += WGK[i] * s
    if (i % 2 === 1) g += WG[(i - 1) / 2] * s
  }
  return { value: k * h, error: Math.abs((k - g) * h) }
}

// Adaptive Gauss–Kronrod (7/15). Infinite bounds are mapped onto finite ones.
export function integrate(f, a, b, tol = 1e-10) {
  if (a === b) return { value: 0, error: 0, ok: true }
  if (a > b) { const r = integrate(f, b, a, tol); return { ...r, value: -r.value } }
  if (a === -Infinity && b === Infinity) return integrate(t => f(t / (1 - t * t)) * (1 + t * t) / (1 - t * t) ** 2, -1, 1, tol)
  if (b === Infinity) return integrate(t => f(a + t / (1 - t)) / (1 - t) ** 2, 0, 1, tol)
  if (a === -Infinity) return integrate(t => f(b - (1 - t) / t) / (t * t), 0, 1, tol)

  let budget = 4000
  const safe = x => { const y = f(x); return Number.isFinite(y) ? y : NaN }
  const go = (lo, hi, whole, eps, depth) => {
    const mid = (lo + hi) / 2
    const L = kronrod(safe, lo, mid), R = kronrod(safe, mid, hi)
    const value = L.value + R.value
    const error = Math.abs(value - whole.value) + L.error + R.error
    if (--budget <= 0 || depth > 48 || error < eps || !Number.isFinite(value)) return { value, error }
    const l = go(lo, mid, L, eps / 2, depth + 1), r = go(mid, hi, R, eps / 2, depth + 1)
    return { value: l.value + r.value, error: l.error + r.error }
  }
  const first = kronrod(safe, a, b)
  const res = first.error < tol * 1e-3 ? first : go(a, b, first, tol, 0)
  return { ...res, ok: Number.isFinite(res.value) && res.error < Math.max(1e-6, Math.abs(res.value) * 1e-6) }
}

export function fmt(v, digits = 6) {
  if (v === Infinity) return '\\infty'
  if (v === -Infinity) return '-\\infty'
  if (!Number.isFinite(v)) return '\\text{undefined}'
  if (Math.abs(v) < 1e-12) return '0'
  const a = Math.abs(v)
  if (a >= 1e6 || a < 1e-4) {
    const [m, e] = v.toExponential(digits - 2).split('e')
    return `${+m}\\times 10^{${+e}}`
  }
  return String(+v.toPrecision(digits))
}

export const fmtPlain = (v, digits = 5) => !Number.isFinite(v) ? (Number.isNaN(v) ? '—' : v > 0 ? '∞' : '−∞')
  : Math.abs(v) < 1e-12 ? '0' : Math.abs(v) >= 1e6 || Math.abs(v) < 1e-4 ? v.toExponential(digits - 2) : String(+v.toPrecision(digits))
