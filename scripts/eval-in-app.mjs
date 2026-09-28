/**
 * 连接真实 Tauri 应用（WebView2 的远程调试端口）执行一段表达式。
 * 用法（先用 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9444 启动 xtools.exe）：
 *   node scripts/eval-in-app.mjs "%TEMP%\probe.js" [等待毫秒]
 */
import { readFileSync } from 'node:fs'

const PORT = Number(process.env.APP_DEBUG_PORT || 9444)
const exprFile = process.argv[2]
const waitMs = Number(process.argv[3] || 4000)
if (!exprFile) {
	console.error('用法: node scripts/eval-in-app.mjs <表达式文件> [等待毫秒]')
	process.exit(2)
}
const expression = readFileSync(exprFile, 'utf8')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function findTarget() {
	for (let i = 0; i < 40; i += 1) {
		try {
			const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
			const targets = await response.json()
			const page = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl)
			if (page) return page
		} catch {
			/* 还没起来 */
		}
		await sleep(500)
	}
	throw new Error(`连不上 WebView 调试端口 ${PORT}（应用没启动？）`)
}

const target = await findTarget()
console.log(`目标: ${target.url}`)

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
	ws.addEventListener('open', resolve)
	ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')))
})

let seq = 0
const pending = new Map()
ws.addEventListener('message', event => {
	const message = JSON.parse(event.data)
	if (message.id && pending.has(message.id)) {
		const { resolve, reject } = pending.get(message.id)
		pending.delete(message.id)
		if (message.error) reject(new Error(message.error.message))
		else resolve(message.result)
	}
})
const send = (method, params = {}) => {
	const id = (seq += 1)
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject })
		ws.send(JSON.stringify({ id, method, params }))
		setTimeout(() => {
			if (pending.has(id)) {
				pending.delete(id)
				reject(new Error(`${method} 超时`))
			}
		}, 120000)
	})
}

await send('Runtime.enable')
await sleep(waitMs)

const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
if (result.exceptionDetails) {
	const details = result.exceptionDetails
	console.error('表达式抛错:', details.exception?.description || details.text)
	process.exitCode = 1
} else {
	console.log(JSON.stringify(result.result.value, null, 2))
}
ws.close()
// WebSocket / fetch 会把事件循环撑住，直接退
process.exit(process.exitCode || 0)
