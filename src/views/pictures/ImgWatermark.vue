<template>
	<div class="tool imgWatermark">
		<h1 class="tool-title">
			图片加水印
			<span class="tip">自定义文字内容、字号、颜色与旋转角度，支持随机颜色与满屏平铺</span>
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
					<div class="stage">
						<canvas ref="canvasRef"></canvas>
						<div class="hint stage-tip">
							预览按最长边 {{ MAX_PREVIEW }}px 缩放，导出时按原图 {{ source.width }} × {{ source.height }} 重新绘制
						</div>
					</div>

					<div class="panel">
						<div class="tool-card block">
							<div class="block-title">水印内容</div>
							<a-textarea
								v-model:value="form.text"
								:rows="2"
								placeholder="输入水印文字，回车可换行"
								allow-clear
							/>
							<div class="row wrap" style="margin-top: 8px">
								<a-button size="small" @click="insertToken('date')">插入日期</a-button>
								<a-button size="small" @click="insertToken('name')">插入文件名</a-button>
								<a-button size="small" @click="form.text = DEFAULT_TEXT">恢复默认</a-button>
							</div>
						</div>

						<div class="tool-card block">
							<div class="block-title">文字样式</div>
							<div class="row">
								<span class="label">字号</span>
								<a-slider v-model:value="form.size" :min="1.5" :max="24" :step="0.5" class="slider" />
								<span class="hint value">{{ form.size }}%</span>
							</div>
							<div class="row">
								<span class="label">不透明度</span>
								<a-slider v-model:value="form.opacity" :min="0.05" :max="1" :step="0.01" class="slider" />
								<span class="hint value">{{ Math.round(form.opacity * 100) }}%</span>
							</div>
							<div class="row wrap" style="margin-top: 6px">
								<span class="label">颜色</span>
								<input class="native-picker" type="color" :value="form.color" :disabled="form.randomColor" @input="onColorInput" />
								<span class="swatches">
									<i
										v-for="item in PALETTE"
										:key="item"
										:style="{ background: item }"
										:class="{ dim: form.randomColor }"
										:title="item"
										@click="pickColor(item)"
									/>
								</span>
								<a-checkbox v-model:checked="form.randomColor">随机颜色</a-checkbox>
								<a-button v-if="form.randomColor" size="small" @click="reshuffle">换一批</a-button>
							</div>
							<div class="row wrap" style="margin-top: 6px">
								<a-checkbox v-model:checked="form.bold">加粗</a-checkbox>
								<a-checkbox v-model:checked="form.shadow">投影</a-checkbox>
								<a-checkbox v-model:checked="form.stroke">描边</a-checkbox>
							</div>
						</div>

						<div class="tool-card block">
							<div class="block-title">排布方式</div>
							<a-radio-group v-model:value="form.mode" size="small" button-style="solid">
								<a-radio-button value="single">单个</a-radio-button>
								<a-radio-button value="tile">满屏平铺</a-radio-button>
							</a-radio-group>

							<div class="row" style="margin-top: 10px">
								<span class="label">旋转角度</span>
								<a-slider v-model:value="form.angle" :min="-180" :max="180" :step="1" class="slider" />
								<a-input-number v-model:value="form.angle" :min="-180" :max="180" size="small" class="value" />
							</div>

							<template v-if="form.mode === 'single'">
								<div class="pos-wrap">
									<div class="pos-grid">
										<button
											v-for="item in POSITIONS"
											:key="item.value"
											type="button"
											class="pos-cell"
											:class="{ on: form.position === item.value }"
											:title="item.label"
											@click="form.position = item.value"
										/>
									</div>
									<div class="pos-side">
										<div class="row">
											<span class="label">边距</span>
											<a-slider v-model:value="form.margin" :min="0" :max="20" :step="0.5" class="slider" />
											<span class="hint value">{{ form.margin }}%</span>
										</div>
										<div class="hint">九宫格选择水印落点</div>
									</div>
								</div>
							</template>

							<template v-else>
								<div class="row">
									<span class="label">间距</span>
									<a-slider v-model:value="form.gap" :min="0.2" :max="8" :step="0.1" class="slider" />
									<span class="hint value">{{ form.gap }} 倍</span>
								</div>
								<a-checkbox v-model:checked="form.stagger">交错排列（相邻行错开半格）</a-checkbox>
							</template>
						</div>

						<div class="tool-card block">
							<div class="block-title">快捷预设</div>
							<div class="row wrap">
								<a-button size="small" v-for="item in PRESETS" :key="item.key" @click="applyPreset(item.key)">
									{{ item.label }}
								</a-button>
							</div>
						</div>
					</div>
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<a-space :size="12" align="center" wrap>
				<span class="label">导出格式</span>
				<a-select v-model:value="form.format" style="width: 150px" :options="formatOptions" />
				<template v-if="currentFormat.lossy">
					<span class="label">质量</span>
					<a-slider v-model:value="form.quality" :min="0.1" :max="1" :step="0.01" style="width: 120px" />
					<span class="hint">{{ Math.round(form.quality * 100) }}%</span>
				</template>
			</a-space>
			<a-space>
				<a-button v-if="source" :disabled="busy" @click="reset">重新选择</a-button>
				<a-button type="primary" :disabled="!source" :loading="busy" @click="exportImage">导出图片</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import Selector from '@/components/Selector.vue'
