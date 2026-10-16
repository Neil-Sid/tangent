// Clicks through every topic: examples, toggles, sliders, buttons, pan/zoom. Fails on any console error.
import { launch, APP_URL } from './browser.mjs'

const MODES = ['partial', 'lagrange', 'double']
const browser = await launch({ width: 1440, height: 900 })
const page = await browser.newPage()
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(e.message))
const wait = ms => new Promise(r => setTimeout(r, ms))

for (const mode of MODES) {
  const before = errors.length
  await page.goto(`${APP_URL}/#${mode}`, { waitUntil: 'networkidle0' })
  await wait(800)
  const chips = await page.$$('.chip')
  for (const chip of chips) { await chip.click(); await wait(250) }
  for (const t of await page.$$('.toggle')) { await t.click(); await wait(80); await t.click(); await wait(80) }
  for (const seg of await page.$$('.segmented button')) { await seg.click(); await wait(80) }
  await page.$$eval('input[type=range]', rs => rs.forEach(r => { r.value = (+r.min + +r.max) / 2.7; r.dispatchEvent(new Event('input')) }))
  await wait(300)
  for (const canvas of await page.$$('.plot canvas, .view3d canvas')) {
    const b = await canvas.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2 + 30, { steps: 5 }); await page.mouse.up()
    await page.mouse.wheel({ deltaY: -200 })
    await page.mouse.click(b.x + b.width * 0.45, b.y + b.height * 0.55)
  }
  for (const btn of await page.$$('.btn')) { await btn.click(); await wait(400) }
  await page.type('.expr-input', ' + (')
  await wait(200)
  const invalid = await page.$eval('.expr-field', el => el.classList.contains('invalid'))
  console.log(`${mode.padEnd(11)} chips ${chips.length}  errors ${errors.length - before}  bad input flagged ${invalid}  hash ${(await page.evaluate(() => location.hash)).slice(0, 60)}`)
}
if (errors.length) console.log(errors.join('\n'))
await browser.close()
process.exit(errors.length ? 1 : 0)
