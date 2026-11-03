<template>
	<div class="tool idPhoto">
		<h1 class="tool-title">
			证件照换底色
			<span class="tip">自动抠掉背景后换成白 / 红 / 蓝底，按一寸、二寸等规格导出</span>
		</h1>

		<div class="tool-content">
			<Selector
				v-if="!source"
				title="点击选择证件照，或拖拽到此处"
				:multiple="false"
				:filters="[IMAGE_FILTER]"
				@selected="handleFiles"
				@drop="handleFiles"
			/>

			<a-spin v-else :spinning="loading || busy">
				<div class="editor">
					<div class="stage-col">
						<div class="tool-card block">
							<div class="block-head">
								<div class="block-title">编辑区</div>
								<div class="head-ops">
									<span class="hint">保留 {{ stats.keptPercent.toFixed(1) }}% · 抠掉 {{ stats.removedPercent.toFixed(1) }}%</span>
									<a-switch v-model:checked="showOriginal" size="small" checked-children="看原图" un-checked-children="看抠图" />
								</div>
							</div>

							<div class="stage-wrap">
								<div class="stage">
									<canvas
										ref="canvasRef"
										@mousedown="onCanvasDown"
										@mousemove="onCanvasMove"
										@mouseleave="onCanvasLeave"
									></canvas>
									<div v-if="cursor.visible" class="brush-cursor" :style="cursorStyle"></div>
								</div>
							</div>

							<div class="tool-strip">
								<a-radio-group v-model:value="tool" size="small" button-style="solid">
									<a-radio-button value="erase">擦除</a-radio-button>
									<a-radio-button value="restore">恢复</a-radio-button>
									<a-radio-button value="wand">魔棒</a-radio-button>
								</a-radio-group>
								<a-space :size="8" wrap>
									<a-button size="small" type="primary" @click="runAuto">自动抠背景</a-button>
									<a-button size="small" @click="runFeather">边缘羽化</a-button>
									<a-button size="small" :disabled="!undoStack.length" @click="undo">撤销</a-button>
									<a-button size="small" @click="resetMask">重置</a-button>
								</a-space>
							</div>
							<div class="hint">{{ toolHint }}</div>
						</div>

						<div class="tool-card block">
							<div class="block-title">画笔</div>
							<div class="slider-row">
								<span class="name">大小</span>
								<a-slider v-model:value="brushSize" :min="6" :max="240" :step="2" class="slider" />
								<span class="value">{{ brushSize }} px</span>
							</div>
							<div class="slider-row">
								<span class="name">硬度</span>
								<a-slider v-model:value="brushHardness" :min="0.15" :max="1" :step="0.05" class="slider" />
								<span class="value">{{ Math.round(brushHardness * 100) }}%</span>
							</div>
							<div class="slider-row">
								<span class="name">容差</span>
								<a-slider v-model:value="tolerance" :min="0" :max="100" :step="1" class="slider" />
								<span class="value">{{ tolerance }}</span>
							</div>
							<div class="hint">容差只影响「自动抠背景」和「魔棒」，越大被当成背景的颜色范围越宽</div>
						</div>
					</div>

					<div class="panel">
						<div class="tool-card block">
							<div class="block-head">
								<div class="block-title">效果预览</div>
								<span class="hint">{{ targetSize.w }} × {{ targetSize.h }} px · {{ dpi }} dpi</span>
							</div>
							<div class="preview-wrap">
								<canvas ref="previewRef" class="preview"></canvas>
							</div>
							<div class="export-row">
								<a-radio-group v-model:value="outFormat" size="small" button-style="solid">
									<a-radio-button value="jpg">JPG</a-radio-button>
									<a-radio-button value="png">PNG</a-radio-button>
								</a-radio-group>
								<a-button type="primary" :loading="busy" @click="exportPhoto">导出证件照</a-button>
							</div>
						</div>

						<div class="tool-card block">
							<div class="block-title">背景色</div>
							<div class="swatches">
								<button
									v-for="item in BACKDROPS"
									:key="item.key"
									type="button"
									class="swatch"
									:class="{ active: backdropKey === item.key }"
									:title="item.hint"
									@click="backdropKey = item.key"
								>
									<span class="chip" :style="{ background: item.color }"></span>
									<span class="name">{{ item.label }}</span>
								</button>
								<label class="swatch" :class="{ active: backdropKey === 'custom' }">
									<span class="chip custom" :style="{ background: customColor }"></span>
									<span class="name">自定义</span>
									<input v-model="customColor" type="color" class="color-input" @input="backdropKey = 'custom'" />
								</label>
							</div>
							<div class="hint">{{ backdrop.hint }}</div>
						</div>

						<div class="tool-card block">
							<div class="block-title">规格与裁剪</div>
							<a-radio-group v-model:value="specKey" size="small" button-style="solid">
								<a-radio-button v-for="item in SPECS" :key="item.key" :value="item.key">{{ item.label }}</a-radio-button>
							</a-radio-group>

							<div v-if="specKey === 'custom'" class="mm-row">
								<span class="name">宽</span>
								<a-input-number v-model:value="customMm.w" :min="10" :max="120" size="small" addon-after="mm" />
								<span class="name">高</span>
								<a-input-number v-model:value="customMm.h" :min="10" :max="180" size="small" addon-after="mm" />
							</div>

							<div class="slider-row" style="margin-top: 10px">
								<span class="name">输出精度</span>
								<a-radio-group v-model:value="dpi" size="small">
									<a-radio-button :value="300">300</a-radio-button>
									<a-radio-button :value="600">600</a-radio-button>
								</a-radio-group>
								<span class="value">dpi</span>
							</div>
							<div class="slider-row">
								<span class="name">缩放</span>
								<a-slider v-model:value="zoom" :min="100" :max="260" :step="2" class="slider" :disabled="specKey === 'original'" />
								<span class="value">{{ zoom }}%</span>
							</div>
							<div class="slider-row">
								<span class="name">上下位置</span>
								<a-slider v-model:value="offsetY" :min="-100" :max="100" :step="2" class="slider" :disabled="specKey === 'original'" />
								<span class="value">{{ offsetY }}</span>
							</div>
							<div class="hint">
								缩放 100% 表示刚好铺满画幅；「上下位置」往负值调人像上移（头顶留白更多），往正调下移
							</div>
						</div>

						<div class="tool-card block">
							<div class="block-title">说明</div>
							<div class="hint">· 抠图按「与画面四边连通、且接近四角颜色」判定，纯色背景的证件照基本一键就干净</div>
							<div class="hint">· 头发丝、肩膀边缘有残留时，用 5~20px 的小画笔配低硬度擦一擦</div>
							<div class="hint">· 背景杂乱的生活照建议先去「图片智能抠图」处理，再回来换底</div>
							<div class="hint">· 一寸 25×35mm、二寸 35×49mm，300dpi 分别约 295×413、413×579 像素</div>
						</div>
					</div>
				</div>
			</a-spin>
		</div>

		<div v-if="source" class="tool-footer">
			<span class="hint">
				{{ specLabel }} · {{ backdrop.label }} · {{ targetSize.w }} × {{ targetSize.h }} px
				<span v-if="downscaled">（原图已缩到 {{ workW }} × {{ workH }} 便于编辑）</span>
			</span>
			<a-space>
				<a-button @click="resetAll">换一张</a-button>
				<a-button type="primary" :loading="busy" @click="exportPhoto">导出证件照</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import { IMAGE_FILTER, canvasToBlob, createCanvas, decodeImageBytes, sniffMime, stripExt } from '@/utils/image'
