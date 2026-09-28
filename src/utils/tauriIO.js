/**
 * 文件读写封装
 * - Tauri 环境下走 plugin-dialog + plugin-fs（对话框选中的路径会被自动加入 fs 作用域）
 * - 浏览器环境下退化为 <input type="file"> 与下载，方便 `pnpm dev` 快速预览界面
 */

export function isTauri() {
	return typeof window !== 'undefined' && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__)
}

/** 把底层报错转成用户能看懂的提示 */
export function friendlyError(err) {
	const msg = typeof err === 'string' ? err : err?.message || String(err ?? '')
	if (/forbidden|not allowed|scope|denied|permission/i.test(msg)) {
		return '没有访问该路径的权限，请改用「选择文件 / 选择文件夹」按钮，或把文件放到用户目录下'
	}
	if (/No such file|not found|os error 2/i.test(msg)) return '文件不存在或已被移动'
	if (/拒绝访问|Access is denied/i.test(msg)) return '系统拒绝了访问（文件可能被占用）'
	return msg
}

export function isImageFile(path, exts) {
	const ext = String(path).split('.').pop()?.toLowerCase() || ''
	return exts.includes(ext)
}

/* ------------------------------------------------------------------ *
 * 对话框
 * ------------------------------------------------------------------ */

export async function openFiles({ multiple = true, directory = false, filters, title = '请选择文件' } = {}) {
	if (!isTauri()) return null
	const { open } = await import('@tauri-apps/plugin-dialog')
	const result = await open({ multiple, directory, title, filters })
	if (result == null) return []
	return Array.isArray(result) ? result : [result]
}

export async function pickDirectory({ title = '请选择文件夹', defaultPath } = {}) {
	if (!isTauri()) return null
	const { open } = await import('@tauri-apps/plugin-dialog')
	// recursive 必须为 true，否则选中目录内的文件不在 fs 作用域内，无法写入
	const result = await open({
		multiple: false,
		directory: true,
		recursive: true,
		title,
		defaultPath: defaultPath || undefined,
	})
	return typeof result === 'string' ? result : null
}

export async function saveDialog({ defaultPath, filters, title = '保存文件' } = {}) {
	if (!isTauri()) return null
	const { save } = await import('@tauri-apps/plugin-dialog')
	const result = await save({ defaultPath, filters, title })
	return typeof result === 'string' ? result : null
}

/* ------------------------------------------------------------------ *
 * 读取
 * ------------------------------------------------------------------ */

/** 读取数据源（Tauri 路径字符串 / 浏览器 File 对象）为字节数组 */
export async function readSourceBytes(source) {
	if (source instanceof Blob) return new Uint8Array(await source.arrayBuffer())
	if (typeof source !== 'string') throw new Error('不支持的文件来源')
	if (!isTauri()) throw new Error('浏览器环境无法读取本地路径，请使用 Tauri 运行')
	const { readFile } = await import('@tauri-apps/plugin-fs')
	return await readFile(source)
}

export async function readSourceText(source) {
	if (source instanceof Blob) return await source.text()
	if (typeof source !== 'string') throw new Error('不支持的文件来源')
	if (!isTauri()) throw new Error('浏览器环境无法读取本地路径，请使用 Tauri 运行')
	const { readTextFile } = await import('@tauri-apps/plugin-fs')
	return await readTextFile(source)
}

/**
 * 给 <video> / <audio> / <img> 用的 URL，**不会把文件读进内存**。
 * - 浏览器里的 File/Blob：直接 createObjectURL
 * - Tauri 路径：走 asset 协议（Rust 侧按 Range 分块读，几个 G 的视频也不吃内存）
 * 大视频以前是整份 readFile 进 WebView，几 G 的文件会直接把程序撑崩。
 */
export async function createStreamUrl(source) {
	if (source instanceof Blob) return URL.createObjectURL(source)
	if (typeof source !== 'string') throw new Error('不支持的文件来源')
	if (!isTauri()) throw new Error('浏览器环境无法读取本地路径，请使用 Tauri 运行')
	const { convertFileSrc } = await import('@tauri-apps/api/core')
	return convertFileSrc(source)
}

