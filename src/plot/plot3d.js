import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { T, onTheme, heat } from './theme.js'

const BOX = 10, HEIGHT = 6

// Everything is clipped to the top and bottom of the box; the planes never change.
const CLIP = [
  new THREE.Plane(new THREE.Vector3(0, 0, -1), HEIGHT / 2 + 1e-3),
  new THREE.Plane(new THREE.Vector3(0, 0, 1), HEIGHT / 2 + 1e-3),
]

const niceStep = raw => {
  const p = 10 ** Math.floor(Math.log10(raw)), m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}
const tick = v => String(+v.toPrecision(3)).replace('-', '−')
const afterPaint = () => new Promise(r => requestAnimationFrame(() => setTimeout(r)))

// One WebGL renderer for the whole app. Creating a context and compiling shaders are the slow parts
// of opening a 3D view, so they happen once, after the page has painted, and every view reuses them.
let renderer = null
function sharedRenderer(warmUp) {
  renderer ??= (async () => {
    await afterPaint()
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    r.setPixelRatio(Math.min(devicePixelRatio, 2))
    r.localClippingEnabled = true
    await afterPaint()
    // compile every shader variant the views use without blocking the page;
    // the warm-up materials are never disposed, so their programs stay cached
    const { scene, camera } = warmUp()
    await r.compileAsync(scene, camera)
    return r
  })()
  return renderer
}

// A z-up three.js stage mapping math coordinates (x, y, z) into a fixed-size box.
export class Plot3D {
  constructor(host) {
    this.host = host
    host.classList.add('view3d')
    host.insertAdjacentHTML('beforeend', '<div class="loading3d"><i></i>Preparing 3D…</div><div class="hint">Drag to orbit · scroll to zoom</div>')
    this.labels = new CSS2DRenderer()
    Object.assign(this.labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
    host.append(this.labels.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400)
    this.camera.up.set(0, 0, 1)
    this.camera.position.set(-12, -24, 13)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.9)
    sun.position.set(6, -8, 14)
    this.scene.add(sun)

    this.frame = this.group()
    this.materials = new Map()
    this.scale({ x0: -1, x1: 1, y0: -1, y1: 1, z0: -1, z1: 1 })
    this.offTheme = onTheme(() => this.onTheme?.())
    this.start()
  }

  async start() {
    const gl = await sharedRenderer(() => this.warmUpScene())
    if (this.dead) return
    this.gl = gl
    this.events = new AbortController()
    this.host.prepend(gl.domElement)
    this.controls = new OrbitControls(this.camera, gl.domElement)
    this.controls.enableDamping = true
    this.controls.addEventListener('change', () => this.invalidate())
    this.resizeObs = new ResizeObserver(([entry]) => this.resize(entry.contentRect))
    this.resizeObs.observe(this.host)
    this.bindPick()
    this.host.classList.add('ready')
  }

  destroy() {
    this.dead = true
    cancelAnimationFrame(this.raf)
    this.offTheme()
    this.resizeObs?.disconnect()
    this.events?.abort()
    this.controls?.dispose()
    for (const g of [...this.scene.children]) if (g.isGroup) this.clear(g)
    for (const m of this.materials.values()) m.dispose()
    if (this.gl?.domElement.parentNode === this.host) this.gl.domElement.remove()
  }

  resize({ width, height }) {
    if (!width || !height || !this.gl) return
    this.size = [width, height]
    this.gl.setSize(width, height, false)
    this.labels.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    // tall viewports need the camera further back to fit the box
    const reach = 27 * Math.max(1, 1.1 / this.camera.aspect) ** 0.75
    this.camera.position.sub(this.controls.target).setLength(reach).add(this.controls.target)
    for (const m of this.materials.values()) if (m.isLineMaterial) m.resolution.set(width, height)
    this.invalidate()
  }

