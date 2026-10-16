// Live palette read from CSS custom properties so canvas and three.js follow light/dark mode.
const NAMES = ['bg', 'surface', 'ink', 'ink-2', 'muted', 'line', 'grid', 'grid-minor', 'axis', 'f', 'd', 's', 'g', 'pos', 'neg', 'band', 'band-2']
export const T = {}
const listeners = new Set()

export function readTheme() {
  const cs = getComputedStyle(document.documentElement)
  for (const n of NAMES) T[n.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = cs.getPropertyValue(`--${n}`).trim()
  T.font = cs.getPropertyValue('--font-ui').trim()
}

export function onTheme(fn) { listeners.add(fn); return () => listeners.delete(fn) }

readTheme()
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  readTheme()
  listeners.forEach(fn => fn())
})

// Sequential height colormap (deep indigo → teal → sand), t in [0, 1].
const STOPS = [[38, 42, 110], [40, 98, 170], [46, 150, 160], [128, 196, 140], [238, 222, 160]]
export function heat(t) {
  t = Math.min(1, Math.max(0, t)) * (STOPS.length - 1)
  const i = Math.min(STOPS.length - 2, Math.floor(t)), u = t - i
  const a = STOPS[i], b = STOPS[i + 1]
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}

export function alpha(color, a) {
  if (color.startsWith('#')) {
    const n = parseInt(color.length === 4 ? color.slice(1).replace(/./g, c => c + c) : color.slice(1), 16)
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`
  }
  return color
}
