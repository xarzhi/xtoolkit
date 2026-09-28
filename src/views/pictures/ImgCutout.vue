<template>
	<div class="tool imgCutout">
		<h1 class="tool-title">
			图片智能抠图
			<span class="tip">自动去背景 / 魔棒点选 / 画笔擦除与恢复，输出带透明通道的 PNG</span>
		</h1>

		<div class="tool-content">
			<Selector
				v-if="!source"
				title="点击选择图片，或拖拽到此处"
				:multiple="false"
				:filters="[IMAGE_FILTER]"
				@selected="handleFiles"
				@drop="handleFiles"
			/>

			<a-spin v-else :spinning="loading">
				<div class="editor">
					<div class="stage-wrap">
						<div class="stage" :style="stageStyle">
							<canvas
								ref="canvasRef"
								class="work"
								@mousedown="onCanvasDown"
								@mousemove="onCanvasMove"
								@mouseleave="onCanvasLeave"
							></canvas>
							<div v-if="cursor.visible" class="brush-cursor" :style="cursorStyle"></div>
						</div>
						<div class="hint">
							工作尺寸 {{ workWidth }} × {{ workHeight }}（原图 {{ source.width }} × {{ source.height }}
							<span v-if="downscaled">，已按 1400px 上限缩放以便编辑</span>） · 保留 {{ stats.keptPercent.toFixed(1) }}% ·
							抠掉 {{ stats.removedPercent.toFixed(1) }}%
						</div>
					</div>

					<div class="panel">
						<div class="tool-card block">
							<div class="block-title">工具</div>
							<a-radio-group v-model:value="tool" size="small" button-style="solid">
								<a-radio-button value="wand">魔棒点选</a-radio-button>
								<a-radio-button value="erase">擦除</a-radio-button>
								<a-radio-button value="restore">恢复</a-radio-button>
							</a-radio-group>
							<div class="hint" style="margin-top: 8px">
								{{ toolHint }}
							</div>
							<a-space :size="8" wrap style="margin-top: 10px">
								<a-button size="small" type="primary" @click="runAuto">自动去背景</a-button>
								<a-button size="small" @click="runFeather">羽化边缘</a-button>
								<a-button size="small" @click="runInvert">反选</a-button>
								<a-button size="small" :disabled="!undoStack.length" @click="undo">撤销</a-button>
								<a-button size="small" @click="resetMask">重置</a-button>
							</a-space>
						</div>

						<div class="tool-card block">
							<div class="block-title">参数</div>
							<div class="slider-row">
								<span class="name">容差</span>
								<a-slider v-model:value="tolerance" :min="0" :max="100" :step="1" class="slider" />
								<a-input-number v-model:value="tolerance" :min="0" :max="100" size="small" class="value" />
							</div>
							<div class="slider-row">
								<span class="name">画笔大小</span>
								<a-slider v-model:value="brushSize" :min="5" :max="200" :step="1" class="slider" />
								<a-input-number v-model:value="brushSize" :min="5" :max="200" size="small" class="value" />
							</div>
							<div class="slider-row">
								<span class="name">画笔硬度</span>
								<a-slider v-model:value="brushHardness" :min="0.1" :max="1" :step="0.05" class="slider" />
								<a-input-number v-model:value="brushHardness" :min="0.1" :max="1" :step="0.05" size="small" class="value" />
							</div>
							<div class="hint">魔棒与自动去背景共用「容差」；容差越大，被当作背景的颜色范围越宽</div>
						</div>

						<div class="tool-card block">
							<div class="block-title">导出</div>
							<a-radio-group v-model:value="outMode" size="small">
								<a-radio-button value="alpha">PNG · 透明背景</a-radio-button>
								<a-radio-button value="white">JPG · 白色背景</a-radio-button>
								<a-radio-button value="black">JPG · 黑色背景</a-radio-button>
							</a-radio-group>
							<div class="hint" style="margin-top: 8px">
								导出尺寸为工作尺寸；需要更大尺寸请先缩小后再处理
							</div>
						</div>
					</div>
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<span class="hint">擦除/恢复支持按住拖拽涂抹，操作可逐步撤销</span>
			<a-space>
				<a-button v-if="source" :disabled="busy" @click="reset">重新选择</a-button>
				<a-button type="primary" :disabled="!source" :loading="busy" @click="exportImage">导出图片</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import {
	IMAGE_FILTER,
	canvasToBytes,
	createCanvas,
	decodeImageBytes,
	sniffMime,
	stripExt,
} from '@/utils/image'
import {
	autoBackgroundMask,
	brushMask,
	compositeWithMask,
	createMask,
	featherMask,
	floodFillMask,
	invertMask,
	maskStats,
} from '@/utils/cutout'
import { friendlyError, readSourceBytes, saveBytesAs } from '@/utils/tauriIO'

/** 工作分辨率上限：太大的图直接按原尺寸做像素级编辑会卡顿 */
const MAX_WORK = 1400
const MAX_UNDO = 15