import { friendlyError, readSourceBytes, saveBytesAs } from '@/utils/tauriIO'
import {
	autoBackgroundMaskByEdge,
	brushMask,
	compositeWithMask,
	createMask,
	featherMask,
	floodFillMask,
	maskStats,
} from '@/utils/cutout'

/** 工作分辨率上限：像素级编辑太大就会卡 */
const MAX_WORK = 1400
const MAX_UNDO = 15

const BACKDROPS = [
	{ key: 'white', label: '白底', color: '#FFFFFF', hint: '白底最通用：身份证、护照、签证、驾驶证多用白底' },
	{ key: 'red', label: '红底', color: '#FF0000', hint: '红底常见于结婚证、部分职业资格证与港澳通行证' },
	{ key: 'blue', label: '蓝底', color: '#438EDB', hint: '蓝底常见于毕业证、简历、社保卡与各类报名照' },
	{ key: 'deepBlue', label: '深蓝', color: '#1E4F8F', hint: '深蓝多用于职称、执业资格等正式证件' },
	{ key: 'gray', label: '灰底', color: '#E4E4E4', hint: '灰底多用于企业档案、学校内部材料' },
	{ key: 'lightBlue', label: '浅蓝', color: '#C9E2F5', hint: '浅蓝偏柔和，常用于儿童与学生证' },
]

