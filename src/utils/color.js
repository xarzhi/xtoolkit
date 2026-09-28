/**
 * 颜色格式互转（纯函数，可单独测试）
 * 支持：HEX / RGB(A) / HSL(A) / HSV / CMYK / HWB
 */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function normalizeHex(hex) {
	let value = String(hex ?? '').trim().replace(/^#/, '')
	if (!/^[0-9a-fA-F]+$/.test(value)) return null
	if (value.length === 3 || value.length === 4) {
		value = value
			.split('')
			.map(ch => ch + ch)
			.join('')
	}
	if (value.length !== 6 && value.length !== 8) return null
	return `#${value.toLowerCase()}`
}

export function hexToRgb(hex) {
	const normalized = normalizeHex(hex)
	if (!normalized) return null
	return {
		r: parseInt(normalized.slice(1, 3), 16),
		g: parseInt(normalized.slice(3, 5), 16),
		b: parseInt(normalized.slice(5, 7), 16),
		a: normalized.length === 9 ? parseInt(normalized.slice(7, 9), 16) / 255 : 1,
	}
}

const toHexPart = value => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')

export function rgbToHex({ r, g, b, a = 1 }) {
	const base = `#${toHexPart(r)}${toHexPart(g)}${toHexPart(b)}`
	return a < 1 ? `${base}${toHexPart(a * 255)}` : base
}

export function rgbToHsl({ r, g, b }) {
	const rn = r / 255
	const gn = g / 255
	const bn = b / 255
	const max = Math.max(rn, gn, bn)
	const min = Math.min(rn, gn, bn)
	const delta = max - min
	let h = 0
	if (delta !== 0) {
		if (max === rn) h = ((gn - bn) / delta) % 6
		else if (max === gn) h = (bn - rn) / delta + 2
		else h = (rn - gn) / delta + 4
		h *= 60
		if (h < 0) h += 360
	}
	const l = (max + min) / 2
	const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))
	return { h, s: s * 100, l: l * 100 }
}

export function hslToRgb({ h, s, l }) {
	const hn = ((h % 360) + 360) % 360
	const sn = clamp(s, 0, 100) / 100
	const ln = clamp(l, 0, 100) / 100
	const c = (1 - Math.abs(2 * ln - 1)) * sn
	const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
	const m = ln - c / 2
	let rgb = [0, 0, 0]
	if (hn < 60) rgb = [c, x, 0]
	else if (hn < 120) rgb = [x, c, 0]
	else if (hn < 180) rgb = [0, c, x]
	else if (hn < 240) rgb = [0, x, c]
	else if (hn < 300) rgb = [x, 0, c]
	else rgb = [c, 0, x]
	return {
		r: Math.round((rgb[0] + m) * 255),
		g: Math.round((rgb[1] + m) * 255),
		b: Math.round((rgb[2] + m) * 255),
	}
}

export function rgbToHsv({ r, g, b }) {
	const rn = r / 255
	const gn = g / 255
	const bn = b / 255
	const max = Math.max(rn, gn, bn)
	const min = Math.min(rn, gn, bn)
	const delta = max - min
	let h = 0
	if (delta !== 0) {
		if (max === rn) h = ((gn - bn) / delta) % 6
		else if (max === gn) h = (bn - rn) / delta + 2
		else h = (rn - gn) / delta + 4
		h *= 60
		if (h < 0) h += 360
	}
	return { h, s: max === 0 ? 0 : (delta / max) * 100, v: max * 100 }
}

export function hsvToRgb({ h, s, v }) {
	const hn = ((h % 360) + 360) % 360
	const sn = clamp(s, 0, 100) / 100
	const vn = clamp(v, 0, 100) / 100
	const c = vn * sn
	const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
	const m = vn - c
	let rgb = [0, 0, 0]
	if (hn < 60) rgb = [c, x, 0]
	else if (hn < 120) rgb = [x, c, 0]
	else if (hn < 180) rgb = [0, c, x]
	else if (hn < 240) rgb = [0, x, c]
	else if (hn < 300) rgb = [x, 0, c]
	else rgb = [c, 0, x]
	return {
		r: Math.round((rgb[0] + m) * 255),
		g: Math.round((rgb[1] + m) * 255),
		b: Math.round((rgb[2] + m) * 255),
	}
}

export function rgbToCmyk({ r, g, b }) {
	const rn = r / 255
	const gn = g / 255
	const bn = b / 255
	const k = 1 - Math.max(rn, gn, bn)
	if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 }
	const c = (1 - rn - k) / (1 - k)
	const m = (1 - gn - k) / (1 - k)
	const y = (1 - bn - k) / (1 - k)
	return { c: c * 100, m: m * 100, y: y * 100, k: k * 100 }
}

export function cmykToRgb({ c, m, y, k }) {
	const cn = clamp(c, 0, 100) / 100
	const mn = clamp(m, 0, 100) / 100
	const yn = clamp(y, 0, 100) / 100
	const kn = clamp(k, 0, 100) / 100
	return {
		r: Math.round(255 * (1 - cn) * (1 - kn)),
		g: Math.round(255 * (1 - mn) * (1 - kn)),
		b: Math.round(255 * (1 - yn) * (1 - kn)),
	}
}

/** HWB：h 0~360，w/b 0~100 */
export function rgbToHwb({ r, g, b }) {
	const { h } = rgbToHsv({ r, g, b })
	const w = Math.min(r, g, b) / 255
	const bl = 1 - Math.max(r, g, b) / 255
	return { h, w: w * 100, b: bl * 100 }
}

