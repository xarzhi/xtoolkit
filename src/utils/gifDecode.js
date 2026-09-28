/**
 * GIF 解码器（纯 JS，自研）
 *
 * - probeGif：只解析块结构，快速得到尺寸 / 帧数 / 循环次数 / 总时长
 * - decodeGif：完整解码并按帧回调 RGBA，支持处置方式 0/1/2/3、透明色、隔行扫描、局部调色板
 */

function toBytes(input) {
	if (input instanceof Uint8Array) return input
	return new Uint8Array(input)
}

function makeReader(data) {
	let pos = 0
	return {
		get pos() {
			return pos
		},
		set pos(value) {
			pos = value
		},
		left() {
			return data.length - pos
		},
		u8() {
			return data[pos++]
		},
		u16() {
			const value = data[pos] | (data[pos + 1] << 8)
			pos += 2
			return value
		},
		take(count) {
			const slice = data.subarray(pos, pos + count)
			pos += count
			return slice
		},
		skip(count) {
			pos += count
		},
		/** 读取末尾以 0 结束的数据子块并拼接 */
		subBlocks() {
			const chunks = []
			let total = 0
			for (;;) {
				if (pos >= data.length) break
				const size = data[pos++]
				if (!size) break
				chunks.push(data.subarray(pos, pos + size))
				total += size
				pos += size
			}
			const out = new Uint8Array(total)
			let offset = 0
			for (const chunk of chunks) {
				out.set(chunk, offset)
				offset += chunk.length
			}
			return out
		},
	}
}

function readColorTable(reader, count) {
	const table = new Uint8Array(count * 3)
	for (let i = 0; i < count; i += 1) {
		table[i * 3] = reader.u8()
		table[i * 3 + 1] = reader.u8()
		table[i * 3 + 2] = reader.u8()
	}
	return { table, count }
}

function checkHeader(data) {
	if (data.length < 13 || data[0] !== 0x47 || data[1] !== 0x49 || data[2] !== 0x46) {
		throw new Error('不是有效的 GIF 文件')
	}
}

/** 只解析结构，不解码像素 */
export function probeGif(input) {
	const data = toBytes(input)
	checkHeader(data)
	const reader = makeReader(data)
	reader.pos = 6
	const width = reader.u16()
	const height = reader.u16()
	const packed = reader.u8()
	reader.u8() // 背景色索引
	reader.u8() // 像素宽高比
	if (packed & 0x80) reader.skip(3 * (1 << ((packed & 0x07) + 1)))

	let frameCount = 0
	let loop = null
	let delayTotal = 0
	while (reader.left() > 0) {
		const marker = reader.u8()
		if (marker === 0x3b) break
		if (marker === 0x21) {
			const label = reader.u8()
			if (label === 0xf9) {
				const size = reader.u8()
				reader.u8() // flags
				delayTotal += reader.u16()
				reader.u8() // 透明色索引
				if (size > 4) reader.skip(size - 4)
				reader.u8() // 结束
			} else if (label === 0xff) {
				const size = reader.u8()
				let name = ''
				for (let i = 0; i < size; i += 1) name += String.fromCharCode(reader.u8())
				const payload = reader.subBlocks()
				if (name === 'NETSCAPE2.0' && payload.length >= 3 && payload[0] === 1) {
					loop = payload[1] | (payload[2] << 8)
				}
			} else {
				reader.u8()
				reader.subBlocks()
			}
			continue
		}
		if (marker === 0x2c) {
			frameCount += 1
			reader.skip(8) // left / top / width / height
			const ipacked = reader.u8()
			if (ipacked & 0x80) reader.skip(3 * (1 << ((ipacked & 0x07) + 1)))
			reader.u8() // LZW 最小码长
			reader.subBlocks()
			continue
		}
		throw new Error('GIF 结构异常，无法解析')
	}
	return { width, height, frameCount, loop, duration: delayTotal / 100 }
}