const SPECS = [
	{ key: 'one', label: '一寸', w: 25, h: 35 },
	{ key: 'smallOne', label: '小一寸', w: 22, h: 32 },
	{ key: 'bigOne', label: '大一寸', w: 33, h: 48 },
	{ key: 'two', label: '二寸', w: 35, h: 49 },
	{ key: 'smallTwo', label: '小二寸', w: 35, h: 45 },
	{ key: 'passport', label: '护照', w: 33, h: 48 },
	{ key: 'custom', label: '自定义', w: 25, h: 35 },
	{ key: 'original', label: '原图比例', w: 0, h: 0 },
]

/* ---------------- 素材 ---------------- */

const source = ref(null)
const sourceData = ref(null)
const mask = ref(null)
const workW = ref(0)
const workH = ref(0)
const downscaled = ref(false)
const loading = ref(false)
const busy = ref(false)
const maskVersion = ref(0)
const stats = ref({ keptPercent: 0, removedPercent: 0 })
const undoStack = ref([])
const canvasRef = ref(null)
const previewRef = ref(null)

/* ---------------- 参数 ---------------- */

const tool = ref('erase')
const tolerance = ref(14)
const brushSize = ref(40)
const brushHardness = ref(0.6)
const showOriginal = ref(false)
const cursor = ref({ visible: false, x: 0, y: 0 })

const backdropKey = ref('white')
const customColor = ref('#3B82F6')
const specKey = ref('one')
const customMm = reactive({ w: 25, h: 35 })
const dpi = ref(300)
const zoom = ref(100)
const offsetY = ref(0)
const outFormat = ref('jpg')

/* ---------------- 派生 ---------------- */

const backdrop = computed(
	() => BACKDROPS.find(item => item.key === backdropKey.value) || { key: 'custom', label: '自定义', color: customColor.value, hint: '自定义背景色' },
)

const specLabel = computed(() => (SPECS.find(item => item.key === specKey.value) || SPECS[0]).label)

const targetSize = computed(() => {
	const px = mm => Math.max(1, Math.min(2000, Math.round((mm / 25.4) * dpi.value)))
	if (specKey.value === 'original') return { w: workW.value || 1, h: workH.value || 1 }
	const spec = SPECS.find(item => item.key === specKey.value) || SPECS[0]
	const mmW = specKey.value === 'custom' ? customMm.w : spec.w
	const mmH = specKey.value === 'custom' ? customMm.h : spec.h
	return { w: px(mmW), h: px(mmH) }
})

/** 人物层在画幅里的落点：cover + 缩放 + 垂直偏移 */
const layout = computed(() => {
	const tw = targetSize.value.w
	const th = targetSize.value.h
	const ww = workW.value || 1
	const wh = workH.value || 1
	const base = Math.max(tw / ww, th / wh)
	const scale = base * (zoom.value / 100)
	const dw = ww * scale
	const dh = wh * scale
	return {
		dx: (tw - dw) / 2,
		// dh 一定 >= th，所以 dy 落在 [th-dh, 0] 之间，t=0 居中
		dy: ((th - dh) / 2) * (1 + offsetY.value / 100),
		dw,
		dh,
	}
})

const cursorStyle = computed(() => {
	const canvas = canvasRef.value
	const scale = canvas && canvas.width ? canvas.getBoundingClientRect().width / canvas.width : 1
	const size = Math.max(6, brushSize.value * scale)
	return {
		left: `${cursor.value.x}px`,
		top: `${cursor.value.y}px`,
		width: `${size}px`,
		height: `${size}px`,
	}
})

const toolHint = computed(() => {
	if (tool.value === 'wand') return '点一下要去掉的背景，会连同相邻的相近颜色一起抠掉'
	if (tool.value === 'erase') return '按住拖动，把经过的区域抠掉（变透明，露出下面的底色）'
	return '按住拖动，把误抠的部分刷回来'
})

/* ---------------- 载入 ---------------- */

