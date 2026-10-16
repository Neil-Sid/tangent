import { parse, derivative, simplify } from 'mathjs'

const ALIASES = { ln: 'log', arcsin: 'asin', arccos: 'acos', arctan: 'atan', arcsec: 'asec', arccsc: 'acsc', arccot: 'acot' }

const FUNCS = {
  sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan', asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan',
  sinh: 'Math.sinh', cosh: 'Math.cosh', tanh: 'Math.tanh', asinh: 'Math.asinh', acosh: 'Math.acosh', atanh: 'Math.atanh',
  exp: 'Math.exp', log: 'H.log', log10: 'Math.log10', log2: 'Math.log2', sqrt: 'Math.sqrt', cbrt: 'Math.cbrt',
  abs: 'Math.abs', sign: 'Math.sign', floor: 'Math.floor', ceil: 'Math.ceil', round: 'Math.round',
  min: 'Math.min', max: 'Math.max', atan2: 'Math.atan2',
  sec: 'H.sec', csc: 'H.csc', cot: 'H.cot', asec: 'H.asec', acsc: 'H.acsc', acot: 'H.acot',
  sech: 'H.sech', csch: 'H.csch', coth: 'H.coth', gamma: 'H.gamma', nthRoot: 'H.root', mod: 'H.mod',
}
const CONSTS = { pi: 'Math.PI', e: 'Math.E', tau: '(2*Math.PI)', phi: '1.618033988749895' }

const H = {
  sec: x => 1 / Math.cos(x), csc: x => 1 / Math.sin(x), cot: x => 1 / Math.tan(x),
  asec: x => Math.acos(1 / x), acsc: x => Math.asin(1 / x), acot: x => Math.atan(1 / x),
  sech: x => 1 / Math.cosh(x), csch: x => 1 / Math.sinh(x), coth: x => 1 / Math.tanh(x),
  log: (x, b) => b === undefined ? Math.log(x) : Math.log(x) / Math.log(b),
  mod: (a, b) => ((a % b) + b) % b,
  root: (x, n = 2) => H.pow(x, 1 / n),
  pow(a, b) {
    if (a >= 0 || Number.isInteger(b)) return Math.pow(a, b)
    // real odd roots of negatives, e.g. x^(1/3) or x^(2/5)
    for (let q = 3; q < 16; q += 2) {
      const p = Math.round(b * q)
      if (Math.abs(b * q - p) < 1e-9) return (p % 2 ? -1 : 1) * Math.pow(-a, b)
    }
    return NaN
  },
  fact: n => H.gamma(n + 1),
  gamma(z) {
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * H.gamma(1 - z))
    const g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
    z -= 1
    let x = g[0]
    for (let i = 1; i < 9; i++) x += g[i] / (z + i)
    const t = z + 7.5
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x
  },
}

// Turn loose human input into something math.js parses: "2xy", "|x|", "ln x²", "xsin(y)".
export function normalize(src, vars) {
  let s = src
    .replace(/π/g, 'pi').replace(/²/g, '^2').replace(/³/g, '^3').replace(/[·×]/g, '*')
    .replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/√/g, 'sqrt').replace(/∞/g, 'Infinity')
    .replace(/\*\*/g, '^')
  s = absBars(s)
  const fns = [...Object.keys(FUNCS), ...Object.keys(ALIASES)]
  const known = [...fns, ...Object.keys(CONSTS), ...vars, 'Infinity'].sort((a, b) => b.length - a.length)
  // "sin x" → "sin(x)"
  s = s.replace(new RegExp(`\\b(${fns.join('|')})\\s+([A-Za-z0-9.]+)`, 'g'), '$1($2)')
  return s.replace(/[A-Za-z_][A-Za-z_0-9]*/g, word => {
    if (known.includes(word)) return ALIASES[word] ?? word
    const parts = []
    let rest = word
    while (rest) {
      const hit = known.find(k => rest.startsWith(k))
      if (!hit) return word
      rest = rest.slice(hit.length)
      // "sinx" → "sin(x)", "xcosy" → "x*cos(y)"
      if (fns.includes(hit) && rest) return [...parts, `${ALIASES[hit] ?? hit}(${normalize(rest, vars)})`].join('*')
      parts.push(ALIASES[hit] ?? hit)
    }
    return parts.join('*')
  })
}