const source = ref(null)
const loading = ref(false)
const busy = ref(false)
const canvasRef = ref(null)
const workWidth = ref(0)
const workHeight = ref(0)
const downscaled = ref(false)
const sourceData = shallowRef(null)
const mask = shallowRef(null)
const undoStack = ref([])
const stats = ref({ keptPercent: 100, removedPercent: 0 })

const tool = ref('wand')
const tolerance = ref(12)
const brushSize = ref(40)
const brushHardness = ref(0.5)
const outMode = ref('alpha')
const cursor = ref({ visible: false, x: 0, y: 0 })

const stageStyle = computed(() => ({
	width: `${workWidth.value}px`,
	height: `${workHeight.value}px`,
	maxWidth: '100%',
}))
const cursorStyle = computed(() => ({
	left: `${cursor.value.x}px`,
	top: `${cursor.value.y}px`,
	width: `${brushSize.value}px`,
	height: `${brushSize.value}px`,
}))
const toolHint = computed(() => {
	if (tool.value === 'wand') return '点击要去掉的背景区域，会连同相邻的相近颜色一起抠掉'
	if (tool.value === 'erase') return '按住鼠标拖动，把经过的区域抠掉（透明）'
	return '按住鼠标拖动，把误删的区域刷回来'
})

/* ---------------- 载入 ---------------- */

const handleFiles = async sources => {
	const list = (Array.isArray(sources) ? sources : [sources]).filter(Boolean).slice(0, 1)
	if (!list.length) return
	loading.value = true
	try {
		const bytes = await readSourceBytes(list[0])
		const name = typeof list[0] === 'string' ? list[0].split(/[\\/]/).pop() : list[0].name
		const mime = sniffMime(bytes)
		const decoded = await decodeImageBytes(bytes, mime)
		const scale = Math.min(1, MAX_WORK / Math.max(decoded.width, decoded.height))
		const w = Math.max(1, Math.round(decoded.width * scale))
		const h = Math.max(1, Math.round(decoded.height * scale))
		downscaled.value = scale < 1

		const work = createCanvas(w, h)
		const ctx = work.getContext('2d', { willReadFrequently: true })
		ctx.imageSmoothingQuality = 'high'
		ctx.drawImage(decoded.img, 0, 0, w, h)
		URL.revokeObjectURL(decoded.url)

		if (source.value?.url) URL.revokeObjectURL(source.value.url)
		source.value = { name, mime, url: decoded.url, width: decoded.width, height: decoded.height }
		workWidth.value = w
		workHeight.value = h
		sourceData.value = ctx.getImageData(0, 0, w, h)
		mask.value = createMask(w * h, 255)
		undoStack.value = []
		// 画布在 v-else 分支里，要等 DOM 更新完才能拿到 ref，否则画不上去
		await nextTick()
		render()
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		loading.value = false
	}
}

/* ---------------- 渲染 ---------------- */

let rafId = 0
const render = () => {
	const canvas = canvasRef.value
	const data = sourceData.value
	const currentMask = mask.value
	if (!canvas || !data || !currentMask) return
	canvas.width = data.width
	canvas.height = data.height
	const composed = compositeWithMask(data.data, currentMask)
	canvas.getContext('2d').putImageData(new ImageData(composed, data.width, data.height), 0, 0)
	stats.value = maskStats(currentMask)
}

const scheduleRender = () => {
	if (rafId) return
	rafId = requestAnimationFrame(() => {
		rafId = 0
		render()
	})
}

// 兜底：素材变化（含首次挂载出画布）后必定再画一次
watch(source, () => scheduleRender())

onUnmounted(() => {
	if (rafId) cancelAnimationFrame(rafId)
	window.removeEventListener('mouseup', stopPainting)
	if (source.value?.url) URL.revokeObjectURL(source.value.url)
})

/* ---------------- 撤销 ---------------- */

const pushUndo = () => {
	if (!mask.value) return
	undoStack.value.push(mask.value.slice())
	if (undoStack.value.length > MAX_UNDO) undoStack.value.shift()
}

const undo = () => {
	const previous = undoStack.value.pop()
	if (!previous) return
	mask.value = previous
	scheduleRender()
}

/* ---------------- 工具动作 ---------------- */

const runAuto = () => {
	const data = sourceData.value
	if (!data) return
	pushUndo()
	const removed = autoBackgroundMask(data.data, mask.value, data.width, data.height, { tolerance: tolerance.value })
	if (removed > 0) featherMask(mask.value, data.width, data.height, 1)
	scheduleRender()
	message.success(removed > 0 ? `已抠掉 ${removed.toLocaleString()} 个像素` : '没有找到与四角相近的背景色，可调大容差')
}

const runFeather = () => {
	const data = sourceData.value
	if (!data) return
	pushUndo()
	featherMask(mask.value, data.width, data.height, 1)
	scheduleRender()
	message.success('已对边缘做羽化处理')
}

const runInvert = () => {
	if (!mask.value) return
	pushUndo()
	invertMask(mask.value)
	scheduleRender()
}

const resetMask = () => {
	if (!mask.value) return
	pushUndo()
	mask.value = createMask(mask.value.length, 255)
	scheduleRender()
}

/* ---------------- 画布交互 ---------------- */

