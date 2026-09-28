/**
 * 用真实浏览器逐个打开页面并捕获控制台报错 / 未捕获异常 / 资源加载失败。
 *
 * 用途：Tauri 的 WebView 控制台不方便看，本脚本把同一份前端跑在 Chrome/Edge 无头里，
 * 通过 DevTools 协议收集错误，适合改动后快速回归。
 *
 * 用法（需先启动 pnpm dev）：
 *   node scripts/check-pages.mjs                     # 检查全部页面
 *   node scripts/check-pages.mjs /whiteboard /json/jsonFormat
 *   CHROME_PATH="D:\\chrome.exe" node scripts/check-pages.mjs
 *
 * 无第三方依赖：使用 Node 内置 fetch 与 WebSocket（Node 21+）。
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.CHECK_BASE || 'http://localhost:1420'
const WAIT_AFTER_LOAD = Number(process.env.CHECK_WAIT || 3000)
const PORT = Number(process.env.CHECK_PORT || 9333)
/**
 * 可选：在页面加载完成后执行一段自定义表达式并打印结果（支持 await / 返回 Promise）。
 * 用来验证交互，例如点击白板的汉堡菜单后读取菜单项：
 *   CHECK_EXPR="(async()=>{...})()" node scripts/check-pages.mjs /whiteboard
 */
const CUSTOM_PROBE = process.env.CHECK_EXPR_FILE
	? readFileSync(process.env.CHECK_EXPR_FILE, 'utf8')
	: process.env.CHECK_EXPR || ''
/**
 * 可选：把一个本地文件通过请求拦截注入页面，供自定义探针 fetch('/__test_file__') 读取。
 * 用来在浏览器里测试"读本地大文件"这类路径，例如：
 *   CHECK_SERVE_FILE="C:\\path\\scene.excalidraw" CHECK_EXPR="..." node scripts/check-pages.mjs /whiteboard
 */
const SERVE_FILE = process.env.CHECK_SERVE_FILE || ''
/**
 * 可选：把每个页面截图存到该目录，用来肉眼检查深色主题之类的视觉效果。
 *   CHECK_SHOT="%TEMP%\\shots" node scripts/check-pages.mjs /pictures/imgTransform
 */
const SHOT_DIR = process.env.CHECK_SHOT || ''

const DEFAULT_ROUTES = [
	'/pictures/imgTransform',
	'/pictures/imgCrop',
	'/pictures/imgCutout',
	'/pictures/imgBeautify',
	'/pictures/imgCompress',
	'/pictures/imgUpscale',
	'/pictures/gifCompress',
	'/pictures/nineGrid',
	'/pictures/imgBase64',
	'/pictures/iconExtraction',
	'/video/videoCrop',
	'/video/videoTrim',
	'/video/videoConvert',
	'/video/videoToGif',
	'/audio/audioConvert',
	'/audio/audioTrim',
	'/dev/snippet',
	'/dev/markdown',
	'/design/gltf',
	'/design/color',
	'/json/jsonFormat',
	'/whiteboard',
]

const BROWSER_CANDIDATES = [
	process.env.CHROME_PATH,
	'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
	'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
	'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
	'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

function findBrowser() {
	for (const candidate of BROWSER_CANDIDATES) {
		if (existsSync(candidate)) return candidate
	}
	throw new Error('找不到 Chrome/Edge，可用 CHROME_PATH 环境变量指定浏览器路径')
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function fetchJson(url, options) {
	const response = await fetch(url, options)
	if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`)
	return await response.json()
}

async function waitForDevtools() {
	for (let i = 0; i < 60; i += 1) {
		try {
			const version = await fetchJson(`http://127.0.0.1:${PORT}/json/version`)
			return version
		} catch {
			await sleep(250)
		}
	}
	throw new Error('DevTools 端口没有就绪，浏览器可能启动失败')
}

class Cdp {
	constructor(url) {
		this.ws = new WebSocket(url)
		this.seq = 0
		this.pending = new Map()
		this.listeners = []
		this.ready = new Promise((resolve, reject) => {
			this.ws.addEventListener('open', () => resolve())
			this.ws.addEventListener('error', event => reject(new Error(`WebSocket 连接失败: ${event.message || 'unknown'}`)))
		})
		this.ws.addEventListener('message', event => {
			const message = JSON.parse(event.data)
			if (message.id && this.pending.has(message.id)) {
				const { resolve, reject } = this.pending.get(message.id)
				this.pending.delete(message.id)
				if (message.error) reject(new Error(message.error.message))
				else resolve(message.result)
				return
			}
			if (message.method) {
				for (const listener of this.listeners) listener(message)
			}
		})
	}

