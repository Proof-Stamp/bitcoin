import assert from 'node:assert/strict'
import path from 'node:path'

const [baseUrl, fixturePath, devtoolsBaseUrl] = process.argv.slice(2)
if (!baseUrl || !fixturePath || !devtoolsBaseUrl) {
  throw new Error('Usage: node scripts/browser-smoke.mjs <base-url> <fixture-path> <devtools-base-url>')
}

const expectedSha256 = '03ba204e50d126e4674c005e04d82e84c21366780af1f43bd54a37816b6ab340'

async function waitFor(condition, message, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    try {
      last = await condition()
      if (last) return last
    } catch (error) {
      last = error
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`${message}${last instanceof Error ? `: ${last.message}` : ''}`)
}

const targets = await waitFor(async () => {
  const response = await fetch(`${devtoolsBaseUrl}/json/list`)
  if (!response.ok) return null
  const list = await response.json()
  return list.find((target) => target.type === 'page' && target.webSocketDebuggerUrl) ? list : null
}, 'Chrome DevTools endpoint did not become ready')

const target = targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', () => reject(new Error('Could not connect to Chrome DevTools')), { once: true })
})

let sequence = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id) return
  const waiter = pending.get(message.id)
  if (!waiter) return
  pending.delete(message.id)
  if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`))
  else waiter.resolve(message.result)
})

function send(method, params = {}) {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed')
  return result.result.value
}

try {
  await send('Page.enable')
  await send('DOM.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await send('Page.navigate', { url: baseUrl })

  await waitFor(async () => evaluate('document.readyState === "complete"'), 'Application page did not load')
  await waitFor(async () => evaluate('typeof document.querySelector("#prepare-form")?.requestSubmit === "function"'), 'Application JavaScript did not initialize')

  const { root } = await send('DOM.getDocument', { depth: 2 })
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#file' })
  assert.ok(nodeId > 0, 'file input was not found')
  await send('DOM.setFileInputFiles', { nodeId, files: [path.resolve(fixturePath)] })
  await evaluate('document.querySelector("#prepare-form").requestSubmit()')

  const outcome = await waitFor(async () => {
    const json = await evaluate(`JSON.stringify({
      hidden: document.querySelector('#result').hidden,
      status: document.querySelector('#status').textContent,
      sha: document.querySelector('#file-sha').textContent,
      hasManifestUi: Boolean(document.querySelector('#manifest-commitment')),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    })`)
    const parsed = JSON.parse(json)
    return parsed.hidden ? null : parsed
  }, 'Local dual-hash flow did not complete', 20_000)

  assert.match(outcome.status, /Both local SHA-256 methods agree/)
  assert.equal(outcome.sha, expectedSha256)
  assert.equal(outcome.hasManifestUi, false, 'new creation flow must not expose a Manifest commitment')
  assert.equal(outcome.overflow, false, 'mobile viewport has horizontal overflow')

  const networkPrimitive = await evaluate(`[
    ...performance.getEntriesByType('resource').map((entry) => entry.name)
  ].filter((url) => !url.startsWith(${JSON.stringify(baseUrl)}))`)
  assert.deepEqual(networkPrimitive, [], 'local preparation contacted a non-local origin')

  console.log('Real-browser direct file local preparation smoke test passed')
} finally {
  socket.close()
}
