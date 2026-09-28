/**
 * 图片处理工具集
 * 说明：除依赖 DOM/Canvas 的函数外，均为纯函数，可在 Node 中单独测试。
 */

/** 可识别的图片扩展名 */
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'ico', 'gif', 'svg', 'avif']

/** 文件选择框过滤器 */
export const IMAGE_FILTER = { name: '图片', extensions: IMAGE_EXTS }

export const MIME_BY_EXT = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	bmp: 'image/bmp',
	ico: 'image/x-icon',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	avif: 'image/avif',
}

export const EXT_BY_MIME = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/bmp': 'bmp',
	'image/x-icon': 'ico',
	'image/vnd.microsoft.icon': 'ico',
	'image/gif': 'gif',
	'image/svg+xml': 'svg',
	'image/avif': 'avif',
}

/** 可输出的目标格式 */
export const OUTPUT_FORMATS = [
	{ value: 'png', label: 'PNG（无损 / 支持透明）', mime: 'image/png', ext: 'png', lossy: false, alpha: true },
	{ value: 'jpg', label: 'JPG（有损 / 体积最小）', mime: 'image/jpeg', ext: 'jpg', lossy: true, alpha: false },
	{ value: 'webp', label: 'WEBP（有损 / 支持透明）', mime: 'image/webp', ext: 'webp', lossy: true, alpha: true },
	{ value: 'bmp', label: 'BMP（无压缩位图）', mime: 'image/bmp', ext: 'bmp', lossy: false, alpha: false },
	{ value: 'ico', label: 'ICO（图标 / 多尺寸）', mime: 'image/x-icon', ext: 'ico', lossy: false, alpha: true },
]

export const ICO_SIZES = [16, 32, 48, 64, 128, 256]

export const getOutputFormat = value => OUTPUT_FORMATS.find(i => i.value === value) || OUTPUT_FORMATS[0]

/* ------------------------------------------------------------------ *
 * 通用：体积 / 路径
 * ------------------------------------------------------------------ */

export function formatBytes(bytes) {
	const n = Number(bytes)
	if (!n || Number.isNaN(n) || n < 0) return '0 B'
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
	const v = n / Math.pow(1024, i)
	const fixed = i === 0 ? String(v) : v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)
	return `${fixed} ${units[i]}`
}

/** 压缩率（正数表示变小了多少） */
export function shrinkRate(before, after) {
	if (!before || !after) return 0
	return (1 - after / before) * 100
}

export function basename(p) {
	return String(p ?? '')
		.split(/[\\/]/)
		.pop()
}

export function dirname(p) {
	const s = String(p ?? '')
	const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'))
	return i > 0 ? s.slice(0, i) : ''
}

export function extname(p) {
	const b = basename(p)
	const i = b.lastIndexOf('.')
	return i > 0 ? b.slice(i + 1).toLowerCase() : ''
}

export function stripExt(name) {
	const s = String(name ?? '')
	const i = s.lastIndexOf('.')
	return i > 0 ? s.slice(0, i) : s
}

export function replaceExt(p, ext) {
	const dir = dirname(p)
	const name = `${stripExt(basename(p))}.${ext}`
	return dir ? joinPath(dir, name) : name
}

export function joinPath(dir, name) {
	const sep = String(dir).includes('\\') ? '\\' : '/'
	return `${String(dir).replace(/[\\/]+$/, '')}${sep}${name}`
}

/** 在同一批输出里避免重名：a.png -> a(1).png */
export function uniqueName(used, name) {
	if (!used.has(name)) {
		used.add(name)
		return name
	}
	const ext = extname(name)
	const base = stripExt(name)
	let i = 1
	let next = ''
	do {
		next = ext ? `${base}(${i}).${ext}` : `${base}(${i})`
		i += 1
	} while (used.has(next))
	used.add(next)
	return next
}

/* ------------------------------------------------------------------ *
 * 文件头嗅探
 * ------------------------------------------------------------------ */