/** 把一张解码好的图变成可编辑素材（DEV 探针也走这里） */
const setSource = async (img, name) => {
	const dw = img.naturalWidth || img.width
	const dh = img.naturalHeight || img.height
	const scale = Math.min(1, MAX_WORK / Math.max(dw, dh))
	const w = Math.max(1, Math.round(dw * scale))
	const h = Math.max(1, Math.round(dh * scale))
	downscaled.value = scale < 1

	const work = createCanvas(w, h)
	const ctx = work.getContext('2d', { willReadFrequently: true })
	ctx.imageSmoothingQuality = 'high'
	ctx.drawImage(img, 0, 0, w, h)

	source.value = { name, width: dw, height: dh }
	workW.value = w
	workH.value = h
	sourceData.value = ctx.getImageData(0, 0, w, h)
	mask.value = createMask(w * h, 255)
	maskVersion.value += 1
	undoStack.value = []
	peopleVersion = -1
	zoom.value = 100
	offsetY.value = 0
	// 画布在 v-else 分支里，要等 DOM 更新完才能画
	await nextTick()
	renderEditor()
	// 证件照多是纯色背景，进页面就先自动抠一次，省得还要点一下
	runAuto(true)
}

const handleFiles = async sources => {
	const list = (Array.isArray(sources) ? sources : [sources]).filter(Boolean).slice(0, 1)
	if (!list.length) return
	loading.value = true
	try {
		const bytes = await readSourceBytes(list[0])
		const name = typeof list[0] === 'string' ? list[0].split(/[\\/]/).pop() : list[0].name
		const mime = sniffMime(bytes)
		const decoded = await decodeImageBytes(bytes, mime)
		await setSource(decoded.img, name)
		URL.revokeObjectURL(decoded.url)
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		loading.value = false
	}
}

/* ---------------- 渲染 ---------------- */

let rafId = 0
let previewTimer = 0
let peopleVersion = -1
const peopleCanvas = document.createElement('canvas')

const renderEditor = () => {
	const canvas = canvasRef.value
	const data = sourceData.value
	const currentMask = mask.value
	if (!canvas || !data || !currentMask) return
	if (canvas.width !== data.width || canvas.height !== data.height) {
		canvas.width = data.width
		canvas.height = data.height
	}
	const ctx = canvas.getContext('2d')
	ctx.clearRect(0, 0, data.width, data.height)
	if (showOriginal.value) {
		ctx.putImageData(data, 0, 0)
	} else {
		const composed = compositeWithMask(data.data, currentMask)
		ctx.putImageData(new ImageData(composed, data.width, data.height), 0, 0)
	}
	stats.value = maskStats(currentMask)
}

const renderPreview = () => {
	const canvas = previewRef.value
	const data = sourceData.value
	const currentMask = mask.value
	if (!canvas || !data || !currentMask) return
	const { w: tw, h: th } = targetSize.value
	if (canvas.width !== tw || canvas.height !== th) {
		canvas.width = tw
		canvas.height = th
	}
	const ctx = canvas.getContext('2d')
	ctx.fillStyle = backdrop.value.color
	ctx.fillRect(0, 0, tw, th)

	// 人物层只在蒙版变化时重算，缩放 / 偏移直接复用
	if (peopleVersion !== maskVersion.value || peopleCanvas.width !== data.width || peopleCanvas.height !== data.height) {
		peopleCanvas.width = data.width
		peopleCanvas.height = data.height
		const composed = compositeWithMask(data.data, currentMask)
		peopleCanvas.getContext('2d').putImageData(new ImageData(composed, data.width, data.height), 0, 0)
		peopleVersion = maskVersion.value
	}

	const { dx, dy, dw, dh } = layout.value
	ctx.imageSmoothingQuality = 'high'
	ctx.drawImage(peopleCanvas, dx, dy, dw, dh)
}

const scheduleRender = () => {
	if (rafId) return
	rafId = requestAnimationFrame(() => {
		rafId = 0
		renderEditor()
	})
}

const schedulePreview = () => {
	if (previewTimer) return
	previewTimer = window.setTimeout(() => {
		previewTimer = 0
		renderPreview()
	}, 70)
}

/** 蒙版一改，两处渲染都要跟着更新 */
const touchMask = () => {
	maskVersion.value += 1
	scheduleRender()
	schedulePreview()
}

watch(showOriginal, () => scheduleRender())
watch(
	() => [targetSize.value.w, targetSize.value.h, zoom.value, offsetY.value, backdrop.value.color, specKey.value],
	() => schedulePreview(),
)

/* ---------------- 交互 ---------------- */

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

const applyBrush = point => {
	const data = sourceData.value
	if (!data) return
	brushMask(mask.value, data.width, data.height, {
		x: point.x,
		y: point.y,
		radius: brushSize.value / 2,
		value: tool.value === 'restore' ? 255 : 0,
		hardness: brushHardness.value,
	})
	touchMask()
}

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
		touchMask()
		if (!changed) message.info('这一点附近没有可抠的相近颜色，试试调大容差')
		return
	}
	pushUndo()
	painting.value = true
	applyBrush(point)
}