/** GIF LZW 解码（前缀表实现） */
export function lzwDecode(data, minCodeSize, pixelCount) {
	const clearCode = 1 << minCodeSize
	const eoiCode = clearCode + 1
	const prefix = new Uint16Array(4096)
	const suffix = new Uint8Array(4096)
	const stack = new Uint8Array(4097)
	const out = new Uint8Array(pixelCount)
	let outPos = 0

	let codeSize = minCodeSize + 1
	let codeMask = (1 << codeSize) - 1
	let available = clearCode + 2
	let oldCode = -1
	let bitBuffer = 0
	let bitCount = 0
	let dataPos = 0

	for (let i = 0; i < clearCode; i += 1) suffix[i] = i

	const readCode = () => {
		while (bitCount < codeSize) {
			if (dataPos >= data.length) return eoiCode
			bitBuffer |= data[dataPos++] << bitCount
			bitCount += 8
		}
		const code = bitBuffer & codeMask
		bitBuffer >>= codeSize
		bitCount -= codeSize
		return code
	}

	for (;;) {
		if (outPos >= pixelCount) break
		const code = readCode()
		if (code === eoiCode) break
		if (code === clearCode) {
			codeSize = minCodeSize + 1
			codeMask = (1 << codeSize) - 1
			available = clearCode + 2
			oldCode = -1
			continue
		}

		let inCode = code
		let stackPos = 0
		if (code >= available) {
			// KwKwK 特例：当前码还没进字典
			if (oldCode < 0) break
			let walk = oldCode
			while (walk >= clearCode) walk = prefix[walk]
			stack[stackPos++] = walk
			inCode = oldCode
		}
		let walk = inCode
		while (walk >= clearCode) {
			stack[stackPos++] = suffix[walk]
			walk = prefix[walk]
		}
		stack[stackPos++] = walk
		const firstChar = walk

		if (oldCode >= 0 && available < 4096) {
			prefix[available] = oldCode
			suffix[available] = firstChar
			available += 1
			if ((available & codeMask) === 0 && available < 4096) {
				codeSize += 1
				codeMask = (1 << codeSize) - 1
			}
		}
		oldCode = code

		while (stackPos > 0 && outPos < pixelCount) {
			stackPos -= 1
			out[outPos++] = stack[stackPos]
		}
	}
	return out
}

function interlaceOrder(height) {
	const rows = []
	for (const [start, step] of [
		[0, 8],
		[4, 8],
		[2, 4],
		[1, 2],
	]) {
		for (let y = start; y < height; y += step) rows.push(y)
	}
	return rows
}

/**
 * 完整解码 GIF
 * @param {Uint8Array} input
 * @param {{ onFrame?: (frame: { data: Uint8ClampedArray, width: number, height: number, delay: number, index: number }) => void, frameStride?: number, background?: number[]|null }} options
 *        background 传 [r,g,b,a] 时会把每帧合成到该底色上（便于再编码为不含透明通道的 GIF）
 * @returns {{ width: number, height: number, frameCount: number, loop: number|null }}
 */