export function sniffMime(bytes) {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
	const has = (offset, str) => {
		if (b.length < offset + str.length) return false
		for (let i = 0; i < str.length; i += 1) {
			if (b[offset + i] !== str.charCodeAt(i)) return false
		}
		return true
	}
	if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
	if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
	if (has(0, 'GIF87a') || has(0, 'GIF89a')) return 'image/gif'
	if (has(0, 'BM')) return 'image/bmp'
	if (has(0, 'RIFF') && has(8, 'WEBP')) return 'image/webp'
	if (b.length >= 4 && b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return 'image/x-icon'
	if (has(4, 'ftyp') && (has(8, 'avif') || has(8, 'avis'))) return 'image/avif'
	if (has(0, '<svg') || has(0, '<?xml') || has(0, '<!--')) return 'image/svg+xml'
	return 'application/octet-stream'
}

/* ------------------------------------------------------------------ *
 * Base64
 * ------------------------------------------------------------------ */

export function bytesToBase64(bytes) {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
	let binary = ''
	const chunk = 0x8000
	for (let i = 0; i < b.length; i += chunk) {
		binary += String.fromCharCode.apply(null, b.subarray(i, Math.min(i + chunk, b.length)))
	}
	return btoa(binary)
}

export function base64ToBytes(base64) {
	const bin = atob(base64)
	const out = new Uint8Array(bin.length)
	for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
	return out
}

export function bytesToDataUrl(bytes, mime = 'application/octet-stream') {
	return `data:${mime};base64,${bytesToBase64(bytes)}`
}

/** 按固定宽度插入换行 */
export function wrapText(text, width = 0) {
	if (!width || width <= 0) return text
	const out = []
	for (let i = 0; i < text.length; i += width) out.push(text.slice(i, i + width))
	return out.join('\n')
}

/**
 * 解析用户粘贴的内容为图片二进制
 * 支持：data URI（base64 或 URL 编码）、纯 base64、URL-safe base64
 * @returns {{ base64: string, mime: string, ext: string, bytes: Uint8Array, isDataUrl: boolean }}
 */
export function parseBase64Input(text, { maxBytes = 512 * 1024 * 1024 } = {}) {
	let raw = String(text ?? '').trim()
	if (!raw) throw new Error('内容为空')

	// 去掉首尾引号 / 反引号
	raw = raw.replace(/^['"`]|['"`]$/g, '').trim()

	let mime = ''
	let isDataUrl = false
	let payload = raw

	if (/^data:/i.test(raw)) {
		isDataUrl = true
		const comma = raw.indexOf(',')
		if (comma === -1) throw new Error('data URI 格式不完整，缺少 “,”')
		const meta = raw.slice(5, comma)
		payload = raw.slice(comma + 1)
		const mimeMatch = meta.match(/^([\w.+-]+\/[\w.+-]+)/)
		mime = mimeMatch ? mimeMatch[1].toLowerCase() : ''
		const isBase64 = /;base64/i.test(meta)
		if (!isBase64) {
			// 形如 data:image/svg+xml,<svg ...> 的 URL 编码形式
			let decoded = payload
			try {
				decoded = decodeURIComponent(payload)
			} catch {
				/* 保持原样 */
			}
			const bytes = new TextEncoder().encode(decoded)
			const realMime = mime || sniffMime(bytes)
			return { base64: bytesToBase64(bytes), mime: realMime, ext: EXT_BY_MIME[realMime] || 'bin', bytes, isDataUrl }
		}
	}

	// 清理空白与 URL-safe 字符
	payload = payload.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
	const padIndex = payload.indexOf('=')
	if (padIndex !== -1) payload = payload.slice(0, padIndex)
	if (!payload) throw new Error('没有解析到 Base64 数据')
	if (!/^[A-Za-z0-9+/]+$/.test(payload)) throw new Error('不是合法的 Base64 数据（包含非法字符）')

	const remainder = payload.length % 4
	if (remainder === 1) throw new Error('Base64 长度不合法')
	const padded = remainder ? payload + '='.repeat(4 - remainder) : payload

	const estimate = Math.floor((padded.length / 4) * 3)
	if (estimate > maxBytes) throw new Error(`数据过大（约 ${formatBytes(estimate)}），已超过处理上限`)

	let bytes
	try {
		bytes = base64ToBytes(padded)
	} catch {
		throw new Error('Base64 解码失败')
	}

	const realMime = mime || sniffMime(bytes)
	return { base64: padded, mime: realMime, ext: EXT_BY_MIME[realMime] || 'bin', bytes, isDataUrl }
}

/**
 * 按不同用途包装 Base64 输出
 * @param {string} base64 纯 base64
 * @param {string} mime
 * @param {'dataurl'|'raw'|'css'|'html'|'js'|'json'|'markdown'} mode
 */
export function formatBase64Output(base64, mime, mode = 'dataurl', wrap = 0) {
	const dataUrl = `data:${mime};base64,${base64}`
	switch (mode) {
		case 'raw':
			return wrapText(base64, wrap)
		case 'css':
			return `.image {\n  background-image: url("${dataUrl}");\n  background-size: cover;\n  background-position: center;\n}`
		case 'html':
			return `<img src="${dataUrl}" alt="" />`
		case 'js':
			return `const base64Image = "${dataUrl}"\n`
		case 'json':
			return JSON.stringify({ mime, base64: wrap ? wrapText(base64, wrap) : base64 }, null, 2)
		case 'markdown':
			return `![image](${dataUrl})`
		case 'dataurl':
		default:
			return wrapText(dataUrl, wrap)
	}
}

/* ------------------------------------------------------------------ *
 * 编码器：BMP / ICO
 * ------------------------------------------------------------------ */

/** RGBA 像素 -> 24 位 BMP（纯函数，便于测试） */
export function encodeBmpFromImageData(data, width, height) {
	const rowSize = Math.floor((24 * width + 31) / 32) * 4
	const pixelArraySize = rowSize * height
	const fileSize = 54 + pixelArraySize
	const out = new Uint8Array(fileSize)
	const dv = new DataView(out.buffer)

	out[0] = 0x42 // B
	out[1] = 0x4d // M
	dv.setUint32(2, fileSize, true)
	dv.setUint32(6, 0, true)
	dv.setUint32(10, 54, true)
	dv.setUint32(14, 40, true) // BITMAPINFOHEADER
	dv.setInt32(18, width, true)
	dv.setInt32(22, height, true)
	dv.setUint16(26, 1, true)
	dv.setUint16(28, 24, true)
	dv.setUint32(30, 0, true) // BI_RGB
	dv.setUint32(34, pixelArraySize, true)
	dv.setInt32(38, 2835, true)
	dv.setInt32(42, 2835, true)
	dv.setUint32(46, 0, true)
	dv.setUint32(50, 0, true)

	for (let y = 0; y < height; y += 1) {
		const srcRow = (height - 1 - y) * width * 4 // BMP 自下而上
		let p = 54 + y * rowSize
		for (let x = 0; x < width; x += 1) {
			const i = srcRow + x * 4
			out[p] = data[i + 2]
			out[p + 1] = data[i + 1]
			out[p + 2] = data[i]
			p += 3
		}
	}
	return out
}

/**
 * 组装 ICO 文件（每个尺寸使用 PNG 数据，Vista 及以上系统均支持）
 * @param {{ width: number, height: number, data: Uint8Array }[]} entries
 */
export function encodeIco(entries) {
	const list = (entries || []).filter(i => i && i.data && i.data.length)
	if (!list.length) throw new Error('ICO 至少需要一个尺寸')
	const headerSize = 6
	const dirSize = 16 * list.length
	let offset = headerSize + dirSize
	const total = offset + list.reduce((s, i) => s + i.data.length, 0)
	const out = new Uint8Array(total)
	const dv = new DataView(out.buffer)

	dv.setUint16(0, 0, true) // reserved
	dv.setUint16(2, 1, true) // type: icon
	dv.setUint16(4, list.length, true)

	list.forEach((entry, index) => {
		const p = headerSize + index * 16
		out[p] = entry.width >= 256 ? 0 : entry.width
		out[p + 1] = entry.height >= 256 ? 0 : entry.height
		out[p + 2] = 0 // 调色板数
		out[p + 3] = 0 // reserved
		dv.setUint16(p + 4, 1, true) // color planes
		dv.setUint16(p + 6, 32, true) // bits per pixel
		dv.setUint32(p + 8, entry.data.length, true)
		dv.setUint32(p + 12, offset, true)
		out.set(entry.data, offset)
		offset += entry.data.length
	})
	return out
}

/* ------------------------------------------------------------------ *
 * DOM / Canvas
 * ------------------------------------------------------------------ */

export function createObjectUrl(bytes, mime) {
	return URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }))
}

