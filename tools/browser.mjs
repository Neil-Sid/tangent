// Headless Chrome for the test scripts. Finds an installed Chrome or Edge; set CHROME_PATH to override.
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const CANDIDATES = {
  win32: [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
    .flatMap(dir => [path.join(dir, 'Google/Chrome/Application/chrome.exe'), path.join(dir, 'Microsoft/Edge/Application/msedge.exe')]),
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
}
const ANGLE = { win32: ['--use-angle=d3d11'], darwin: ['--use-angle=metal'] }[process.platform] ?? []

export const APP_URL = process.env.APP_URL ?? 'http://localhost:5360'

export function launch({ width = 1440, height = 900 } = {}) {
  const executablePath = process.env.CHROME_PATH || (CANDIDATES[process.platform] ?? []).find(p => fs.existsSync(p))
  if (!executablePath) throw new Error('Chrome not found. Set CHROME_PATH to a Chrome or Chromium executable.')
  return puppeteer.launch({
    executablePath,
    headless: true,
    defaultViewport: { width, height },
    args: [...ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'],
  })
}