const toImagePoint = event => {
	const canvas = canvasRef.value
	const rect = canvas.getBoundingClientRect()
	const scaleX = canvas.width / rect.width
	const scaleY = canvas.height / rect.height
	return {
		x: (event.clientX - rect.left) * scaleX,
		y: (event.clientY - rect.top) * scaleY,
		displayX: event.clientX - rect.left,
		displayY: event.clientY - rect.top,
	}
}

const painting = ref(false)
let lastPoint = null

const onCanvasDown = event => {
	const data = sourceData.value
	if (!data || event.button !== 0) return
	const point = toImagePoint(event)
	if (tool.value === 'wand') {
		pushUndo()
		const changed = floodFillMask(data.data, mask.value, data.width, data.height, {
			x: point.x,
			y: point.y,
			tolerance: tolerance.value,
			value: 0,
		})
		if (changed > 0) featherMask(mask.value, data.width, data.height, 1)
		scheduleRender()
		return
	}
	pushUndo()
	painting.value = true
	lastPoint = point
	applyBrush(point)
}

const onCanvasMove = event => {
	const point = toImagePoint(event)
	cursor.value = { visible: true, x: point.displayX, y: point.displayY }
	if (!painting.value) return
	// 沿着上一个点到当前点插值，避免快速拖动出现断点
	if (lastPoint) {
		const dx = point.x - lastPoint.x
		const dy = point.y - lastPoint.y
		const distance = Math.sqrt(dx * dx + dy * dy)
		const step = Math.max(1, brushSize.value / 4)
		const times = Math.min(200, Math.ceil(distance / step))
		for (let i = 1; i <= times; i += 1) {
			applyBrush({ x: lastPoint.x + (dx * i) / times, y: lastPoint.y + (dy * i) / times })
		}
	} else {
		applyBrush(point)
	}
	lastPoint = point
	scheduleRender()
}

const onCanvasLeave = () => {
	cursor.value.visible = false
}

const applyBrush = point => {
	const data = sourceData.value
	if (!data) return
	brushMask(mask.value, data.width, data.height, {
		x: point.x,
		y: point.y,
		radius: brushSize.value / 2,
		value: tool.value === 'erase' ? 0 : 255,
		hardness: brushHardness.value,
	})
}

const stopPainting = () => {
	painting.value = false
	lastPoint = null
}
watch(painting, value => {
	if (value) window.addEventListener('mouseup', stopPainting)
	else window.removeEventListener('mouseup', stopPainting)
})

/* ---------------- 导出 ---------------- */

const exportImage = async () => {
	const data = sourceData.value
	if (!data) return
	busy.value = true
	try {
		const composed = compositeWithMask(data.data, mask.value)
		const layer = createCanvas(data.width, data.height)
		layer.getContext('2d').putImageData(new ImageData(composed, data.width, data.height), 0, 0)

		const out = createCanvas(data.width, data.height)
		const ctx = out.getContext('2d')
		const format = outMode.value === 'alpha' ? 'png' : 'jpg'
		if (outMode.value !== 'alpha') {
			ctx.fillStyle = outMode.value === 'white' ? '#ffffff' : '#000000'
			ctx.fillRect(0, 0, out.width, out.height)
		}
		ctx.drawImage(layer, 0, 0)

		const bytes = await canvasToBytes(out, format)
		const ext = format === 'png' ? 'png' : 'jpg'
		const path = await saveBytesAs(bytes, {
			defaultPath: `${stripExt(source.value.name)}_cutout.${ext}`,
			filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		busy.value = false
	}
}

const reset = () => {
	if (source.value?.url) URL.revokeObjectURL(source.value.url)
	source.value = null
	sourceData.value = null
	mask.value = null
	undoStack.value = []
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.imgCutout {
	.editor {
		display: flex;
		gap: 20px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.stage-wrap {
		flex: 1;
		min-width: 320px;
	}
	.stage {
		position: relative;
		border-radius: 8px;
		overflow: hidden;
		line-height: 0;
		background:
			linear-gradient(45deg, #ececec 25%, transparent 25%, transparent 75%, #ececec 75%) 0 0 / 16px 16px,
			linear-gradient(45deg, #ececec 25%, transparent 25%, transparent 75%, #ececec 75%) 8px 8px / 16px 16px,
			#fff;
		.work {
			width: 100%;
			height: 100%;
			cursor: crosshair;
			touch-action: none;
		}
		.brush-cursor {
			position: absolute;
			border: 1px solid rgba(22, 119, 255, 0.9);
			border-radius: 50%;
			transform: translate(-50%, -50%);
			pointer-events: none;
			box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6) inset;
		}
	}
	.panel {
		width: 400px;
		max-width: 100%;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.block-title {
		font-weight: 600;
		color: var(--text-color);
		margin-bottom: 10px;
	}
	.slider-row {
		display: flex;
		align-items: center;
		gap: 10px;
		.name {
			width: 62px;
			font-size: 13px;
			color: var(--text-color-3);
			white-space: nowrap;
		}
		.slider {
			flex: 1;
			min-width: 100px;
			margin: 0 4px;
		}
		.value {
			width: 76px;
		}
	}
}
</style>