import {
	IMAGE_FILTER,
	canvasToBytes,
	createCanvas,
	decodeImageBytes,
	getOutputFormat,
	sniffMime,
	stripExt,
} from '@/utils/image'
import { friendlyError, readSourceBytes, saveBytesAs } from '@/utils/tauriIO'

/** 预览最长边，避免超大图拖慢实时重绘 */
const MAX_PREVIEW = 1000
const DEFAULT_TEXT = 'XTools'
const FONT_STACK = '"PingFang SC","Microsoft YaHei","Helvetica Neue",Arial,sans-serif'
const PALETTE = ['#ffffff', '#000000', '#ff4d4f', '#faad14', '#52c41a', '#1677ff', '#722ed1']
const POSITIONS = [
	{ value: 'top-left', label: '左上' },
	{ value: 'top-center', label: '上中' },
	{ value: 'top-right', label: '右上' },
	{ value: 'middle-left', label: '左中' },
	{ value: 'middle-center', label: '正中间' },
	{ value: 'middle-right', label: '右中' },
	{ value: 'bottom-left', label: '左下' },
	{ value: 'bottom-center', label: '下中' },
	{ value: 'bottom-right', label: '右下' },
]
const PRESETS = [
	{ key: 'tileSoft', label: '满屏浅色斜铺' },
	{ key: 'corner', label: '右下角署名' },
	{ key: 'center', label: '居中标语' },
	{ key: 'rainbow', label: '彩色平铺' },
]

const source = ref(null)
const loading = ref(false)
const busy = ref(false)
const canvasRef = ref(null)
/** 随机颜色种子：换一批只改种子，调整其它参数时颜色不会乱跳 */
const randSeed = ref(Math.floor(Math.random() * 1e6))

const form = reactive({
	text: DEFAULT_TEXT,
	size: 7,
	color: '#ffffff',
	randomColor: false,
	bold: true,
	shadow: true,
	stroke: false,
	opacity: 0.5,
	angle: -30,
	mode: 'tile',
	position: 'bottom-right',
	margin: 4,
	gap: 2.4,
	stagger: true,
	format: 'png',
	quality: 0.92,
})

const formatOptions = [
	{ label: 'PNG（支持透明）', value: 'png' },
	{ label: 'JPG', value: 'jpg' },
	{ label: 'WEBP', value: 'webp' },
]
const currentFormat = computed(() => getOutputFormat(form.format))

/* ---------------- 随机颜色（可复现） ---------------- */