	onEvent(listener) {
		this.listeners.push(listener)
	}

	async send(method, params = {}) {
		await this.ready
		const id = (this.seq += 1)
		return await new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject })
			this.ws.send(JSON.stringify({ id, method, params }))
			setTimeout(() => {
				if (this.pending.has(id)) {
					this.pending.delete(id)
					reject(new Error(`${method} 超时`))
				}
			}, 30000)
		})
	}

	close() {
		try {
			this.ws.close()
		} catch {
			/* 忽略 */
		}
	}
}

const routes = process.argv.slice(2).filter(arg => !arg.startsWith('-'))
const list = routes.length ? routes : DEFAULT_ROUTES

const browserPath = findBrowser()
const profileDir = mkdtempSync(join(tmpdir(), 'xtools-check-'))
console.log(`浏览器: ${browserPath}`)
console.log(`地址  : ${BASE}`)
console.log(`页面  : ${list.length} 个\n`)

const child = spawn(
	browserPath,
	[
		'--headless=new',
		'--disable-gpu',
		'--no-first-run',
		'--no-default-browser-check',
		'--no-sandbox',
		'--disable-dev-shm-usage',
		'--mute-audio',
		// 用接近应用窗口的尺寸，避免 Excalidraw 等库回退到移动端布局；可用 CHECK_WINDOW 覆盖
		`--window-size=${process.env.CHECK_WINDOW || '1440,900'}`,
		`--remote-debugging-port=${PORT}`,
		`--user-data-dir=${profileDir}`,
		'about:blank',
	],
	{ stdio: 'ignore' }
)

let exitCode = 0
let cdp = null

