// Headless screenshot of the running dev server: node tools/shot.mjs "#lagrange?f=x y" out.png [--dark] [--mobile] [--wait=ms] [--js="code"]
import { launch, APP_URL } from './browser.mjs'

const [hash = '', out = 'shot.png', ...flags] = process.argv.slice(2)
const opt = Object.fromEntries(flags.map(f => { const [k, ...v] = f.replace(/^--/, '').split('='); return [k, v.join('=') || true] }))
const mobile = !!opt.mobile
const browser = await launch({ width: mobile ? 390 : 1440, height: mobile ? 844 : 900 })
const page = await browser.newPage()
const errors = []
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
if (mobile) await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: '' })
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opt.dark ? 'dark' : 'light' }])
await page.goto(`${APP_URL}/${hash}`, { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, +(opt.wait ?? 600)))
if (opt.js) {
  const r = await page.evaluate(opt.js)
  if (r !== undefined) console.log('js:', JSON.stringify(r))
  await new Promise(r => setTimeout(r, 400))
}
await page.screenshot({ path: out, fullPage: !!opt.full })
console.log(errors.length ? errors.join('\n') : 'no console errors')
await browser.close()