export function loadImageFromUrl(url) {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = () => reject(new Error('图片解码失败，可能格式不受支持'))
		img.src = url
	})
}

/** 解码图片字节，返回图片对象与尺寸（url 由调用方负责 revoke） */
export async function decodeImageBytes(bytes, mime) {
	const url = createObjectUrl(bytes, mime || sniffMime(bytes))
	const img = await loadImageFromUrl(url)
	return {
		img,
		url,
		width: img.naturalWidth || img.width,
		height: img.naturalHeight || img.height,
	}
}

export function createCanvas(width, height) {
	const canvas = document.createElement('canvas')
	canvas.width = Math.max(1, Math.round(width))
	canvas.height = Math.max(1, Math.round(height))
	return canvas
}

/**
 * 把图片绘制到画布
 * @param {HTMLImageElement} img
 * @param {{ width?: number, height?: number, maxSize?: number, background?: string|null, contain?: boolean }} options
 */
export function drawImageToCanvas(img, { width, height, maxSize = 0, background = null, contain = false } = {}) {
	const sw = img.naturalWidth || img.width
	const sh = img.naturalHeight || img.height
	let tw = width || sw
	let th = height || sh

	if (!width && !height && maxSize > 0) {
		const ratio = Math.min(1, maxSize / Math.max(sw, sh))
		tw = Math.max(1, Math.round(sw * ratio))
		th = Math.max(1, Math.round(sh * ratio))
	}

	const canvas = createCanvas(tw, th)
	const ctx = canvas.getContext('2d')
	ctx.imageSmoothingEnabled = true
	ctx.imageSmoothingQuality = 'high'
	if (background) {
		ctx.fillStyle = background
		ctx.fillRect(0, 0, canvas.width, canvas.height)
	}
	if (contain) {
		const canvasW = canvas.width
		const canvasH = canvas.height
		const ratio = Math.min(canvasW / sw, canvasH / sh)
		const dw = sw * ratio
		const dh = sh * ratio
		ctx.drawImage(img, (canvasW - dw) / 2, (canvasH - dh) / 2, dw, dh)
	} else {
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
	}
	return canvas
}

