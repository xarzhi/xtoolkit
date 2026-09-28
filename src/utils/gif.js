/**
 * GIF89a 编码器（纯 JS，自研，无第三方依赖）
 *
 * 流程：采样像素 → 中位切分量化出全局调色板 → 逐帧映射颜色索引 → LZW 压缩 → 组装文件
 * 说明：使用全局调色板 + 可选 Floyd–Steinberg 抖动；调色板固定按 256 色写入。
 */

class ByteWriter {
	constructor(capacity = 1 << 16) {
		this.buf = new Uint8Array(capacity)
		this.len = 0
	}

	ensure(size) {
		if (this.len + size <= this.buf.length) return
		let capacity = this.buf.length
		while (capacity < this.len + size) capacity *= 2
		const next = new Uint8Array(capacity)
		next.set(this.buf.subarray(0, this.len))
		this.buf = next
	}

	byte(value) {
		this.ensure(1)
		this.buf[this.len] = value & 0xff
		this.len += 1
	}

	bytes(array) {
		this.ensure(array.length)
		this.buf.set(array, this.len)
		this.len += array.length
	}

	u16(value) {
		this.ensure(2)
		this.buf[this.len] = value & 0xff
		this.buf[this.len + 1] = (value >> 8) & 0xff
		this.len += 2
	}

	ascii(text) {
		for (let i = 0; i < text.length; i += 1) this.byte(text.charCodeAt(i))
	}

	/** 按 GIF 子块格式写入（每块最多 255 字节，以 0 结束） */
	subBlocks(data) {
		for (let i = 0; i < data.length; i += 255) {
			const size = Math.min(255, data.length - i)
			this.byte(size)
			this.bytes(data.subarray(i, i + size))
		}
		this.byte(0)
	}

	toUint8Array() {
		return this.buf.slice(0, this.len)
	}
}

/** GIF 的位流是低位优先的 */
class BitWriter {
	constructor() {
		this.out = []
		this.cur = 0
		this.bits = 0
	}

	write(code, size) {
		this.cur |= code << this.bits
		this.bits += size
		while (this.bits >= 8) {
			this.out.push(this.cur & 0xff)
			this.cur >>= 8
			this.bits -= 8
		}
	}

	flush() {
		if (this.bits > 0) {
			this.out.push(this.cur & 0xff)
			this.cur = 0
			this.bits = 0
		}
	}

	toUint8Array() {
		const arr = new Uint8Array(this.out.length)
		for (let i = 0; i < this.out.length; i += 1) arr[i] = this.out[i]
		return arr
	}
}

/**
 * GIF LZW 压缩
 * @param {Uint8Array} indices 颜色索引流
 * @param {number} minCodeSize 最小码长（索引位宽，8 表示 256 色）
 */
export function lzwEncode(indices, minCodeSize = 8) {
	const clearCode = 1 << minCodeSize
	const eoiCode = clearCode + 1
	const MAX_CODE = 1 << 12

	const writer = new BitWriter()
	let codeSize = minCodeSize + 1
	let maxCode = (1 << codeSize) - 1
	let freeEnt = clearCode + 2
	let clearFlag = false
	const dict = new Map()

	const writeCode = code => {
		writer.write(code, codeSize)
		if (clearFlag) {
			codeSize = minCodeSize + 1
			maxCode = (1 << codeSize) - 1
			clearFlag = false
		} else if (freeEnt > maxCode) {
			codeSize += 1
			maxCode = codeSize === 12 ? MAX_CODE : (1 << codeSize) - 1
		}
	}

	writeCode(clearCode)
	if (!indices.length) {
		writeCode(eoiCode)
		writer.flush()
		return writer.toUint8Array()
	}

	let prefix = indices[0]
	for (let i = 1; i < indices.length; i += 1) {
		const k = indices[i]
		const key = (prefix << 8) | k
		const found = dict.get(key)
		if (found !== undefined) {
			prefix = found
			continue
		}
		writeCode(prefix)
		if (freeEnt < MAX_CODE) {
			dict.set(key, freeEnt)
			freeEnt += 1
		} else {
			// 字典写满：输出 clear code 并重置
			clearFlag = true
			writeCode(clearCode)
			dict.clear()
			freeEnt = clearCode + 2
		}
		prefix = k
	}
	writeCode(prefix)
	writeCode(eoiCode)
	writer.flush()
	return writer.toUint8Array()
}

/**
 * 中位切分量化
 * @param {Uint8Array} rgb 扁平的 RGB 三元组数据（长度是 3 的倍数）
 * @param {number} maxColors 目标颜色数
 * @returns {number[][]} 调色板 [[r,g,b], ...]
 */
