<template>
	<div class="tool imgBeautify">
		<h1 class="tool-title">
			图片美化
			<span class="tip">亮度 / 对比度 / 饱和度 / 灰度 / 光感 / 高光 / 阴影 / 色阶 / 锐化，实时预览</span>
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
							预览为缩放版本（{{ baseWidth }} × {{ baseHeight }}），导出时按原图 {{ source.width }} × {{ source.height }} 处理
						</div>
					</div>

					<div class="panel">
						<div class="tool-card block">
							<div class="block-title">预设</div>
							<a-radio-group v-model:value="presetKey" size="small" @change="applyPreset">
								<a-radio-button v-for="item in BEAUTIFY_PRESETS" :key="item.value" :value="item.value">
									{{ item.label }}
								</a-radio-button>
							</a-radio-group>
						</div>

						<div class="tool-card block sliders">
							<div class="slider-row" v-for="item in sliderDefs" :key="item.key">
								<span class="name">{{ item.label }}</span>
								<a-slider
									v-model:value="adjust[item.key]"
									:min="item.min"
									:max="item.max"
									:step="item.step"
									class="slider"
								/>
								<a-input-number
									v-model:value="adjust[item.key]"
									:min="item.min"
									:max="item.max"
									:step="item.step"
									size="small"
									class="value"
								/>
								<a-button type="text" size="small" @click="resetOne(item.key)">重置</a-button>
							</div>
						</div>
					</div>
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<a-space :size="12" align="center" wrap>
				<a-button
					size="small"
					:type="compare ? 'primary' : 'default'"
					@mousedown="compare = true"
					@mouseup="compare = false"
					@mouseleave="compare = false"
				>
					按住对比原图
				</a-button>
				<a-button size="small" @click="resetAll">全部重置</a-button>
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
import Selector from '@/components/Selector.vue'
import {
	BEAUTIFY_PRESETS,
	DEFAULT_BEAUTIFY,
	IMAGE_FILTER,
	beautifyImageData,
	canvasToBytes,
	createCanvas,
	decodeImageBytes,
	getOutputFormat,
	sniffMime,
	stripExt,
} from '@/utils/image'
import { friendlyError, readSourceBytes, saveBytesAs } from '@/utils/tauriIO'

/** 预览最长边，兼顾流畅度与观感 */
const MAX_PREVIEW = 900

const source = ref(null)
const loading = ref(false)
const busy = ref(false)
const compare = ref(false)
const canvasRef = ref(null)
const baseData = ref(null)
const presetKey = ref('none')
const form = ref({ format: 'png', quality: 0.92 })
const adjust = reactive({ ...DEFAULT_BEAUTIFY })

const formatOptions = [
	{ label: 'PNG（支持透明）', value: 'png' },
	{ label: 'JPG', value: 'jpg' },
	{ label: 'WEBP', value: 'webp' },
]
const currentFormat = computed(() => getOutputFormat(form.value.format))

const sliderDefs = [
	{ key: 'exposure', label: '光感', min: -100, max: 100, step: 1 },
	{ key: 'brightness', label: '亮度', min: -100, max: 100, step: 1 },
	{ key: 'contrast', label: '对比度', min: -100, max: 100, step: 1 },
	{ key: 'saturation', label: '饱和度', min: -100, max: 100, step: 1 },
	{ key: 'grayscale', label: '灰度', min: 0, max: 100, step: 1 },
	{ key: 'highlights', label: '高光', min: -100, max: 100, step: 1 },
	{ key: 'shadows', label: '阴影', min: -100, max: 100, step: 1 },
	{ key: 'blackPoint', label: '色阶·黑场', min: 0, max: 100, step: 1 },
	{ key: 'whitePoint', label: '色阶·白场', min: 0, max: 100, step: 1 },
	{ key: 'gamma', label: '中间调', min: 0.2, max: 3, step: 0.05 },
	{ key: 'sharpen', label: '锐化', min: 0, max: 100, step: 1 },
]

const baseWidth = computed(() => baseData.value?.width || 0)
const baseHeight = computed(() => baseData.value?.height || 0)