export function canvasToBlob(canvas, mime, quality) {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			blob => {
				if (!blob) reject(new Error(`当前环境不支持导出 ${mime} 格式`))
				else resolve(blob)
			},
			mime,
			quality
		)
	})
}

export async function blobToBytes(blob) {
	return new Uint8Array(await blob.arrayBuffer())
}

/** 画布 -> 指定格式的字节 */
export async function canvasToBytes(canvas, format) {
	const fmt = getOutputFormat(format)
	if (fmt.value === 'bmp') {
		const ctx = canvas.getContext('2d')
		const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
		return encodeBmpFromImageData(data, canvas.width, canvas.height)
	}
	const blob = await canvasToBlob(canvas, fmt.mime)
	return blobToBytes(blob)
}

/**
 * 高质量放大：每次最多放大 maxStep 倍，分多步插值（比一次性拉伸平滑得多）
 * @param {HTMLImageElement|HTMLCanvasElement} img
 * @param {number} targetWidth
 * @param {number} targetHeight
 */
export function drawImageProgressive(img, targetWidth, targetHeight, { maxStep = 2, background = null } = {}) {
	const targetW = Math.max(1, Math.round(targetWidth))
	const targetH = Math.max(1, Math.round(targetHeight))
	let stepW = img.naturalWidth || img.width
	let stepH = img.naturalHeight || img.height
	let input = img

	let guard = 0
	while ((stepW * maxStep < targetW || stepH * maxStep < targetH) && guard < 12) {
		guard += 1
		stepW = Math.min(targetW, Math.round(stepW * maxStep))
		stepH = Math.min(targetH, Math.round(stepH * maxStep))
		const canvas = createCanvas(stepW, stepH)
		const ctx = canvas.getContext('2d')
		ctx.imageSmoothingEnabled = true
		ctx.imageSmoothingQuality = 'high'
		if (background) {
			ctx.fillStyle = background
			ctx.fillRect(0, 0, canvas.width, canvas.height)
		}
		ctx.drawImage(input, 0, 0, canvas.width, canvas.height)
		input = canvas
	}

	const out = createCanvas(targetW, targetH)
	const ctx = out.getContext('2d')
	ctx.imageSmoothingEnabled = true
	ctx.imageSmoothingQuality = 'high'
	if (background) {
		ctx.fillStyle = background
		ctx.fillRect(0, 0, out.width, out.height)
	}
	ctx.drawImage(input, 0, 0, out.width, out.height)
	return out
}

/* ------------------------------------------------------------------ *
 * 图标后处理
 * ------------------------------------------------------------------ */

/** 找出非透明内容的包围盒（threshold 用于忽略接近全透明的噪点） */
export function alphaContentBounds(imageData, threshold = 8) {
	const { data, width, height } = imageData
	let minX = width
	let minY = height
	let maxX = -1
	let maxY = -1
	for (let y = 0; y < height; y += 1) {
		const rowStart = y * width * 4
		for (let x = 0; x < width; x += 1) {
			if (data[rowStart + x * 4 + 3] > threshold) {
				if (x < minX) minX = x
				if (x > maxX) maxX = x
				if (y < minY) minY = y
				if (y > maxY) maxY = y
			}
		}
	}
	if (maxX < 0) return null
	return { minX, minY, maxX, maxY }
}

