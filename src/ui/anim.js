// rAF tween: step(t) with t from 0 to 1 over ms. Returns a cancel function.
export function animate(ms, step, done) {
  let id, start
  const tick = now => {
    start ??= now
    const t = Math.min(1, (now - start) / ms)
    step(t)
    if (t < 1) id = requestAnimationFrame(tick)
    else done?.()
  }
  id = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(id)
}

export const ease = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2

// A button that runs an animation and turns into "Stop" while it plays.
export function playButton(button, label, start) {
  let cancel = null
  const stop = () => { cancel?.(); cancel = null; button.textContent = label }
  button.textContent = label
  button.addEventListener('click', () => {
    if (cancel) return stop()
    button.textContent = 'Stop'
    cancel = start(stop)
  })
  return stop
}
