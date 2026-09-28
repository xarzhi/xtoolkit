/**
 * 抠图相关的纯函数（作用于 RGBA 像素与 alpha 蒙版，便于在 Node 中测试）
 *
 * 设计：原图（sourceData）始终保持不变，所有编辑只改 mask（Uint8Array，每个像素 0~255 的保留度）
 * 因此撤销只需保存 mask 快照，代价很小。
 */

export function createMask(size, value = 255) {
	const mask = new Uint8Array(size)
	if (value) mask.fill(value)
	return mask
}

/** 容差滑块（0~100）换算为 RGB 欧氏距离阈值 */
export function toleranceToThreshold(tolerance) {
	return Math.max(0, Math.min(100, tolerance)) * 4.42
}

export function colorDistance(r1, g1, b1, r2, g2, b2) {
	const dr = r1 - r2
	const dg = g1 - g2
	const db = b1 - b2
	return Math.sqrt(dr * dr + dg * dg + db * db)
}

function averageBlock(sourceData, width, height, cx, cy, block = 5) {
	const half = Math.floor(block / 2)
	let r = 0
	let g = 0
	let b = 0
	let count = 0
	for (let y = Math.max(0, cy - half); y <= Math.min(height - 1, cy + half); y += 1) {
		for (let x = Math.max(0, cx - half); x <= Math.min(width - 1, cx + half); x += 1) {
			const i = (y * width + x) * 4
			r += sourceData[i]
			g += sourceData[i + 1]
			b += sourceData[i + 2]
			count += 1
		}
	}
	if (!count) return [0, 0, 0]
	return [r / count, g / count, b / count]
}

/** 取四角颜色作为背景色样本 */
export function sampleCornerColors(sourceData, width, height, block = 5) {
	return [
		averageBlock(sourceData, width, height, 0, 0, block),
		averageBlock(sourceData, width, height, width - 1, 0, block),
		averageBlock(sourceData, width, height, 0, height - 1, block),
		averageBlock(sourceData, width, height, width - 1, height - 1, block),
	]
}

/** 自动去背景：与四角背景色接近的像素被扣掉 */
export function autoBackgroundMask(sourceData, mask, width, height, { tolerance = 12, block = 5 } = {}) {
	const threshold = toleranceToThreshold(tolerance)
	const corners = sampleCornerColors(sourceData, width, height, block)
	let removed = 0
	for (let p = 0; p < width * height; p += 1) {
		const i = p * 4
		const r = sourceData[i]
		const g = sourceData[i + 1]
		const b = sourceData[i + 2]
		let isBackground = false
		for (const corner of corners) {
			if (colorDistance(r, g, b, corner[0], corner[1], corner[2]) <= threshold) {
				isBackground = true
				break
			}
		}
		if (isBackground && mask[p] !== 0) {
			mask[p] = 0
			removed += 1
		}
	}
	return removed
}

/** 魔棒：从点击处做连通区域填充（颜色接近种子点的一整片） */
export function floodFillMask(sourceData, mask, width, height, { x, y, tolerance = 12, value = 0 } = {}) {
	const sx = Math.round(x)
	const sy = Math.round(y)
	if (sx < 0 || sy < 0 || sx >= width || sy >= height) return 0
	const threshold = toleranceToThreshold(tolerance)
	const seed = (sy * width + sx) * 4
	const sr = sourceData[seed]
	const sg = sourceData[seed + 1]
	const sb = sourceData[seed + 2]

	const visited = new Uint8Array(width * height)
	const stack = new Int32Array(width * height)
	let top = 0
	let changed = 0

	// 入栈时就标记已访问：每个像素最多入栈一次，栈容量取像素总数即可
	const push = p => {
		if (visited[p]) return
		visited[p] = 1
		stack[top++] = p
	}

	push(sy * width + sx)
	while (top > 0) {
		const p = stack[--top]
		const i = p * 4
		if (colorDistance(sourceData[i], sourceData[i + 1], sourceData[i + 2], sr, sg, sb) > threshold) continue
		if (mask[p] !== value) {
			mask[p] = value
			changed += 1
		}
		const px = p % width
		const py = (p - px) / width
		if (px > 0) push(p - 1)
		if (px < width - 1) push(p + 1)
		if (py > 0) push(p - width)
		if (py < height - 1) push(p + width)
	}
	return changed
}

/** 圆形画笔：value=0 擦除，255 恢复；hardness 越大边缘越硬 */
export function brushMask(mask, width, height, { x, y, radius = 20, value = 0, hardness = 0.5 } = {}) {
	const cx = Math.round(x)
	const cy = Math.round(y)
	const r = Math.max(1, radius)
	const soft = r * Math.max(0.01, 1 - Math.max(0, Math.min(1, hardness)))
	const minX = Math.max(0, Math.floor(cx - r))
	const maxX = Math.min(width - 1, Math.ceil(cx + r))
	const minY = Math.max(0, Math.floor(cy - r))
	const maxY = Math.min(height - 1, Math.ceil(cy + r))
	let changed = 0

	for (let py = minY; py <= maxY; py += 1) {
		for (let px = minX; px <= maxX; px += 1) {
			const dx = px - cx
			const dy = py - cy
			const dist = Math.sqrt(dx * dx + dy * dy)
			if (dist > r) continue
			const falloff = dist <= r - soft ? 1 : Math.max(0, (r - dist) / soft)
			const p = py * width + px
			const next = mask[p] + (value - mask[p]) * falloff
			const rounded = Math.round(next)
			if (rounded !== mask[p]) {
				mask[p] = rounded
				changed += 1
			}
		}
	}
	return changed
}

/** 羽化：对蒙版做多次 3x3 均值模糊，让边缘过渡自然 */
export function featherMask(mask, width, height, passes = 1) {
	let src = mask
	let dst = new Uint8Array(mask.length)
	for (let pass = 0; pass < Math.max(1, passes); pass += 1) {
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				let sum = 0
				let count = 0
				for (let dy = -1; dy <= 1; dy += 1) {
					const ny = y + dy
					if (ny < 0 || ny >= height) continue
					for (let dx = -1; dx <= 1; dx += 1) {
						const nx = x + dx
						if (nx < 0 || nx >= width) continue
						sum += src[ny * width + nx]
						count += 1
					}
				}
				dst[y * width + x] = sum / count
			}
		}
		const swap = src
		src = dst
		dst = swap
	}
	if (src !== mask) mask.set(src)
	return mask
}

/** 用蒙版合成出带透明度的 RGBA */
export function compositeWithMask(sourceData, mask) {
	const out = new Uint8ClampedArray(sourceData.length)
	for (let p = 0; p < mask.length; p += 1) {
		const i = p * 4
		out[i] = sourceData[i]
		out[i + 1] = sourceData[i + 1]
		out[i + 2] = sourceData[i + 2]
		out[i + 3] = (sourceData[i + 3] * mask[p]) / 255
	}
	return out
}

/** 统计保留 / 扣掉的比例 */
export function maskStats(mask) {
	let kept = 0
	let removed = 0
	let partial = 0
	for (let i = 0; i < mask.length; i += 1) {
		if (mask[i] >= 250) kept += 1
		else if (mask[i] === 0) removed += 1
		else partial += 1
	}
	const total = mask.length || 1
	return {
		kept,
		removed,
		partial,
		keptPercent: (kept / total) * 100,
		removedPercent: (removed / total) * 100,
	}
}

/** 反选 */
export function invertMask(mask) {
	for (let i = 0; i < mask.length; i += 1) mask[i] = 255 - mask[i]
	return mask
}