/**
 * 把系统取出的图标规整成"内容铺满画布"的正方形图标。
 *
 * 背景：Windows 的 IShellItemImageFactory 在部分情况下会返回一张大画布，
 * 但真正的图标只画在中间一小块（SCALEUP 不一定生效），于是看起来"超级小"。
 * 这里裁掉透明边再把内容等比放大到目标尺寸，保证视觉大小一致。
 *
 * @param {Uint8Array} bytes 原始 PNG 字节
 * @param {number} size 目标边长
 * @returns {Promise<{ bytes: Uint8Array, sourceWidth: number, sourceHeight: number, contentWidth: number, contentHeight: number, scaled: boolean }>}
 */
export async function normalizeIconBytes(bytes, size = 512, { threshold = 8, fillTolerance = 0.96 } = {}) {
	const mime = sniffMime(bytes)
	const { img, url } = await decodeImageBytes(bytes, mime)
	try {
		const sourceWidth = img.naturalWidth || img.width
		const sourceHeight = img.naturalHeight || img.height
		const canvas = createCanvas(sourceWidth, sourceHeight)
		const ctx = canvas.getContext('2d', { willReadFrequently: true })
		ctx.drawImage(img, 0, 0)
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
		const bounds = alphaContentBounds(imageData, threshold)
		const target = Math.max(1, Math.round(size))

		if (!bounds) {
			// 全透明，原样返回
			return { bytes, sourceWidth, sourceHeight, contentWidth: sourceWidth, contentHeight: sourceHeight, scaled: false }
		}

		const contentWidth = bounds.maxX - bounds.minX + 1
		const contentHeight = bounds.maxY - bounds.minY + 1
		const alreadyFills =
			contentWidth >= sourceWidth * fillTolerance &&
			contentHeight >= sourceHeight * fillTolerance &&
			sourceWidth === target &&
			sourceHeight === target
		if (alreadyFills) {
			return { bytes, sourceWidth, sourceHeight, contentWidth, contentHeight, scaled: false }
		}

		const out = createCanvas(target, target)
		const outCtx = out.getContext('2d')
		outCtx.imageSmoothingEnabled = true
		outCtx.imageSmoothingQuality = 'high'
		const scale = Math.min(target / contentWidth, target / contentHeight)
		const drawWidth = Math.max(1, Math.round(contentWidth * scale))
		const drawHeight = Math.max(1, Math.round(contentHeight * scale))
		outCtx.drawImage(
			canvas,
			bounds.minX,
			bounds.minY,
			contentWidth,
			contentHeight,
			Math.round((target - drawWidth) / 2),
			Math.round((target - drawHeight) / 2),
			drawWidth,
			drawHeight
		)
		const normalized = await canvasToBytes(out, 'png')
		return { bytes: normalized, sourceWidth, sourceHeight, contentWidth, contentHeight, scaled: true }
	} finally {
		URL.revokeObjectURL(url)
	}
}

/**
 * 按目标大小（字节）二分查找合适的质量
 * 仅对 jpg / webp 有效
 */
export async function compressToTargetSize(img, targetBytes, { format = 'jpg', maxSize = 0, minQuality = 0.05 } = {}) {
	const fmt = getOutputFormat(format)
	if (!fmt.lossy) throw new Error('目标格式不支持有损压缩，无法按体积压缩')
	const background = fmt.alpha ? null : '#ffffff'
	const canvas = drawImageToCanvas(img, { maxSize, background })
	let low = minQuality
	let high = 0.98
	let best = null
	for (let i = 0; i < 8; i += 1) {
		const quality = (low + high) / 2
		const blob = await canvasToBlob(canvas, fmt.mime, quality)
		const bytes = await blobToBytes(blob)
		if (bytes.length <= targetBytes) {
			best = { bytes, quality }
			low = quality
		} else {
			high = quality
		}
	}
	if (!best) {
		const blob = await canvasToBlob(canvas, fmt.mime, minQuality)
		best = { bytes: await blobToBytes(blob), quality: minQuality }
	}
	return { ...best, canvas }
}

/**
 * 图片转换主入口
 * @param {Uint8Array} bytes 源文件字节
 * @param {{ format?: string, quality?: number, maxSize?: number, background?: string|null, sourceMime?: string }} options
 * @returns {Promise<{ bytes: Uint8Array, format: string, mime: string, width: number, height: number, blobUrl: string }>}
 */