try {
	await waitForDevtools()
	const targets = await fetchJson(`http://127.0.0.1:${PORT}/json/list`)
	const target = targets.find(item => item.type === 'page')
	if (!target) throw new Error('没有可用的页面目标')

	cdp = new Cdp(target.webSocketDebuggerUrl)
	await cdp.ready

	let problems = []
	let consoleErrors = []
	let consoleWarnings = []
	let failedRequests = []

	cdp.onEvent(message => {
		if (message.method === 'Runtime.exceptionThrown') {
			const details = message.params.exceptionDetails
			const stack = details.stackTrace?.callFrames?.slice(0, 4).map(f => `      at ${f.functionName || '<anonymous>'} (${f.url}:${f.lineNumber + 1}:${f.columnNumber + 1})`).join('\n')
			problems.push(`${details.exception?.description || details.text}${stack ? `\n${stack}` : ''}`)
		}
		if (message.method === 'Runtime.consoleAPICalled') {
			const text = message.params.args.map(arg => arg.description ?? arg.value ?? arg.type).join(' ')
			if (message.params.type === 'error') consoleErrors.push(text)
			else if (message.params.type === 'warning') consoleWarnings.push(text)
		}
		if (message.method === 'Log.entryAdded') {
			const entry = message.params.entry
			if (entry.level === 'error') consoleErrors.push(`${entry.source}: ${entry.text}`)
		}
		if (message.method === 'Network.loadingFailed') {
			failedRequests.push(`${message.params.type} ${message.params.errorText}`)
		}
	})

	await cdp.send('Runtime.enable')
	await cdp.send('Log.enable')
	await cdp.send('Network.enable')
	await cdp.send('Page.enable')

	// 把指定文件注入页面（拦截 __test_file__ 请求）
	if (SERVE_FILE) {
		if (!existsSync(SERVE_FILE)) throw new Error(`CHECK_SERVE_FILE 不存在: ${SERVE_FILE}`)
		await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*__test_file__*' }] })
		cdp.onEvent(async message => {
			if (message.method !== 'Fetch.requestPaused') return
			try {
				const body = readFileSync(SERVE_FILE).toString('base64')
				await cdp.send('Fetch.fulfillRequest', {
					requestId: message.params.requestId,
					responseCode: 200,
					responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }],
					body,
				})
			} catch (err) {
				await cdp
					.send('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'InternalError' })
					.catch(() => {})
				console.error(`注入文件失败: ${err.message}`)
			}
		})
	}

	for (const route of list) {
		problems = []
		consoleErrors = []
		consoleWarnings = []
		failedRequests = []

		await cdp.send('Page.navigate', { url: `${BASE}${route}` })
		await sleep(WAIT_AFTER_LOAD)

		let rendered = ''
		try {
			if (CUSTOM_PROBE) {
				const probeResult = await cdp.send('Runtime.evaluate', {
					expression: CUSTOM_PROBE,
					awaitPromise: true,
					returnByValue: true,
				})
				if (probeResult.exceptionDetails) {
					const details = probeResult.exceptionDetails
					const description = details.exception?.description || details.exception?.value || details.text
					const stack = details.stackTrace?.callFrames?.slice(0, 3).map(f => `${f.functionName || '<anonymous>'}@${f.lineNumber + 1}`).join(' <- ')
					rendered = `(自定义探针抛错: ${description}${stack ? ` [${stack}]` : ''})`
				} else {
					const value = probeResult.result.value
					rendered = JSON.stringify(value, null, 2) || String(value)
				}
			} else {
				const result = await cdp.send('Runtime.evaluate', {
					expression: `(() => {
						const title = document.querySelector('.tool-title');
						const menu = document.querySelectorAll('.ant-menu-item, .ant-menu-submenu').length;
						const wrap = document.querySelector('.canvas-wrap');
						return JSON.stringify({
							title: title ? title.textContent.trim().slice(0, 40) : '',
							menu,
							body: document.body.innerText.trim().length,
							canvas: document.querySelectorAll('canvas').length,
							excalidraw: !!document.querySelector('.excalidraw'),
							wrapHeight: wrap ? wrap.clientHeight : 0,
						});
					})()`,
					returnByValue: true,
				})
				rendered = result.result.value || ''
			}
		} catch (err) {
			rendered = `(无法读取页面内容: ${err.message})`
		}

		const hasProblem = problems.length || consoleErrors.length || failedRequests.length
		let blank = false

		if (CUSTOM_PROBE) {
			console.log(`[${hasProblem ? 'FAIL' : 'ok  '}] ${route}`)
			console.log(`        探针结果: ${rendered}`)
		} else {
			let info = { title: '', menu: 0, body: 0, canvas: 0, wrapHeight: 0, excalidraw: false }
			try {
				info = JSON.parse(rendered)
			} catch {
				/* 用默认值 */
			}
			blank = !info.title && info.body < 20
			console.log(`[${hasProblem || blank ? 'FAIL' : 'ok  '}] ${route}`)
			console.log(
				`        渲染: 标题="${info.title}" 菜单项=${info.menu} 文本长度=${info.body} canvas=${info.canvas}` +
					(info.wrapHeight ? ` 容器高=${info.wrapHeight}px` : '') +
					(info.excalidraw ? ' excalidraw=已挂载' : '')
			)
		}
		if (hasProblem || blank) exitCode = 1

		if (SHOT_DIR) {
			try {
				mkdirSync(SHOT_DIR, { recursive: true })
				const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
				const name = route.replace(/^\/+/, '').replace(/[^\w.-]+/g, '_') || 'index'
				const file = join(SHOT_DIR, `${name}.png`)
				writeFileSync(file, Buffer.from(shot.data, 'base64'))
				console.log(`        截图: ${file}`)
			} catch (err) {
				console.log(`        截图失败: ${err.message}`)
			}
		}

		for (const item of problems) console.log(`        未捕获异常: ${item}`)
		for (const item of consoleErrors) console.log(`        控制台错误: ${item}`)
		for (const item of failedRequests) console.log(`        请求失败  : ${item}`)
		if (consoleWarnings.length) console.log(`        警告(${consoleWarnings.length}): ${consoleWarnings[0].slice(0, 160)}`)
		if (blank) console.log('        页面疑似空白（标题和正文都为空）')
		console.log('')
	}
} catch (err) {
	console.error(`检查脚本自身出错: ${err.message}`)
	exitCode = 2
} finally {
	cdp?.close()
	try {
		child.kill()
	} catch {
		/* 忽略 */
	}
	await sleep(300)
	try {
		rmSync(profileDir, { recursive: true, force: true })
	} catch {
		/* 忽略 */
	}
}

console.log(exitCode === 0 ? '全部页面无报错' : '存在报错，见上方明细')
process.exit(exitCode)