const onCanvasMove = event => {
	const point = toImagePoint(event)
	cursor.value = { visible: true, x: point.displayX, y: point.displayY }
	if (!painting.value) return
	applyBrush(point)
}

const onCanvasLeave = () => {
	cursor.value = { ...cursor.value, visible: false }
}

const stopPainting = () => {
	painting.value = false
}

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
	touchMask()
}

/* ---------------- 工具动作 ---------------- */

const runAuto = (silent = false) => {
	const data = sourceData.value
	if (!data) return
	pushUndo()
	const removed = autoBackgroundMaskByEdge(data.data, mask.value, data.width, data.height, {
		tolerance: tolerance.value,
	})
	if (removed > 0) featherMask(mask.value, data.width, data.height, 1)
	touchMask()
	if (!silent) {
		message.success(removed > 0 ? `已抠掉 ${removed.toLocaleString()} 个像素` : '四边没有找到可用的背景色，可调大容差或直接手动画')
	}
}

const runFeather = () => {
	if (!mask.value) return
	pushUndo()
	featherMask(mask.value, workW.value, workH.value, 1)
	touchMask()
	message.success('已对边缘做一次羽化，锯齿会柔和一些')
}

const resetMask = () => {
	if (!mask.value) return
	pushUndo()
	mask.value = createMask(mask.value.length, 255)
	touchMask()
}

const resetAll = () => {
	source.value = null
	sourceData.value = null
	mask.value = null
	workW.value = 0
	workH.value = 0
	undoStack.value = []
	peopleVersion = -1
}

/* ---------------- 导出 ---------------- */

/** 按当前参数画一张最终成品（导出与预览校验共用） */
const renderExportCanvas = () => {
	const canvas = createCanvas(targetSize.value.w, targetSize.value.h)
	const ctx = canvas.getContext('2d')
	ctx.fillStyle = backdrop.value.color
	ctx.fillRect(0, 0, canvas.width, canvas.height)
	const composed = compositeWithMask(sourceData.value.data, mask.value)
	const layer = createCanvas(workW.value, workH.value)
	layer.getContext('2d').putImageData(new ImageData(composed, workW.value, workH.value), 0, 0)
	const { dx, dy, dw, dh } = layout.value
	ctx.imageSmoothingQuality = 'high'
	ctx.drawImage(layer, dx, dy, dw, dh)
	return canvas
}