/** mulberry32：给同一个种子就得到同一串随机数，保证重绘时颜色稳定 */
const makeRandom = seed => {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** 随机但保持可读的配色：色相随机，饱和度/亮度固定 */
const hueColor = random => `hsl(${Math.floor(random() * 360)}, 85%, 62%)`

/* ---------------- 绘制 ---------------- */

/** 按当前参数把水印画到任意尺寸的画布上（预览与原图导出共用同一套比例） */
const paintWatermark = (ctx, width, height) => {
	const lines = String(form.text || '')
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean)
	if (!lines.length || !width || !height) return

	const short = Math.min(width, height)
	const fontSize = Math.max(5, (short * form.size) / 100)
	const lineHeight = fontSize * 1.28
	const rad = (form.angle * Math.PI) / 180
	const random = form.randomColor ? makeRandom(randSeed.value) : null

	ctx.save()
	ctx.globalAlpha = form.opacity
	ctx.font = `${form.bold ? '700' : '400'} ${fontSize}px ${FONT_STACK}`
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.lineJoin = 'round'
	if (form.shadow) {
		ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
		ctx.shadowBlur = fontSize * 0.22
		ctx.shadowOffsetY = fontSize * 0.06
	}

	const paintLine = (text, x, y, color) => {
		if (form.stroke) {
			ctx.lineWidth = Math.max(1, fontSize * 0.07)
			ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
			ctx.strokeText(text, x, y)
		}
		ctx.fillStyle = color
		ctx.fillText(text, x, y)
	}

	const blockWidth = Math.max(...lines.map(line => ctx.measureText(line).width))
	const blockHeight = lineHeight * lines.length

	if (form.mode === 'tile') {
		const stepX = blockWidth + fontSize * form.gap
		const stepY = blockHeight + fontSize * form.gap * 0.9
		const diag = Math.hypot(width, height) + Math.max(stepX, stepY)
		const cols = Math.ceil(diag / stepX) + 1
		const rows = Math.ceil(diag / stepY) + 1

		ctx.translate(width / 2, height / 2)
		ctx.rotate(rad)
		for (let row = 0; row < rows; row += 1) {
			const offset = form.stagger && row % 2 ? stepX / 2 : 0
			for (let col = 0; col < cols; col += 1) {
				const x = -diag / 2 + col * stepX + offset + blockWidth / 2
				const y = -diag / 2 + row * stepY + blockHeight / 2
				const color = random ? hueColor(random) : form.color
				lines.forEach((line, index) => {
					paintLine(line, x, y + (index - (lines.length - 1) / 2) * lineHeight, color)
				})
			}
		}
	} else {
		const [vSide, hSide] = form.position.split('-')
		const margin = (short * form.margin) / 100
		const x =
			hSide === 'left' ? margin + blockWidth / 2 : hSide === 'right' ? width - margin - blockWidth / 2 : width / 2
		const y =
			vSide === 'top'
				? margin + blockHeight / 2
				: vSide === 'bottom'
					? height - margin - blockHeight / 2
					: height / 2
		const color = random ? hueColor(random) : form.color
		ctx.translate(x, y)
		ctx.rotate(rad)
		lines.forEach((line, index) => {
			paintLine(line, 0, (index - (lines.length - 1) / 2) * lineHeight, color)
		})
	}

	ctx.restore()
}

/* ---------------- 预览 ---------------- */

const render = () => {
	const canvas = canvasRef.value
	const src = source.value
	if (!canvas || !src) return
	const ratio = Math.min(1, MAX_PREVIEW / Math.max(src.width, src.height))
	const width = Math.max(1, Math.round(src.width * ratio))
	const height = Math.max(1, Math.round(src.height * ratio))
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width
		canvas.height = height
	}
	const ctx = canvas.getContext('2d')
	ctx.clearRect(0, 0, width, height)
	ctx.drawImage(src.img, 0, 0, width, height)
	paintWatermark(ctx, width, height)
}