export function medianCutPalette(rgb, maxColors = 256) {
	const count = Math.floor(rgb.length / 3)
	if (!count) return [[0, 0, 0]]
	const index = new Uint32Array(count)
	for (let i = 0; i < count; i += 1) index[i] = i * 3

	const boxes = [{ start: 0, end: count }]
	const channelRange = box => {
		let rMin = 255
		let rMax = 0
		let gMin = 255
		let gMax = 0
		let bMin = 255
		let bMax = 0
		for (let i = box.start; i < box.end; i += 1) {
			const p = index[i]
			const r = rgb[p]
			const g = rgb[p + 1]
			const b = rgb[p + 2]
			if (r < rMin) rMin = r
			if (r > rMax) rMax = r
			if (g < gMin) gMin = g
			if (g > gMax) gMax = g
			if (b < bMin) bMin = b
			if (b > bMax) bMax = b
		}
		return [rMax - rMin, gMax - gMin, bMax - bMin]
	}

	while (boxes.length < maxColors) {
		let target = -1
		let bestScore = 0
		let bestChannel = 0
		for (let i = 0; i < boxes.length; i += 1) {
			const box = boxes[i]
			const size = box.end - box.start
			if (size < 2) continue
			const ranges = channelRange(box)
			let channel = 0
			if (ranges[1] > ranges[channel]) channel = 1
			if (ranges[2] > ranges[channel]) channel = 2
			const range = ranges[channel]
			if (range <= 0) continue
			const score = range * size
			if (score > bestScore) {
				bestScore = score
				target = i
				bestChannel = channel
			}
		}
		if (target < 0) break
		const box = boxes[target]
		index.subarray(box.start, box.end).sort((a, b) => rgb[a + bestChannel] - rgb[b + bestChannel])
		const mid = box.start + ((box.end - box.start) >> 1)
		boxes.splice(target, 1, { start: box.start, end: mid }, { start: mid, end: box.end })
	}

	return boxes.map(box => {
		let r = 0
		let g = 0
		let b = 0
		const size = box.end - box.start
		for (let i = box.start; i < box.end; i += 1) {
			const p = index[i]
			r += rgb[p]
			g += rgb[p + 1]
			b += rgb[p + 2]
		}
		return [Math.round(r / size), Math.round(g / size), Math.round(b / size)]
	})
}

/**
 * 把一帧 RGBA 映射为调色板索引
 * @param {Uint8ClampedArray|Uint8Array} rgba
 */
export function mapFrameToIndices(rgba, width, height, palette, { dither = true } = {}) {
	const indices = new Uint8Array(width * height)
	const cache = new Int16Array(32768).fill(-1)

	const nearest = (r, g, b) => {
		const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
		const cached = cache[key]
		if (cached >= 0) return cached
		let best = 0
		let bestDist = Infinity
		for (let i = 0; i < palette.length; i += 1) {
			const p = palette[i]
			const dr = r - p[0]
			const dg = g - p[1]
			const db = b - p[2]
			const dist = dr * dr + dg * dg + db * db
			if (dist < bestDist) {
				bestDist = dist
				best = i
				if (dist === 0) break
			}
		}
		cache[key] = best
		return best
	}

	if (!dither) {
		for (let i = 0, p = 0; i < indices.length; i += 1, p += 4) {
			indices[i] = nearest(rgba[p], rgba[p + 1], rgba[p + 2])
		}
		return indices
	}

	// Floyd–Steinberg 误差扩散（只保留相邻两行的误差）
	let errCur = new Float32Array((width + 2) * 3)
	let errNext = new Float32Array((width + 2) * 3)
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const p = (y * width + x) * 4
			const e = (x + 1) * 3
			let r = rgba[p] + errCur[e]
			let g = rgba[p + 1] + errCur[e + 1]
			let b = rgba[p + 2] + errCur[e + 2]
			r = r < 0 ? 0 : r > 255 ? 255 : r
			g = g < 0 ? 0 : g > 255 ? 255 : g
			b = b < 0 ? 0 : b > 255 ? 255 : b

			const idx = nearest(r | 0, g | 0, b | 0)
			indices[y * width + x] = idx
			const pal = palette[idx]
			const er = r - pal[0]
			const eg = g - pal[1]
			const eb = b - pal[2]

			errCur[e + 3] += (er * 7) / 16
			errCur[e + 4] += (eg * 7) / 16
			errCur[e + 5] += (eb * 7) / 16
			errNext[e - 3] += (er * 3) / 16
			errNext[e - 2] += (eg * 3) / 16
			errNext[e - 1] += (eb * 3) / 16
			errNext[e] += (er * 5) / 16
			errNext[e + 1] += (eg * 5) / 16
			errNext[e + 2] += (eb * 5) / 16
			errNext[e + 3] += er / 16
			errNext[e + 4] += eg / 16
			errNext[e + 5] += eb / 16
		}
		const swap = errCur
		errCur = errNext
		errNext = swap
		errNext.fill(0)
	}
	return indices
}