function absBars(s) {
  let out = '', depth = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '|') { out += s[i]; continue }
    const prev = out.trimEnd().slice(-1)
    const opens = depth === 0 || prev === '' || '+-*/^(,'.includes(prev)
    if (opens) { out += 'abs('; depth++ } else { out += ')'; depth-- }
  }
  return out
}

function toJs(node, vars) {
  const r = n => toJs(n, vars)
  switch (node.type) {
    case 'ConstantNode': return `(${Number(node.value)})`
    case 'SymbolNode':
      if (vars.includes(node.name)) return node.name
      if (node.name in CONSTS) return CONSTS[node.name]
      if (node.name === 'Infinity') return 'Infinity'
      throw new Error(`Unknown symbol “${node.name}”. Use ${vars.join(', ')}`)
    case 'ParenthesisNode': return r(node.content)
    case 'OperatorNode': {
      const [a, b] = node.args
      if (node.fn === 'unaryMinus') return `(-${r(a)})`
      if (node.fn === 'unaryPlus') return r(a)
      if (node.op === '^') return `H.pow(${r(a)},${r(b)})`
      if (node.op === '!') return `H.fact(${r(a)})`
      if (node.op === 'mod' || node.op === '%') return `H.mod(${r(a)},${r(b)})`
      if ('+-*/'.includes(node.op)) return `(${node.args.map(r).join(node.op)})`
      throw new Error(`Operator “${node.op}” isn't supported`)
    }
    case 'FunctionNode': {
      const name = ALIASES[node.fn.name] ?? node.fn.name
      if (!(name in FUNCS)) throw new Error(`Unknown function “${node.fn.name}”`)
      return `${FUNCS[name]}(${node.args.map(r).join(',')})`
    }
    default: throw new Error('Unsupported expression')
  }
}

function compile(node, vars) {
  const body = toJs(node, vars)
  return new Function('H', `return (${vars.join(',')}) => ${body}`)(H)
}

function texHandler(node, options) {
  if (node.type === 'FunctionNode' && node.fn.name === 'exp') return `e^{${node.args[0].toTex(options)}}`
  if (node.type === 'OperatorNode' && node.op === '*' && node.args.length === 2) {
    const [a, b] = node.args
    const symbolic = n => n.type === 'SymbolNode' || (n.type === 'OperatorNode' && n.op === '^' && n.args[0].type === 'SymbolNode')
    const leftOk = a.type === 'ConstantNode' || symbolic(a) || (a.type === 'OperatorNode' && a.op === '*' && a.args.every(n => n.type === 'ConstantNode' || symbolic(n)))
    const rightOk = symbolic(b) || (b.type === 'FunctionNode' && (a.type === 'ConstantNode' || symbolic(a)))
    if (leftOk && rightOk) return a.toTex(options) + b.toTex(options)
  }
}

export const tex = node => node.toTex({ handler: texHandler, parenthesis: 'auto', implicit: 'hide' }).replace(/\{ (\w)\}/g, '{$1}')

// A parsed expression with its fast evaluator, TeX form and a CAS-friendly string.
export function expr(src, vars = ['x']) {
  const node = parse(normalize(src, vars))
  return wrap(node, vars)
}

function wrap(node, vars) {
  return {
    node, vars,
    f: compile(node, vars),
    tex: tex(node),
    text: node.toString({ implicit: 'show' }),
  }
}

// Symbolic derivative; null if math.js can't differentiate it (floor, min, ...).
export function diff(e, v) {
  try {
    const d = simplify(derivative(e.node, v))
    return wrap(d, e.vars)
  } catch {
    return null
  }
}

export function tryExpr(src, vars) {
  try { return { value: expr(src, vars) } } catch (err) { return { error: err.message.replace(/\(char \d+\)/, '').trim() } }
}

// Numbers typed into bound fields: "pi/2", "-inf", "sqrt(2)".
export function number(src) {
  const s = String(src).trim().toLowerCase()
  if (/^\+?(inf|infinity|∞|oo)$/.test(s)) return Infinity
  if (/^-(inf|infinity|∞|oo)$/.test(s)) return -Infinity
  return expr(s, []).f()
}

