/**
 * 连上真实应用的 WebView，重载页面并收集控制台 / CSP 违规信息，然后跑一段表达式。
 * 用来排查「开发正常、打包后不正常」的问题（CSP、字体、资源加载）。
 *   APP_DEBUG_PORT=9445 node scripts/app-console.mjs probe.js [等待毫秒]
 */
import { readFileSync } from 'node:fs'

const PORT = Number(process.env.APP_DEBUG_PORT || 9444)
const exprFile = process.argv[2]
const waitMs = Number(process.argv[3] || 6000)
const expression = exprFile ? readFileSync(exprFile, 'utf8') : 'null'

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
	throw new Error(`连不上 WebView 调试端口 ${PORT}`)
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
const messages = []
ws.addEventListener('message', event => {
	const message = JSON.parse(event.data)
	if (message.id && pending.has(message.id)) {
		const { resolve, reject } = pending.get(message.id)
		pending.delete(message.id)
		if (message.error) reject(new Error(message.error.message))
		else resolve(message.result)
		return
	}
	if (message.method === 'Log.entryAdded') {
		const e = message.params.entry
		messages.push(`[${e.level}/${e.source}] ${e.text}`)
	}
	if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
		messages.push(`[console.${message.params.type}] ${message.params.args.map(a => a.value ?? a.description ?? a.type).join(' ')}`)
	}
	if (message.method === 'Runtime.exceptionThrown') {
		messages.push(`[异常] ${message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text}`)
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
await send('Log.enable')
await send('Page.enable')

// 重载一次，把加载过程中的日志全收下来
await send('Page.reload', { ignoreCache: true })
await sleep(waitMs)

console.log(`\n=== 加载期日志（${messages.length} 条）===`)
for (const line of messages.slice(0, 40)) {
	// base64 字体 / 超长内容压掉，只留结论部分
	const violation = line.match(/violates the following Content Security Policy directive[\s\S]{0,200}/i)
	const short = violation ? `${line.slice(0, 60)}... ${violation[0]}` : line.replace(/base64,[A-Za-z0-9+/=\s]+/g, 'base64,<省略>')
	console.log('  ' + short.replace(/\s+/g, ' ').slice(0, 400))
}
if (!messages.length) console.log('  （没有任何报错/警告）')

if (exprFile) {
	const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
	if (result.exceptionDetails) {
		console.error('\n表达式抛错:', result.exceptionDetails.exception?.description || result.exceptionDetails.text)
		process.exitCode = 1
	} else {
		console.log('\n=== 探针结果 ===')
		console.log(JSON.stringify(result.result.value, null, 2))
	}
}
ws.close()
process.exit(process.exitCode || 0)