export function hwbToRgb({ h, w, b }) {
	const wn = clamp(w, 0, 100) / 100
	const bn = clamp(b, 0, 100) / 100
	if (wn + bn >= 1) {
		const gray = Math.round((wn / (wn + bn)) * 255)
		return { r: gray, g: gray, b: gray }
	}
	// 先取纯色，再按 w/b 压缩到剩余区间
	const pure = hsvToRgb({ h, s: 100, v: 100 })
	const factor = 1 - wn - bn
	return {
		r: Math.round(pure.r * factor + wn * 255),
		g: Math.round(pure.g * factor + wn * 255),
		b: Math.round(pure.b * factor + wn * 255),
	}
}

/**
 * 解析任意支持格式的颜色字符串
 * @returns {{ r:number, g:number, b:number, a:number } | null}
 */
export function parseColor(input) {
	const text = String(input ?? '').trim()
	if (!text) return null

	// HEX
	if (/^#?[0-9a-fA-F]{3,8}$/.test(text)) return hexToRgb(text)

	// 函数式：rgb()/rgba()/hsl()/hsla()/hsv()/hsb()/cmyk()/hwb()
	const match = text.match(/^([a-zA-Z]+)\s*\(([^)]*)\)$/)
	if (match) {
		const fn = match[1].toLowerCase()
		const parts = match[2]
			.split(/[,\s/]+/)
			.filter(Boolean)
			.map(part => {
				if (part.endsWith('%')) return parseFloat(part)
				return parseFloat(part)
			})
		if (parts.some(Number.isNaN)) return null
		const [a = 0, b = 0, c = 0, d = 1] = parts
		if (fn === 'rgb' || fn === 'rgba') {
			return { r: clamp(Math.round(a), 0, 255), g: clamp(Math.round(b), 0, 255), b: clamp(Math.round(c), 0, 255), a: clamp(d, 0, 1) }
		}
		if (fn === 'hsl' || fn === 'hsla') {
			const rgb = hslToRgb({ h: a, s: b, l: c })
			return { ...rgb, a: clamp(d, 0, 1) }
		}
		if (fn === 'hsv' || fn === 'hsb') return { ...hsvToRgb({ h: a, s: b, v: c }), a: 1 }
		if (fn === 'cmyk') return { ...cmykToRgb({ c: a, m: b, y: c, k: d }), a: 1 }
		if (fn === 'hwb') return { ...hwbToRgb({ h: a, w: b, b: c }), a: 1 }
		return null
	}
	return null
}

const round = (value, digits = 2) => {
	const factor = 10 ** digits
	return Math.round(value * factor) / factor
}

/** 把颜色格式化成各种字符串 */
export function formatColor(color) {
	const { r, g, b, a = 1 } = color
	const hsl = rgbToHsl(color)
	const hsv = rgbToHsv(color)
	const cmyk = rgbToCmyk(color)
	const hwb = rgbToHwb(color)
	return {
		hex: rgbToHex({ r, g, b }),
		hexAlpha: rgbToHex({ r, g, b, a }),
		rgb: `rgb(${r}, ${g}, ${b})`,
		rgba: `rgba(${r}, ${g}, ${b}, ${round(a, 3)})`,
		hsl: `hsl(${round(hsl.h, 1)}, ${round(hsl.s, 1)}%, ${round(hsl.l, 1)}%)`,
		hsla: `hsla(${round(hsl.h, 1)}, ${round(hsl.s, 1)}%, ${round(hsl.l, 1)}%, ${round(a, 3)})`,
		hsv: `hsv(${round(hsv.h, 1)}, ${round(hsv.s, 1)}%, ${round(hsv.v, 1)}%)`,
		cmyk: `cmyk(${round(cmyk.c, 1)}%, ${round(cmyk.m, 1)}%, ${round(cmyk.y, 1)}%, ${round(cmyk.k, 1)}%)`,
		hwb: `hwb(${round(hwb.h, 1)}, ${round(hwb.w, 1)}%, ${round(hwb.b, 1)}%)`,
		parts: { hsl, hsv, cmyk, hwb },
	}
}

/** 计算对比度（用于提示文字该用黑还是白） */
export function relativeLuminance({ r, g, b }) {
	const channel = value => {
		const v = value / 255
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastText(color) {
	return relativeLuminance(color) > 0.5 ? '#000000' : '#ffffff'
}

/** 生成一组调色板（变亮/变暗/饱和度变化），方便挑色 */
export function buildPalette(color) {
	const hsl = rgbToHsl(color)
	const list = []
	const push = (h, s, l, label) => {
		const rgb = hslToRgb({ h, s, l })
		list.push({ ...rgb, hex: rgbToHex(rgb), label })
	}
	for (const delta of [-30, -15, 0, 15, 30]) {
		push(hsl.h, hsl.s, clamp(hsl.l + delta, 0, 100), `亮度 ${delta >= 0 ? '+' : ''}${delta}`)
	}
	for (const delta of [-40, -20, 20, 40]) {
		push(hsl.h, clamp(hsl.s + delta, 0, 100), hsl.l, `饱和 ${delta >= 0 ? '+' : ''}${delta}`)
	}
	const complement = hslToRgb({ h: hsl.h + 180, s: hsl.s, l: hsl.l })
	list.push({ ...complement, hex: rgbToHex(complement), label: '互补色' })
	return list
}
