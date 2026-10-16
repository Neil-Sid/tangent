import { tryExpr, number } from '../math/expr.js'
import { katexInline, katexBlock } from './tex.js'

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'html') el.innerHTML = v
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v)
  }
  el.append(...kids.flat().filter(k => k != null))
  return el
}

// Expression input with live TeX preview. Calls onChange(expr) only when it parses.
export function exprField({ label, value, vars = ['x'], lhs, onChange, preview: showPreview = true }) {
  const input = h('input', { class: 'expr-input', value, spellcheck: 'false', autocomplete: 'off', 'aria-label': label })
  const preview = h('div', { class: 'expr-preview' })
  const error = h('div', { class: 'expr-error' })
  const el = h('label', { class: 'field expr-field' }, h('span', { class: 'field-label' }, label), input, showPreview ? preview : null, error)

  const update = () => {
    const r = tryExpr(input.value, vars)
    if (r.error) {
      error.textContent = r.error
      el.classList.add('invalid')
      return
    }
    error.textContent = ''
    el.classList.remove('invalid')
    preview.innerHTML = katexBlock(`${lhs} = ${r.value.tex}`)
    onChange(r.value, input.value)
  }
  input.addEventListener('input', update)
  queueMicrotask(update)
  return { el, set(v) { input.value = v; update() }, get value() { return input.value } }
}

// A number box that understands pi/2, -inf, sqrt(2).
export function numberField({ label, value, onChange, width }) {
  const input = h('input', { class: 'num-input', value, spellcheck: 'false', 'aria-label': label, style: width ? `width:${width}` : null })
  const el = h('label', { class: 'num-field' }, h('span', { class: 'field-label' }, label), input)
  const read = () => {
    try {
      const v = number(input.value)
      if (!Number.isFinite(v)) throw 0
      el.classList.remove('invalid')
      onChange(v, input.value)
    } catch { el.classList.add('invalid') }
  }
  input.addEventListener('change', read)
  input.addEventListener('input', () => { try { number(input.value); read() } catch { el.classList.add('invalid') } })
  return { el, input, set(v) { input.value = typeof v === 'number' ? +v.toFixed(4) : v } }
}

export function slider({ label, min, max, step = 0.01, value, log = false, format = v => String(+(+v).toPrecision(4)), onInput }) {
  const toPos = v => log ? Math.log(v / min) / Math.log(max / min) * 1000 : v
  const fromPos = p => log ? min * (max / min) ** (p / 1000) : +p
  const range = h('input', { type: 'range', min: log ? 0 : min, max: log ? 1000 : max, step: log ? 1 : step, value: toPos(value) })
  const out = h('output', {}, format(value))
  const el = h('div', { class: 'slider' }, h('div', { class: 'slider-head' }, h('span', { class: 'field-label' }, label), out), range)
  const paint = () => el.style.setProperty('--p', `${(range.value - range.min) / (range.max - range.min) * 100}%`)
  range.addEventListener('input', () => {
    const v = fromPos(range.value)
    out.textContent = format(v)
    paint()
    onInput(v)
  })
  paint()
  return {
    el,
    set(v) { range.value = toPos(v); out.textContent = format(v); paint() },
  }
}

export function toggle({ label, value, color, onChange }) {
  const box = h('input', { type: 'checkbox', checked: value })
  box.addEventListener('change', () => onChange(box.checked))
  const el = h('label', { class: 'toggle' }, box, h('i', { class: 'switch' }), color ? h('b', { class: 'swatch', style: `--c:${color}` }) : null, h('span', {}, label))
  return { el, set: v => { box.checked = v } }
}

export function button(label, onClick, cls = '') {
  return h('button', { type: 'button', class: `btn ${cls}`, onclick: onClick }, label)
}

export function examples(list, onPick) {
  return h('div', { class: 'examples' }, h('span', { class: 'field-label' }, 'Try'),
    h('div', { class: 'chips' }, list.map(ex => {
      const b = h('button', { type: 'button', class: 'chip', title: ex.note ?? '' })
      b.innerHTML = katexInline(ex.tex)
      b.addEventListener('click', () => onPick(ex))
      return b
    })))
}

export function section(title, ...kids) {
  return h('section', { class: 'panel-section' }, title ? h('h3', {}, title) : null, ...kids)
}

export function row(...kids) { return h('div', { class: 'row-fields' }, ...kids) }
