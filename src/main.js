import '@fontsource-variable/inter'
import '@fontsource-variable/newsreader'
import 'katex/dist/katex.min.css'
import './style.css'
import { h } from './ui/controls.js'
import partial from './modes/partial.js'
import lagrange from './modes/lagrange.js'
import double from './modes/double.js'

const MODES = [partial, lagrange, double]
const nav = document.getElementById('modes')
const panel = document.getElementById('panel')
const stage = document.getElementById('stage')
let current = null

for (const m of MODES) nav.append(h('a', { href: `#${m.id}`, 'data-id': m.id }, m.nav ?? m.title))

function readHash() {
  const [id, query = ''] = location.hash.slice(1).split('?')
  return { mode: MODES.find(m => m.id === id) ?? MODES[0], state: Object.fromEntries(new URLSearchParams(query)) }
}

// Modes call save() with their string state; it lands in the URL so any view can be shared.
let saveTimer
function save(id, state) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const q = new URLSearchParams(state).toString().replace(/%2F/g, '/').replace(/%5E/g, '^').replace(/%28/g, '(').replace(/%29/g, ')').replace(/%2C/g, ',')
    history.replaceState(null, '', `#${id}?${q}`)
  }, 250)
}

function open() {
  const { mode, state } = readHash()
  if (current?.mode === mode) return
  current?.view.destroy?.()
  panel.replaceChildren()
  stage.replaceChildren()
  stage.className = 'stage'
  nav.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.id === mode.id))
  document.title = `${mode.title} — Tangent`

  const top = h('div', { class: 'panel-top' }, h('h1', {}, mode.title), h('p', { class: 'blurb' }, mode.blurb))
  const readout = h('div', { class: 'panel-results' })
  panel.append(top, readout)
  const view = mode.mount({ controls: top, readout, stage, state: { ...mode.defaults, ...state }, save: s => save(mode.id, s) })
  current = { mode, view }
}

addEventListener('hashchange', open)
open()