/**
 * 组装 GIF89a 文件
 * @param {{ width: number, height: number, palette: number[][], frames: {indices: Uint8Array, delay: number}[], loop?: number }} options
 *        delay 单位为 1/100 秒
 */
export function encodeGif({ width, height, palette, frames, loop = 0 }) {
	const out = new ByteWriter(1 << 18)
	out.ascii('GIF89a')

	// 逻辑屏幕描述符
	out.u16(width)
	out.u16(height)
	out.byte(0xf7) // 全局调色板 + 8 位色深 + 256 色表
	out.byte(0) // 背景色索引
	out.byte(0) // 像素宽高比

	// 全局调色板（不足 256 色时补黑）
	for (let i = 0; i < 256; i += 1) {
		const color = palette[i] || [0, 0, 0]
		out.byte(color[0])
		out.byte(color[1])
		out.byte(color[2])
	}

	// NETSCAPE2.0 循环扩展（loop 为 null 时不写入，即只播放一次）
	if (loop !== null) {
		out.byte(0x21)
		out.byte(0xff)
		out.byte(0x0b)
		out.ascii('NETSCAPE2.0')
		out.byte(0x03)
		out.byte(0x01)
		out.u16(loop)
		out.byte(0x00)
	}

	for (const frame of frames) {
		// 图形控制扩展：处置方式 1（保留当前帧）
		out.byte(0x21)
		out.byte(0xf9)
		out.byte(0x04)
		out.byte(0x04)
		out.u16(Math.max(1, Math.round(frame.delay)))
		out.byte(0)
		out.byte(0)

		// 图像描述符
		out.byte(0x2c)
		out.u16(0)
		out.u16(0)
		out.u16(width)
		out.u16(height)
		out.byte(0)

		out.byte(8) // LZW 最小码长
		out.subBlocks(lzwEncode(frame.indices, 8))
	}

	out.byte(0x3b) // 文件结束
	return out.toUint8Array()
}

/**
 * 渐进式构建器：先采样若干帧建立全局调色板，再逐帧映射，避免同时持有全部 RGBA 数据
 */
export class GifBuilder {
	constructor({ width, height, maxColors = 256, dither = true, loop = 0, delay = 10 }) {
		this.width = width
		this.height = height
		this.maxColors = Math.min(256, Math.max(2, maxColors))
		this.dither = dither
		this.loop = loop
		this.delay = delay
		this.samples = []
		this.frames = []
		this.palette = null
	}

	/** 采样调色板像素（step 为采样间隔，单位像素） */
	addSample(rgba, step = 37) {
		const stride = Math.max(1, Math.round(step)) * 4
		const triples = []
		for (let i = 0; i + 2 < rgba.length; i += stride) {
			triples.push(rgba[i], rgba[i + 1], rgba[i + 2])
		}
		this.samples.push(Uint8Array.from(triples))
	}

	/**
	 * 建立全局调色板。
	 * 必须在添加帧之前调用：调色板一旦生成，后续 addSample 将不再生效。
	 */
	buildPalette() {
		let total = 0
		for (const sample of this.samples) total += sample.length
		const merged = new Uint8Array(Math.max(3, total))
		let offset = 0
		for (const sample of this.samples) {
			merged.set(sample, offset)
			offset += sample.length
		}
		if (!offset) merged.set([0, 0, 0], 0)
		this.palette = medianCutPalette(offset ? merged.subarray(0, offset) : merged, this.maxColors)
		return this.palette
	}

	addFrame(rgba, delay) {
		if (!this.palette) {
			throw new Error('调色板尚未建立，请先调用 buildPalette()（或使用 encodeFrames）')
		}
		const indices = mapFrameToIndices(rgba, this.width, this.height, this.palette, { dither: this.dither })
		this.frames.push({ indices, delay: delay ?? this.delay })
	}

	get frameCount() {
		return this.frames.length
	}

	build() {
		if (!this.palette) this.buildPalette()
		return encodeGif({
			width: this.width,
			height: this.height,
			palette: this.palette,
			frames: this.frames,
			loop: this.loop,
		})
	}
}