export async function convertImage(bytes, { format = 'png', quality = 0.92, maxSize = 0, background = null, sourceMime } = {}) {
	const fmt = getOutputFormat(format)
	const mime = sourceMime || sniffMime(bytes)
	const { img, url } = await decodeImageBytes(bytes, mime)
	try {
		let outBytes
		let width = img.naturalWidth || img.width
		let height = img.naturalHeight || img.height

		if (fmt.value === 'ico') {
			const maxSide = Math.max(width, height)
			let sizes = ICO_SIZES.filter(s => s <= maxSide)
			if (!sizes.length) sizes = [Math.max(1, Math.min(256, maxSide))]
			const entries = []
			for (const size of sizes) {
				const canvas = drawImageToCanvas(img, { width: size, height: size, contain: true })
				const blob = await canvasToBlob(canvas, 'image/png')
				entries.push({ width: canvas.width, height: canvas.height, data: await blobToBytes(blob) })
			}
			outBytes = encodeIco(entries)
			width = sizes[sizes.length - 1]
			height = width
		} else {
			const bg = background || (fmt.alpha ? null : '#ffffff')
			const canvas = drawImageToCanvas(img, { maxSize, background: bg })
			width = canvas.width
			height = canvas.height
			outBytes = await canvasToBytes(canvas, fmt.value)
		}

		return {
			bytes: outBytes,
			format: fmt.value,
			mime: fmt.mime,
			width,
			height,
			blobUrl: createObjectUrl(outBytes, fmt.mime),
		}
	} finally {
		URL.revokeObjectURL(url)
	}
}

/**
 * 九宫格（或任意行列）切割，返回每格的画布
 * @param {{ inset?: number }} options
 *        inset：每格四边向内裁掉的像素数（用来做"间隙"，牺牲边边换取发到朋友圈后更匀称）
 */
export function splitImageGrid(img, rows = 3, cols = 3, { inset = 0 } = {}) {
	const sw = img.naturalWidth || img.width
	const sh = img.naturalHeight || img.height
	const r = Math.max(1, Math.min(20, Math.round(rows)))
	const c = Math.max(1, Math.min(20, Math.round(cols)))
	const cellW = Math.floor(sw / c)
	const cellH = Math.floor(sh / r)
	// 内缩不能超过半格，否则整格会消失
	const maxInset = Math.max(0, Math.floor(Math.min(cellW, cellH) / 2) - 1)
	const pad = Math.max(0, Math.min(maxInset, Math.round(inset || 0)))
	const list = []
	for (let row = 0; row < r; row += 1) {
		for (let col = 0; col < c; col += 1) {
			const x = col * cellW
			const y = row * cellH
			const w = col === c - 1 ? sw - x : cellW
			const h = row === r - 1 ? sh - y : cellH
			const ix = x + pad
			const iy = y + pad
			const iw = Math.max(1, w - pad * 2)
			const ih = Math.max(1, h - pad * 2)
			const canvas = createCanvas(iw, ih)
			const ctx = canvas.getContext('2d')
			ctx.drawImage(img, ix, iy, iw, ih, 0, 0, iw, ih)
			list.push({
				row,
				col,
				index: row * c + col + 1,
				// 导出尺寸（已内缩）
				width: canvas.width,
				height: canvas.height,
				// 所在格子的位置，供预览标注被裁掉的区域
				cellX: x,
				cellY: y,
				cellWidth: w,
				cellHeight: h,
				inset: pad,
				canvas,
			})
		}
	}
	return list
}

/* ------------------------------------------------------------------ *
 * 裁剪
 * ------------------------------------------------------------------ */

export const CROP_RATIOS = [
	{ label: '自由', value: 'free', ratio: null },
	{ label: '1:1', value: '1:1', ratio: 1 },
	{ label: '4:3', value: '4:3', ratio: 4 / 3 },
	{ label: '3:4', value: '3:4', ratio: 3 / 4 },
	{ label: '16:9', value: '16:9', ratio: 16 / 9 },
	{ label: '9:16', value: '9:16', ratio: 9 / 16 },
]

export const MIN_CROP = 8

export function clampRect(rect, width, height, min = MIN_CROP) {
	const w = Math.max(Math.min(min, width), Math.min(width, Math.round(rect.width)))
	const h = Math.max(Math.min(min, height), Math.min(height, Math.round(rect.height)))
	let x = Math.round(rect.x)
	let y = Math.round(rect.y)
	x = Math.max(0, Math.min(width - w, x))
	y = Math.max(0, Math.min(height - h, y))
	return { x, y, width: w, height: h }
}