  invalidate() {
    if (this.raf || !this.gl) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      const moving = this.controls.update()
      this.gl.render(this.scene, this.camera)
      this.labels.render(this.scene, this.camera)
      if (moving) this.invalidate()
    })
  }

  // One of each object the views draw, so compileAsync sees every shader variant up front.
  warmUpScene() {
    const own = this.materials, mesh = this.surfaceMesh
    this.materials = new Map()
    const scene = new THREE.Scene()
    scene.add(...this.scene.children.filter(c => c.isLight).map(l => l.clone()))
    scene.add(
      this.surface(() => 0, { n: 2 }),
      this.surface(() => 0, { n: 2, opacity: 0.5 }),
      this.curve([[0, 0, 0], [1, 1, 0]], '#888'),
      this.curve([[0, 0, 0], [1, 1, 0]], '#888', 2, { dashed: true }),
      this.arrow([0, 0, 0], [1, 1, 0], '#888'),
      this.point(0, 0, 0, '#888'),
      this.patch([[0, 0, 0], [1, 0, 0], [1, 1, 0]], '#888'),
      this.prisms([[0, 1, 0, 1, 1]], '#888', '#444'),
      segments([new THREE.Vector3(), new THREE.Vector3(1, 1, 1)], this.lineBasic('#888')),
    )
    this.materials = own
    this.surfaceMesh = mesh
    return { scene, camera: this.camera }
  }

  // ——— coordinates ———

  scale(d) {
    this.domain = { ...d }
    this.sx = BOX / Math.max(d.x1 - d.x0, d.y1 - d.y0)
    this.sz = HEIGHT / (d.z1 - d.z0)
    this.cx = (d.x0 + d.x1) / 2; this.cy = (d.y0 + d.y1) / 2; this.cz = (d.z0 + d.z1) / 2
  }

  setDomain(d) {
    this.scale(d)
    this.drawFrame()
  }

  group() { const g = new THREE.Group(); this.scene.add(g); return g }

  w(x, y, z) { return new THREE.Vector3((x - this.cx) * this.sx, (y - this.cy) * this.sx, (z - this.cz) * this.sz) }
  inZ(z) { return z >= this.domain.z0 && z <= this.domain.z1 }

  // Removes a group's children. Geometry is freed; materials are shared, so they stay.
  clear(group) {
    for (const o of [...group.children]) {
      group.remove(o)
      o.traverse(c => {
        c.geometry?.dispose()
        if (c.isCSS2DObject) c.element.remove()
      })
    }
  }

  // Materials are shared by look, so redrawing while you drag P creates no new uniforms or shaders.
  shared(key, make) {
    let m = this.materials.get(key)
    if (!m) this.materials.set(key, m = make())
    return m
  }

  lineBasic(color, opacity = 1, clip = false) {
    return this.shared(`basic-line ${color} ${opacity} ${clip}`, () => new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, clippingPlanes: clip ? CLIP : null }))
  }

  fatLine(color, width, dashed, clip) {
    return this.shared(`fat ${color} ${width} ${dashed} ${clip}`, () => {
      const m = new LineMaterial({ color: new THREE.Color(color), linewidth: width, dashed, dashSize: 0.25, gapSize: 0.18, worldUnits: false, clippingPlanes: clip ? CLIP : null })
      m.resolution.set(...(this.size ?? [1, 1]))
      return m
    })
  }

  solid(color) { return this.shared(`solid ${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.4 })) }

  glass(color, opacity) {
    return this.shared(`glass ${color} ${opacity}`, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: CLIP }))
  }

  // Floor grid, faint box edges and tick labels.
  drawFrame() {
    this.clear(this.frame)
    const d = this.domain, g = this.frame
    const floor = [], edges = []
    const sx = niceStep((d.x1 - d.x0) / 6), sy = niceStep((d.y1 - d.y0) / 6), sz = niceStep((d.z1 - d.z0) / 5)
    for (let x = Math.ceil(d.x0 / sx) * sx; x <= d.x1 + 1e-9; x += sx) floor.push(this.w(x, d.y0, d.z0), this.w(x, d.y1, d.z0))
    for (let y = Math.ceil(d.y0 / sy) * sy; y <= d.y1 + 1e-9; y += sy) floor.push(this.w(d.x0, y, d.z0), this.w(d.x1, y, d.z0))
    const c = [[d.x0, d.y0], [d.x1, d.y0], [d.x1, d.y1], [d.x0, d.y1]]
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = c[i], [bx, by] = c[(i + 1) % 4]
      edges.push(this.w(ax, ay, d.z0), this.w(bx, by, d.z0))
      if (i === 3 || i === 2) edges.push(this.w(ax, ay, d.z1), this.w(bx, by, d.z1))
    }
    edges.push(this.w(d.x0, d.y1, d.z0), this.w(d.x0, d.y1, d.z1), this.w(d.x1, d.y1, d.z0), this.w(d.x1, d.y1, d.z1), this.w(d.x0, d.y0, d.z0), this.w(d.x0, d.y0, d.z1))
    g.add(segments(floor, this.lineBasic(T.grid)), segments(edges, this.lineBasic(T.line)))
    // the z = 0 plane, when in view
    if (d.z0 < 0 && d.z1 > 0) {
      const zero = []
      for (let i = 0; i < 4; i++) { const [ax, ay] = c[i], [bx, by] = c[(i + 1) % 4]; zero.push(this.w(ax, ay, 0), this.w(bx, by, 0)) }
      g.add(segments(zero, this.lineBasic(T.axis)))
    }
    for (let x = Math.ceil(d.x0 / sx) * sx; x <= d.x1 + 1e-9; x += sx) g.add(this.label(tick(x), this.w(x, d.y0, d.z0).add(new THREE.Vector3(0, -0.5, 0))))
    for (let y = Math.ceil(d.y0 / sy) * sy; y <= d.y1 + 1e-9; y += sy) g.add(this.label(tick(y), this.w(d.x1, y, d.z0).add(new THREE.Vector3(0.5, 0, 0))))
    for (let z = Math.ceil(d.z0 / sz) * sz; z <= d.z1 + 1e-9; z += sz) g.add(this.label(tick(z), this.w(d.x0, d.y0, z).add(new THREE.Vector3(-0.45, -0.45, 0))))
    g.add(this.label('x', this.w((d.x0 + d.x1) / 2, d.y0, d.z0).add(new THREE.Vector3(0, -1.3, 0)), 'axis'))
    g.add(this.label('y', this.w(d.x1, (d.y0 + d.y1) / 2, d.z0).add(new THREE.Vector3(1.3, 0, 0)), 'axis'))
    g.add(this.label('z', this.w(d.x0, d.y0, d.z1).add(new THREE.Vector3(-0.6, -0.6, 0.5)), 'axis'))
    this.invalidate()
  }

  label(text, pos, cls = '') {
    const el = document.createElement('div')
    el.className = `label3d ${cls}`
    el.textContent = text
    const o = new CSS2DObject(el)
    o.position.copy(pos)
    return o
  }

  // ——— geometry ———

  // Height-colored surface over a parametrized patch: at(u, v) → [x, y]. Rectangle by default.
  surface(f, { n = 96, at = (u, v) => [this.domain.x0 + (this.domain.x1 - this.domain.x0) * u, this.domain.y0 + (this.domain.y1 - this.domain.y0) * v], opacity = 1, grid = true } = {}) {
    const d = this.domain, pos = new Float32Array((n + 1) ** 2 * 3), col = new Float32Array((n + 1) ** 2 * 3), ok = new Uint8Array((n + 1) ** 2)
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const k = j * (n + 1) + i, [x, y] = at(i / n, j / n)
      let z = f(x, y)
      ok[k] = Number.isFinite(z)
      if (!ok[k]) z = 0
      const zc = Math.max(d.z0 - (d.z1 - d.z0), Math.min(d.z1 + (d.z1 - d.z0), z))
      const p = this.w(x, y, zc)
      pos.set([p.x, p.y, p.z], k * 3)
      const [r, g, b] = heat((z - d.z0) / (d.z1 - d.z0))
      col.set([r / 255, g / 255, b / 255], k * 3)
    }
    const idx = []
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, e = c + 1
      if (ok[a] && ok[b] && ok[c] && ok[e]) idx.push(a, b, e, a, e, c)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, this.shared(`surface ${opacity}`, () => new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, metalness: 0,
      transparent: opacity < 1, opacity, clippingPlanes: CLIP, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    })))
    const group = new THREE.Group()
    group.add(mesh)
    if (grid) {
      const lines = [], step = n / 12
      for (let s = 0; s <= n; s += step) for (let t = 0; t < n; t++) {
        for (const [a, b] of [[Math.round(s) * (n + 1) + t, Math.round(s) * (n + 1) + t + 1], [t * (n + 1) + Math.round(s), (t + 1) * (n + 1) + Math.round(s)]]) {
          if (!ok[a] || !ok[b]) continue
          lines.push(new THREE.Vector3().fromArray(pos, a * 3), new THREE.Vector3().fromArray(pos, b * 3))
        }
      }
      group.add(segments(lines, this.lineBasic('#000000', 0.16, true)))
    }
    this.surfaceMesh = mesh
    return group
  }

  // Fat polyline through math points; breaks where a value is missing or far outside the box.
  curve(points, color, width = 3, { dashed = false, clip = true } = {}) {
    const g = new THREE.Group()
    let run = []
    const flush = () => {
      if (run.length > 1) {
        const geo = new LineGeometry()
        geo.setPositions(run)
        const line = new Line2(geo, this.fatLine(color, width, dashed, clip))
        if (dashed) line.computeLineDistances()
        g.add(line)
      }
      run = []
    }
    const far = 3 * (this.domain.z1 - this.domain.z0)
    for (const [x, y, z] of points) {
      if (![x, y, z].every(Number.isFinite) || (clip && (z < this.domain.z0 - far || z > this.domain.z1 + far))) { flush(); continue }
      const p = this.w(x, y, z)
      run.push(p.x, p.y, p.z)
    }
    flush()
    return g
  }

  point(x, y, z, color, r = 0.16) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), this.solid(color))
    m.position.copy(this.w(x, y, z))
    return m
  }

  // Flat translucent polygon from math-space corners.
  patch(corners, color, opacity = 0.25) {
    const pts = corners.filter(p => p.every(Number.isFinite)).map(([x, y, z]) => this.w(x, y, z))
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const idx = []
    for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1)
    geo.setIndex(idx)
    return new THREE.Mesh(geo, this.glass(color, opacity))
  }

  // Arrow in math space; the head is sized in world units so it stays readable.
  arrow(from, to, color, width = 3.5) {
    const a = this.w(...from), b = this.w(...to)
    const dir = b.clone().sub(a)
    const len = dir.length()
    const g = new THREE.Group()
    if (len < 1e-6) return g
    const head = Math.min(0.55, len * 0.4)
    const shaft = a.clone().add(dir.clone().setLength(len - head))
    const geo = new LineGeometry()
    geo.setPositions([a.x, a.y, a.z, shaft.x, shaft.y, shaft.z])
    g.add(new Line2(geo, this.fatLine(color, width, false, false)))
    const cone = new THREE.Mesh(new THREE.ConeGeometry(head * 0.42, head, 20), this.solid(color))
    cone.position.copy(shaft.clone().add(dir.clone().setLength(head / 2)))
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
    g.add(cone)
    return g
  }

  // Boxes from z = 0 up to each height: [x0, x1, y0, y1, h]
  prisms(cells, posColor, negColor) {
    const material = this.shared('prisms', () => new THREE.MeshStandardMaterial({ roughness: 0.6, transparent: true, opacity: 0.88, clippingPlanes: CLIP }))
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, cells.length)
    const white = new THREE.Color('#ffffff')
    const m = new THREE.Matrix4(), cPos = new THREE.Color(posColor).lerp(white, 0.3), cNeg = new THREE.Color(negColor).lerp(white, 0.3)
    cells.forEach(([x0, x1, y0, y1, h], i) => {
      const z = Number.isFinite(h) ? h : 0
      const a = this.w(x0, y0, Math.min(0, z)), b = this.w(x1, y1, Math.max(0, z))
      m.makeScale(Math.max(1e-4, b.x - a.x) * 0.94, Math.max(1e-4, b.y - a.y) * 0.94, Math.max(1e-4, b.z - a.z))
      m.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
      mesh.setMatrixAt(i, m)
      mesh.setColorAt(i, z >= 0 ? cPos : cNeg)
    })
    return mesh
  }

  // Vertical curtain between two math-space polylines (bottom and top), used for slices and walls.
  curtain(bottom, top, color, opacity = 0.18) {
    const pos = [], idx = []
    const fin = p => p.map(v => Number.isFinite(v) ? v : 0)
    bottom.forEach((p, i) => { pos.push(this.w(...fin(p)), this.w(...fin(top[i]))) })
    for (let i = 0; i < bottom.length - 1; i++) {
      const a = 2 * i
      if ([bottom[i], top[i], bottom[i + 1], top[i + 1]].every(p => p.every(Number.isFinite))) idx.push(a, a + 1, a + 3, a, a + 3, a + 2)
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pos)
    geo.setIndex(idx)
    return new THREE.Mesh(geo, this.glass(color, opacity))
  }

  // Click (not drag) on the surface reports the math (x, y) under the pointer.
  bindPick() {
    const el = this.gl.domElement, ray = new THREE.Raycaster(), signal = this.events.signal
    let down = null
    el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY] }, { signal })
    el.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || !this.onPick || !this.surfaceMesh) return
      const r = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), this.camera)
      const hit = ray.intersectObject(this.surfaceMesh)[0]
      if (hit) this.onPick(hit.point.x / this.sx + this.cx, hit.point.y / this.sx + this.cy)
    }, { signal })
  }
}

function segments(points, material) {
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material)
}

// z-range that frames f over a rectangle, ignoring spikes.
export function fitZ(f, d, zero = false) {
  const zs = []
  for (let j = 0; j <= 60; j++) for (let i = 0; i <= 60; i++) {
    const z = f(d.x0 + (d.x1 - d.x0) * i / 60, d.y0 + (d.y1 - d.y0) * j / 60)
    if (Number.isFinite(z)) zs.push(z)
  }
  if (!zs.length) return [-1, 1]
  zs.sort((a, b) => a - b)
  // keep real peaks; only trim tails that look like spikes (poles)
  const p2 = zs[Math.floor(zs.length * 0.02)], p98 = zs[Math.ceil(zs.length * 0.98) - 1], body = Math.max(p98 - p2, 1e-9)
  let lo = zs[0] < p2 - body ? p2 : zs[0], hi = zs.at(-1) > p98 + body ? p98 : zs.at(-1)
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0) }
  if (hi - lo < 1e-9) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.08
  return [lo - pad, hi + pad]
}