export function decodeGif(input, { onFrame, frameStride = 1, background = null } = {}) {
	const data = toBytes(input)
	checkHeader(data)
	const reader = makeReader(data)
	reader.pos = 6
	const width = reader.u16()
	const height = reader.u16()
	const packed = reader.u8()
	reader.u8()
	reader.u8()
	let gct = null
	if (packed & 0x80) gct = readColorTable(reader, 1 << ((packed & 0x07) + 1))

	const canvas = new Uint8ClampedArray(width * height * 4)
	if (background) {
		for (let i = 0; i < canvas.length; i += 4) {
			canvas[i] = background[0]
			canvas[i + 1] = background[1]
			canvas[i + 2] = background[2]
			canvas[i + 3] = background[3] ?? 255
		}
	}

	let gce = { delay: 10, transparentIndex: -1, disposal: 0 }
	let prevDisposal = 0
	let prevRect = null
	let prevSnapshot = null
	let frameIndex = 0
	let loop = null

	while (reader.left() > 0) {
		const marker = reader.u8()
		if (marker === 0x3b) break

		if (marker === 0x21) {
			const label = reader.u8()
			if (label === 0xf9) {
				const size = reader.u8()
				const flags = reader.u8()
				const delay = reader.u16()
				const transparentIndex = reader.u8()
				if (size > 4) reader.skip(size - 4)
				reader.u8()
				gce = {
					delay: delay || 10,
					transparentIndex: flags & 0x01 ? transparentIndex : -1,
					disposal: (flags >> 2) & 0x07,
				}
			} else if (label === 0xff) {
				const size = reader.u8()
				let name = ''
				for (let i = 0; i < size; i += 1) name += String.fromCharCode(reader.u8())
				const payload = reader.subBlocks()
				if (name === 'NETSCAPE2.0' && payload.length >= 3 && payload[0] === 1) {
					loop = payload[1] | (payload[2] << 8)
				}
			} else {
				reader.u8()
				reader.subBlocks()
			}
			continue
		}

		if (marker !== 0x2c) throw new Error('GIF 结构异常，无法解析')

		const left = reader.u16()
		const top = reader.u16()
		const frameW = reader.u16()
		const frameH = reader.u16()
		const ipacked = reader.u8()
		const interlaced = (ipacked & 0x40) !== 0
		let lct = null
		if (ipacked & 0x80) lct = readColorTable(reader, 1 << ((ipacked & 0x07) + 1))
		const table = lct || gct
		if (!table) throw new Error('GIF 缺少调色板')
		const minCodeSize = reader.u8()
		const lzwData = reader.subBlocks()
		const indices = lzwDecode(lzwData, minCodeSize, frameW * frameH)

		// 1) 先应用上一帧的处置方式
		if (prevDisposal === 2 && prevRect) {
			for (let y = prevRect.top; y < prevRect.top + prevRect.height && y < height; y += 1) {
				if (y < 0) continue
				for (let x = prevRect.left; x < prevRect.left + prevRect.width && x < width; x += 1) {
					if (x < 0) continue
					const i = (y * width + x) * 4
					if (background) {
						canvas[i] = background[0]
						canvas[i + 1] = background[1]
						canvas[i + 2] = background[2]
						canvas[i + 3] = background[3] ?? 255
					} else {
						canvas[i] = 0
						canvas[i + 1] = 0
						canvas[i + 2] = 0
						canvas[i + 3] = 0
					}
				}
			}
		} else if (prevDisposal === 3 && prevSnapshot) {
			canvas.set(prevSnapshot)
		}

		// 2) 本帧若为「还原到前一帧」，先存快照
		const snapshot = gce.disposal === 3 ? canvas.slice() : null

		// 3) 绘制本帧
		const rows = interlaced ? interlaceOrder(frameH) : null
		const { table: colors, count } = table
		for (let y = 0; y < frameH; y += 1) {
			const destY = top + (rows ? rows[y] : y)
			if (destY < 0 || destY >= height) continue
			const rowStart = destY * width
			for (let x = 0; x < frameW; x += 1) {
				const index = indices[y * frameW + x]
				if (index === gce.transparentIndex) continue
				const destX = left + x
				if (destX < 0 || destX >= width) continue
				const colorIndex = index < count ? index : 0
				const i = (rowStart + destX) * 4
				canvas[i] = colors[colorIndex * 3]
				canvas[i + 1] = colors[colorIndex * 3 + 1]
				canvas[i + 2] = colors[colorIndex * 3 + 2]
				canvas[i + 3] = 255
			}
		}

		// 4) 回调
		if (onFrame && frameIndex % Math.max(1, frameStride) === 0) {
			onFrame({
				data: canvas.slice(),
				width,
				height,
				delay: gce.delay,
				index: frameIndex,
			})
		}

		prevDisposal = gce.disposal
		prevRect = { left, top, width: frameW, height: frameH }
		prevSnapshot = snapshot
		frameIndex += 1
	}

	return { width, height, frameCount: frameIndex, loop }
}