/** 以某个矩形为中心，按比例得到不超过边界的最大矩形 */
export function fitRectToRatio(width, height, ratio, base = null, min = MIN_CROP) {
	if (!ratio) return clampRect(base || { x: 0, y: 0, width, height }, width, height, min)
	let w = base?.width || width
	let h = base?.height || height
	if (w / h > ratio) w = h * ratio
	else h = w / ratio
	if (w > width) {
		w = width
		h = w / ratio
	}
	if (h > height) {
		h = height
		w = h * ratio
	}
	const cx = base ? base.x + base.width / 2 : width / 2
	const cy = base ? base.y + base.height / 2 : height / 2
	return clampRect({ x: cx - w / 2, y: cy - h / 2, width: w, height: h }, width, height, min)
}

/** 移动裁剪框（dx/dy 为图片坐标下的位移） */
export function moveRect(start, dx, dy, bounds) {
	const x = Math.max(0, Math.min(bounds.width - start.width, start.x + dx))
	const y = Math.max(0, Math.min(bounds.height - start.height, start.y + dy))
	return { x: Math.round(x), y: Math.round(y), width: start.width, height: start.height }
}

/** 自由比例下拉伸手柄（8 个方向） */
export function resizeRectFree(handle, dx, dy, start, bounds, min = MIN_CROP) {
	const west = handle.includes('w')
	const east = handle.includes('e')
	const north = handle.includes('n')
	const south = handle.includes('s')
	let { x, y, width, height } = start

	if (east) width = Math.max(min, Math.min(bounds.width - x, start.width + dx))
	if (west) {
		const move = Math.min(dx, start.width - min)
		x = Math.max(0, start.x + move)
		width = start.width + (start.x - x)
	}
	if (south) height = Math.max(min, Math.min(bounds.height - y, start.height + dy))
	if (north) {
		const move = Math.min(dy, start.height - min)
		y = Math.max(0, start.y + move)
		height = start.height + (start.y - y)
	}
	return clampRect({ x, y, width, height }, bounds.width, bounds.height, min)
}

/**
 * 锁定比例时按对角锚点拉伸（point 为鼠标所在的图片坐标，start 为起始裁剪框）
 * 锚点取起始框上与该手柄相对的角
 */
export function resizeRectLocked(handle, point, start, ratio, bounds, min = MIN_CROP) {
	const east = handle.includes('e')
	const south = handle.includes('s')
	const anchorX = east ? start.x : start.x + start.width
	const anchorY = south ? start.y : start.y + start.height

	const dirX = east ? 1 : -1
	const dirY = south ? 1 : -1
	const availW = dirX > 0 ? bounds.width - anchorX : anchorX
	const availH = dirY > 0 ? bounds.height - anchorY : anchorY

	let w = Math.abs(point.x - anchorX)
	let h = Math.abs(point.y - anchorY)
	// 取能同时满足比例与边界的方向
	if (w / ratio > h) w = h * ratio
	else h = w / ratio
	const maxW = Math.min(availW, availH * ratio)
	w = Math.min(Math.max(min, w), Math.max(min, maxW))
	h = w / ratio
	if (h > availH) {
		h = availH
		w = h * ratio
	}

	const x = dirX > 0 ? anchorX : anchorX - w
	const y = dirY > 0 ? anchorY : anchorY - h
	return clampRect({ x, y, width: w, height: h }, bounds.width, bounds.height, min)
}

/** 按裁剪框从原图中取出画布 */
export function cropCanvas(img, rect) {
	const canvas = createCanvas(rect.width, rect.height)
	const ctx = canvas.getContext('2d')
	ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
	return canvas
}

/* ------------------------------------------------------------------ *
 * 图片美化（亮度/对比度/饱和度/灰度/光感/高光/阴影/色阶/锐化）
 * ------------------------------------------------------------------ */

export const DEFAULT_BEAUTIFY = {
	exposure: 0, // 光感 -100 ~ 100（约 ±1 档曝光）
	brightness: 0, // 亮度 -100 ~ 100
	contrast: 0, // 对比度 -100 ~ 100
	saturation: 0, // 饱和度 -100 ~ 100
	grayscale: 0, // 灰度 0 ~ 100
	highlights: 0, // 高光 -100 ~ 100
	shadows: 0, // 阴影 -100 ~ 100
	blackPoint: 0, // 色阶·黑场 0 ~ 100
	whitePoint: 100, // 色阶·白场 0 ~ 100
	gamma: 1, // 中间调 0.2 ~ 3
	sharpen: 0, // 锐化 0 ~ 100
}