/** asset 协议的 URL 不用 revoke，只有 blob: 需要（否则内存泄漏） */
export function revokeStreamUrl(source) {
	if (source?.url?.startsWith('blob:')) URL.revokeObjectURL(source.url)
}

/** 只取文件大小（不读内容），失败返回 0 */
export async function sourceSize(source) {
	if (source instanceof Blob) return source.size
	if (typeof source !== 'string' || !isTauri()) return 0
	try {
		const { stat } = await import('@tauri-apps/plugin-fs')
		const info = await stat(source)
		return Number(info?.size) || 0
	} catch {
		return 0
	}
}

/* ------------------------------------------------------------------ *
 * 写入
 * ------------------------------------------------------------------ */

export async function pathExists(path) {
	if (!isTauri()) return false
	const { exists } = await import('@tauri-apps/plugin-fs')
	return await exists(path)
}

export async function ensureDir(path) {
	if (!isTauri()) return
	const { exists, mkdir } = await import('@tauri-apps/plugin-fs')
	if (!(await exists(path))) await mkdir(path, { recursive: true })
}

export async function writeBytes(path, bytes) {
	if (!isTauri()) {
		downloadInBrowser(bytes, path.split(/[\\/]/).pop())
		return
	}
	const { writeFile } = await import('@tauri-apps/plugin-fs')
	await writeFile(path, bytes)
}

export async function writeText(path, text) {
	if (!isTauri()) {
		downloadInBrowser(text, path.split(/[\\/]/).pop())
		return
	}
	const { writeTextFile } = await import('@tauri-apps/plugin-fs')
	await writeTextFile(path, text)
}

/** 弹出“另存为”对话框并写入 */
export async function saveBytesAs(bytes, { defaultPath, filters } = {}) {
	if (!isTauri()) {
		downloadInBrowser(bytes, defaultPath || 'download')
		return null
	}
	const path = await saveDialog({ defaultPath, filters })
	if (!path) return null
	await writeBytes(path, bytes)
	return path
}

export async function saveTextAs(text, { defaultPath, filters } = {}) {
	if (!isTauri()) {
		downloadInBrowser(text, defaultPath || 'download.txt')
		return null
	}
	const path = await saveDialog({ defaultPath, filters })
	if (!path) return null
	await writeText(path, text)
	return path
}

export function downloadInBrowser(data, filename) {
	const blob = data instanceof Blob ? data : new Blob([data])
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename || 'download'
	document.body.appendChild(a)
	a.click()
	a.remove()
	setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/* ------------------------------------------------------------------ *
 * 其它
 * ------------------------------------------------------------------ */

export async function copyText(text) {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text)
			return true
		}
	} catch {
		/* 退回到 execCommand */
	}
	try {
		const textarea = document.createElement('textarea')
		textarea.value = text
		textarea.style.position = 'fixed'
		textarea.style.opacity = '0'
		document.body.appendChild(textarea)
		textarea.select()
		const ok = document.execCommand('copy')
		textarea.remove()
		return ok
	} catch {
		return false
	}
}

/** 默认输出目录：图片目录 -> 桌面 -> 用户目录 */
export async function defaultOutputDir() {
	if (!isTauri()) return ''
	try {
		const pathApi = await import('@tauri-apps/api/path')
		for (const fn of ['pictureDir', 'desktopDir', 'downloadDir', 'homeDir']) {
			try {
				const dir = await pathApi[fn]()
				if (dir) return dir
			} catch {
				/* 试下一个 */
			}
		}
	} catch {
		/* 忽略 */
	}
	return ''
}

/** 在系统文件管理器中打开某个路径（用于“打开所在文件夹”） */
export async function revealInExplorer(path) {
	if (!isTauri() || !path) return
	try {
		const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
		await revealItemInDir(path)
	} catch {
		/* 忽略 */
	}
}