const exportPhoto = async () => {
	if (!sourceData.value) return
	busy.value = true
	try {
		const canvas = renderExportCanvas()

		const mime = outFormat.value === 'png' ? 'image/png' : 'image/jpeg'
		const blob = await canvasToBlob(canvas, mime, 0.96)
		const bytes = new Uint8Array(await blob.arrayBuffer())
		const ext = outFormat.value === 'png' ? 'png' : 'jpg'
		const colorName = backdrop.value.label.replace('底', '')
		const path = await saveBytesAs(bytes, {
			defaultPath: `${stripExt(source.value.name)}_${specLabel.value}_${colorName}底.${ext}`,
			filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		busy.value = false
	}
}

/* ---------------- 生命周期 ---------------- */

if (import.meta.env.DEV) {
	window.__idPhotoTest = {
		loadFromDataUrl: async dataUrl => {
			const img = new Image()
			img.src = dataUrl
			await img.decode()
			await setSource(img, 'test.png')
			return { work: { w: workW.value, h: workH.value }, stats: stats.value }
		},
		state: () => ({
			work: { w: workW.value, h: workH.value },
			target: targetSize.value,
			spec: specKey.value,
			backdrop: { key: backdropKey.value, color: backdrop.value.color },
			zoom: zoom.value,
			offset: offsetY.value,
			mask: stats.value,
			layout: layout.value,
			undo: undoStack.value.length,
		}),
		setBackdrop: key => {
			backdropKey.value = key
		},
		setSpec: key => {
			specKey.value = key
		},
		setCustomMm: patch => {
			Object.assign(customMm, patch)
		},
		setZoom: value => {
			zoom.value = value
		},
		setOffset: value => {
			offsetY.value = value
		},
		setDpi: value => {
			dpi.value = value
		},
		setTolerance: value => {
			tolerance.value = value
		},
		runAuto,
		runFeather,
		resetMask,
		undo,
		/** 直接往蒙版上刷一笔，验证画笔擦除 / 恢复 */
		paint: (x, y, radius, value) => {
			brushMask(mask.value, workW.value, workH.value, { x, y, radius, value, hardness: 1 })
			touchMask()
		},
		/** 读预览画布某个点的颜色，确认底色和人物都合成对了 */
		samplePreview: (x, y) => {
			const canvas = previewRef.value
			if (!canvas) return null
			const px = canvas.getContext('2d').getImageData(x, y, 1, 1).data
			return [px[0], px[1], px[2], px[3]]
		},
		/** 走一遍导出管线但不落盘，返回成品尺寸与 PNG 体积 */
		exportInfo: async () => {
			const canvas = renderExportCanvas()
			const blob = await canvasToBlob(canvas, 'image/png')
			return { width: canvas.width, height: canvas.height, bytes: blob.size }
		},
	}
}

onUnmounted(() => {
	if (rafId) cancelAnimationFrame(rafId)
	if (previewTimer) clearTimeout(previewTimer)
	window.removeEventListener('mouseup', stopPainting)
})

// 拖到画布外松手也要结束笔画
window.addEventListener('mouseup', stopPainting)
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.idPhoto {
	--photo-checker-a: #eef1f5;
	--photo-checker-b: #ffffff;

	.editor {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.stage-col {
		flex: 1.3;
		min-width: 360px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.panel {
		flex: 1;
		min-width: 320px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.block {
		display: flex;
		flex-flow: column;
		gap: 6px;
	}
	.block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}
	.block-title {
		font-weight: 600;
		color: var(--text-color);
		margin-bottom: 4px;
		font-size: 13px;
	}
	.head-ops {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.stage-wrap {
		display: flex;
		justify-content: center;
		padding: 8px 0;
	}
	.stage {
		position: relative;
		display: inline-block;
		max-width: 100%;
		border-radius: 8px;
		overflow: hidden;
		/* 棋盘格：抠掉的区域一眼能看出来 */
		background-image: repeating-conic-gradient(var(--photo-checker-a) 0% 25%, var(--photo-checker-b) 0% 50%);
		background-size: 16px 16px;
		box-shadow: 0 0 0 1px var(--border-color);
		canvas {
			display: block;
			max-width: 100%;
			max-height: 56vh;
			width: auto;
			height: auto;
			cursor: crosshair;
		}
	}
	.brush-cursor {
		position: absolute;
		border: 1px solid rgba(22, 119, 255, 0.95);
		border-radius: 50%;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.85);
		transform: translate(-50%, -50%);
		pointer-events: none;
	}
	.tool-strip {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.preview-wrap {
		display: flex;
		justify-content: center;
		padding: 12px;
		border-radius: 8px;
		background: rgba(127, 127, 127, 0.1);
	}
	.preview {
		max-height: 260px;
		max-width: 100%;
		border-radius: 3px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
	}
	.export-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-top: 6px;
		flex-wrap: wrap;
	}
	.swatches {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.swatch {
		position: relative;
		display: flex;
		flex-flow: column;
		align-items: center;
		gap: 3px;
		padding: 5px 6px;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		background: transparent;
		cursor: pointer;
		transition: all 0.15s;
		.chip {
			width: 34px;
			height: 26px;
			border-radius: 4px;
			box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
		}
		.name {
			font-size: 11px;
			color: var(--text-color-2);
			line-height: 1;
		}
		&:hover {
			border-color: #1677ff;
		}
		&.active {
			border-color: #1677ff;
			background: rgba(22, 119, 255, 0.1);
			.name {
				color: #1677ff;
			}
		}
	}
	.color-input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		width: 100%;
		height: 100%;
		border: none;
		padding: 0;
	}
	.mm-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		.name {
			font-size: 12px;
			color: var(--text-color-2);
		}
	}
	.slider-row {
		display: flex;
		align-items: center;
		gap: 10px;
		.name {
			font-size: 12px;
			color: var(--text-color-2);
			white-space: nowrap;
			min-width: 52px;
		}
		.slider {
			flex: 1;
			min-width: 90px;
		}
		.value {
			font-size: 12px;
			color: var(--text-color);
			font-variant-numeric: tabular-nums;
			min-width: 52px;
			text-align: right;
		}
	}
	.hint {
		line-height: 1.7;
	}
}

html[data-theme='dark'] .idPhoto {
	--photo-checker-a: #333a45;
	--photo-checker-b: #2a3038;
}
</style>