export const BEAUTIFY_PRESETS = [
	{ label: '原图', value: 'none', options: {} },
	{ label: '明亮', value: 'bright', options: { exposure: 18, brightness: 8, contrast: 6, saturation: 8 } },
	{ label: '通透', value: 'clear', options: { contrast: 18, saturation: 12, shadows: 12, sharpen: 25 } },
	{ label: '柔和', value: 'soft', options: { exposure: 8, brightness: 6, contrast: -10, saturation: -6, shadows: 10 } },
	{ label: '黑白', value: 'mono', options: { grayscale: 100, contrast: 14 } },
	{ label: '浓郁', value: 'vivid', options: { saturation: 35, contrast: 14, highlights: -10 } },
]

/** 构建逐通道色调查找表（合并光感/亮度/高光/阴影/色阶/中间调/对比度） */
export function buildToneLut(options = {}) {
	const o = { ...DEFAULT_BEAUTIFY, ...options }
	const lut = new Uint8ClampedArray(256)
	const ev = Math.pow(2, o.exposure / 100)
	const bright = (o.brightness / 100) * 80
	const contrast = 1 + (o.contrast / 100) * 0.9
	const black = (o.blackPoint / 100) * 200
	const white = 255 - ((100 - o.whitePoint) / 100) * 200
	const range = Math.max(1, white - black)
	const invGamma = 1 / Math.max(0.05, o.gamma)
	const hi = o.highlights / 100
	const sh = o.shadows / 100

	for (let i = 0; i < 256; i += 1) {
		let v = Math.pow(i / 255, invGamma) * 255
		v = ((v - black) / range) * 255
		v *= ev
		v += bright
		if (hi !== 0 && v > 160) v += (v - 160) * hi * 0.9
		if (sh !== 0 && v < 96) v += (96 - v) * sh * 0.9
		v = (v - 128) * contrast + 128
		lut[i] = v
	}
	return lut
}

/** 对 RGBA 像素做美化处理，返回新的 { data, width, height } */
export function beautifyImageData(imageData, options = {}) {
	const o = { ...DEFAULT_BEAUTIFY, ...options }
	const { width, height, data: src } = imageData
	const lut = buildToneLut(o)
	const sat = 1 + o.saturation / 100
	const grayMix = Math.min(1, Math.max(0, o.grayscale / 100))
	const out = new Uint8ClampedArray(src.length)

	for (let i = 0; i < src.length; i += 4) {
		let r = lut[src[i]]
		let g = lut[src[i + 1]]
		let b = lut[src[i + 2]]
		if (sat !== 1) {
			const gray = 0.299 * r + 0.587 * g + 0.114 * b
			r = gray + (r - gray) * sat
			g = gray + (g - gray) * sat
			b = gray + (b - gray) * sat
		}
		if (grayMix > 0) {
			const gray = 0.299 * r + 0.587 * g + 0.114 * b
			r += (gray - r) * grayMix
			g += (gray - g) * grayMix
			b += (gray - b) * grayMix
		}
		out[i] = r
		out[i + 1] = g
		out[i + 2] = b
		out[i + 3] = src[i + 3]
	}

	const result = { data: out, width, height }
	return o.sharpen > 0 ? sharpenImageData(result, o.sharpen) : result
}

/**
 * USM 锐化：out = 原值 + k·4·(原值 − 四邻域均值)，并带阈值保护，避免放大平坦区域的噪点
 * @param {number} amount 0 ~ 100，k 最大 1.2（相当于约 200% 强度的 USM）
 */
export function sharpenImageData(imageData, amount = 0) {
	const k = Math.min(1.2, Math.max(0, (amount / 100) * 0.5))
	if (k <= 0) return imageData
	const { width: w, height: h, data: src } = imageData
	const out = new Uint8ClampedArray(src.length)
	const threshold = 3 * 4 // 局部对比度低于阈值时不处理

	for (let y = 0; y < h; y += 1) {
		for (let x = 0; x < w; x += 1) {
			const i = (y * w + x) * 4
			const up = y > 0 ? i - w * 4 : i
			const down = y < h - 1 ? i + w * 4 : i
			const left = x > 0 ? i - 4 : i
			const right = x < w - 1 ? i + 4 : i
			for (let c = 0; c < 3; c += 1) {
				const value = src[i + c]
				const diff = value * 4 - (src[up + c] + src[down + c] + src[left + c] + src[right + c])
				out[i + c] = Math.abs(diff) > threshold ? value + k * diff : value
			}
			out[i + 3] = src[i + 3]
		}
	}
	return { data: out, width: w, height: h }
}