let rafId = 0
const scheduleRender = () => {
	if (rafId) return
	rafId = requestAnimationFrame(() => {
		rafId = 0
		render()
	})
}

watch(form, scheduleRender, { deep: true })
watch(randSeed, scheduleRender)
onUnmounted(() => {
	if (rafId) cancelAnimationFrame(rafId)
	if (source.value?.url) URL.revokeObjectURL(source.value.url)
})

/* ---------------- 交互 ---------------- */

const onColorInput = event => {
	form.color = event.target.value
	if (form.randomColor) form.randomColor = false
}

const pickColor = color => {
	form.color = color
	form.randomColor = false
}

const reshuffle = () => {
	randSeed.value = Math.floor(Math.random() * 1e6)
}

const insertToken = kind => {
	const token = kind === 'date' ? dayjs().format('YYYY-MM-DD') : stripExt(source.value?.name || '图片')
	if (!form.text) {
		form.text = token
		return
	}
	form.text = `${form.text.replace(/\n$/, '')}\n${token}`
}

const applyPreset = key => {
	if (key === 'tileSoft') {
		Object.assign(form, { mode: 'tile', angle: -30, size: 6, opacity: 0.32, gap: 3, stagger: true, shadow: false, stroke: false, randomColor: false, color: '#ffffff' })
	} else if (key === 'corner') {
		Object.assign(form, { mode: 'single', position: 'bottom-right', angle: 0, size: 4.5, opacity: 0.75, margin: 3, shadow: true, stroke: false, randomColor: false, color: '#ffffff' })
	} else if (key === 'center') {
		Object.assign(form, { mode: 'single', position: 'middle-center', angle: -20, size: 12, opacity: 0.28, margin: 4, shadow: false, stroke: false, randomColor: false, color: '#ffffff' })
	} else if (key === 'rainbow') {
		Object.assign(form, { mode: 'tile', angle: 45, size: 5, opacity: 0.6, gap: 2.6, stagger: true, shadow: false, stroke: false, randomColor: true })
		reshuffle()
	}
}

/* ---------------- 载入 / 导出 ---------------- */

const handleFiles = async sources => {
	const list = (Array.isArray(sources) ? sources : [sources]).filter(Boolean).slice(0, 1)
	if (!list.length) return
	loading.value = true
	try {
		const bytes = await readSourceBytes(list[0])
		const name = typeof list[0] === 'string' ? list[0].split(/[\\/]/).pop() : list[0].name
		const mime = sniffMime(bytes)
		const decoded = await decodeImageBytes(bytes, mime)
		if (source.value?.url) URL.revokeObjectURL(source.value.url)
		source.value = {
			name,
			bytes,
			mime,
			url: decoded.url,
			width: decoded.width,
			height: decoded.height,
			img: decoded.img,
		}
		// 换图后尺寸可能差很多，重设一下画布
		const canvas = canvasRef.value
		if (canvas) {
			canvas.width = 1
			canvas.height = 1
		}
		scheduleRender()
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		loading.value = false
	}
}