/* ---------------- 载入 ---------------- */

const buildPreviewBase = () => {
	const { img, width, height } = source.value
	const ratio = Math.min(1, MAX_PREVIEW / Math.max(width, height))
	const canvas = createCanvas(width * ratio, height * ratio)
	const ctx = canvas.getContext('2d', { willReadFrequently: true })
	ctx.imageSmoothingEnabled = true
	ctx.imageSmoothingQuality = 'high'
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
	baseData.value = ctx.getImageData(0, 0, canvas.width, canvas.height)
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
		if (source.value?.url) URL.revokeObjectURL(source.value.url)
		source.value = { name, bytes, mime, url: decoded.url, width: decoded.width, height: decoded.height, img: decoded.img }
		buildPreviewBase()
		resetAll()
		scheduleRender()
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		loading.value = false
	}
}

/* ---------------- 渲染 ---------------- */

const render = () => {
	const canvas = canvasRef.value
	const base = baseData.value
	if (!canvas || !base) return
	const result = compare.value ? base : beautifyImageData(base, adjust)
	canvas.width = base.width
	canvas.height = base.height
	canvas.getContext('2d').putImageData(new ImageData(result.data, result.width, result.height), 0, 0)
}

let rafId = 0
const scheduleRender = () => {
	if (rafId) return
	rafId = requestAnimationFrame(() => {
		rafId = 0
		render()
	})
}

watch(adjust, scheduleRender, { deep: true })
watch(compare, render)
onUnmounted(() => {
	if (rafId) cancelAnimationFrame(rafId)
})

/* ---------------- 预设 / 重置 ---------------- */

const applyPreset = () => {
	const preset = BEAUTIFY_PRESETS.find(i => i.value === presetKey.value)
	Object.assign(adjust, DEFAULT_BEAUTIFY, preset?.options || {})
	scheduleRender()
}

const resetOne = key => {
	adjust[key] = DEFAULT_BEAUTIFY[key]
	scheduleRender()
}

const resetAll = () => {
	Object.assign(adjust, DEFAULT_BEAUTIFY)
	presetKey.value = 'none'
	scheduleRender()
}

/* ---------------- 导出 ---------------- */

const exportImage = async () => {
	if (!source.value) return
	busy.value = true
	try {
		const { img, width, height } = source.value
		const work = createCanvas(width, height)
		const wctx = work.getContext('2d', { willReadFrequently: true })
		wctx.drawImage(img, 0, 0)
		const result = beautifyImageData(wctx.getImageData(0, 0, width, height), adjust)

		// 先落到画布，再按需铺白底，避免 JPG 的透明区域变黑
		const processed = createCanvas(width, height)
		processed.getContext('2d').putImageData(new ImageData(result.data, result.width, result.height), 0, 0)
		const out = createCanvas(width, height)
		const octx = out.getContext('2d')
		if (!currentFormat.value.alpha) {
			octx.fillStyle = '#ffffff'
			octx.fillRect(0, 0, width, height)
		}
		octx.drawImage(processed, 0, 0)

		const bytes = await canvasToBytes(out, form.value.format)
		const ext = currentFormat.value.ext
		const path = await saveBytesAs(bytes, {
			defaultPath: `${stripExt(source.value.name)}_beautify.${ext}`,
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
	baseData.value = null
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.imgBeautify {
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
			max-height: 56vh;
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
		width: 440px;
		max-width: 100%;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.block-title {
		font-weight: 600;
		color: #262626;
		margin-bottom: 10px;
	}
	.sliders {
		.slider-row {
			display: flex;
			align-items: center;
			gap: 10px;
			.name {
				width: 68px;
				font-size: 13px;
				color: rgba(0, 0, 0, 0.65);
				white-space: nowrap;
			}
			.slider {
				flex: 1;
				min-width: 120px;
				margin: 0 4px;
			}
			.value {
				width: 82px;
			}
		}
	}
	.label {
		font-size: 13px;
		color: rgba(0, 0, 0, 0.65);
	}
}
</style>