const exportImage = async () => {
	const src = source.value
	if (!src) return
	busy.value = true
	try {
		const out = createCanvas(src.width, src.height)
		const ctx = out.getContext('2d')
		// JPG 不支持透明，先铺白底，否则透明区会变黑
		if (!currentFormat.value.alpha) {
			ctx.fillStyle = '#ffffff'
			ctx.fillRect(0, 0, src.width, src.height)
		}
		ctx.drawImage(src.img, 0, 0, src.width, src.height)
		paintWatermark(ctx, src.width, src.height)

		const bytes = await canvasToBytes(out, form.format)
		const ext = currentFormat.value.ext
		const path = await saveBytesAs(bytes, {
			defaultPath: `${stripExt(src.name)}_watermark.${ext}`,
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
}

/* 开发期探针：无头浏览器里塞真实图片进来，校验绘制结果（生产构建不会包含） */
if (import.meta.env.DEV) {
	window.__watermarkTest = {
		load: (bytes, name = 'test.png') => handleFiles([new File([bytes], name, { type: sniffMime(bytes) })]),
		set: patch => Object.assign(form, patch),
		reshuffle,
		state: () => ({
			text: String(form.text),
			mode: form.mode,
			random: form.randomColor,
			angle: form.angle,
			width: canvasRef.value?.width || 0,
			height: canvasRef.value?.height || 0,
			hasSource: !!source.value,
		}),
		/** 对比「无水印」与「有水印」两次绘制，统计被改动的像素数（以及随机色是否真的多色） */
		paintStats: () => {
			const canvas = canvasRef.value
			if (!canvas || !source.value) return null
			const ctx = canvas.getContext('2d')
			const read = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data
			const text = form.text
			form.text = ''
			render()
			const base = read()
			form.text = text
			render()
			const now = read()
			let diff = 0
			const colors = new Set()
			for (let i = 0; i < now.length; i += 4) {
				if (now[i] !== base[i] || now[i + 1] !== base[i + 1] || now[i + 2] !== base[i + 2]) {
					diff += 1
					colors.add(`${now[i]},${now[i + 1]},${now[i + 2]}`)
				}
			}
			return { diff, distinct: colors.size, width: canvas.width, height: canvas.height }
		},
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.imgWatermark {
	.editor {
		display: flex;
		gap: 20px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.stage {
		flex: 1;
		min-width: 320px;
		display: flex;
		flex-flow: column;
		align-items: center;
		canvas {
			max-width: 100%;
			max-height: 58vh;
			border-radius: 8px;
			box-shadow: 0 1px 8px rgba(0, 0, 0, 0.14);
			background:
				linear-gradient(45deg, #f2f2f2 25%, transparent 25%, transparent 75%, #f2f2f2 75%) 0 0 / 12px 12px,
				linear-gradient(45deg, #f2f2f2 25%, transparent 25%, transparent 75%, #f2f2f2 75%) 6px 6px / 12px 12px,
				#fff;
		}
		.stage-tip {
			margin-top: 10px;
		}
	}
	.panel {
		width: 430px;
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
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		&.wrap {
			flex-wrap: wrap;
		}
		& + .row {
			margin-top: 6px;
		}
	}
	.label {
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
		width: 62px;
		text-align: right;
		white-space: nowrap;
	}
	.native-picker {
		width: 42px;
		height: 28px;
		padding: 0;
		border: 1px solid var(--panel-border);
		border-radius: 6px;
		background: none;
		cursor: pointer;
		&:disabled {
			opacity: 0.4;
			cursor: not-allowed;
		}
	}
	.swatches {
		display: inline-flex;
		gap: 5px;
		i {
			width: 18px;
			height: 18px;
			border-radius: 50%;
			border: 1px solid rgba(0, 0, 0, 0.15);
			cursor: pointer;
			transition: transform 0.15s;
			&:hover {
				transform: scale(1.15);
			}
			&.dim {
				opacity: 0.35;
			}
		}
	}
	.pos-wrap {
		display: flex;
		gap: 16px;
		align-items: center;
		margin-top: 10px;
		flex-wrap: wrap;
	}
	.pos-grid {
		display: grid;
		grid-template-columns: repeat(3, 30px);
		grid-template-rows: repeat(3, 30px);
		gap: 4px;
		padding: 6px;
		border-radius: 8px;
		background: var(--page-bg);
	}
	.pos-cell {
		border: 1px solid var(--border-color);
		border-radius: 5px;
		background: var(--panel-bg);
		cursor: pointer;
		padding: 0;
		transition: all 0.15s;
		&:hover {
			border-color: #1677ff;
		}
		&.on {
			background: #1677ff;
			border-color: #1677ff;
		}
	}
	.pos-side {
		flex: 1;
		min-width: 150px;
		display: flex;
		flex-flow: column;
		gap: 6px;
	}
}
</style>
