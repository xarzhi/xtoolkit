<template>
	<div class="tool imgUpscale">
		<h1 class="tool-title">
			图片无损放大
			<span class="tip">逐步插值放大 + 可选锐化，尽量保留边缘细节（不是 AI 超分，但比一次性拉伸清晰很多）</span>
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
					<div class="tool-card block side">
						<div class="block-title">原图</div>
						<div class="preview" :class="{ actual: showActual }">
							<img :src="source.url" alt="" />
						</div>
						<div class="hint">
							{{ source.width }} × {{ source.height }} · {{ formatBytes(source.bytes.length) }}
						</div>
					</div>

					<div class="tool-card block side">
						<div class="block-title">放大结果</div>
						<div class="preview" :class="{ actual: showActual }">
							<img v-if="resultUrl" :src="resultUrl" alt="" />
							<div v-else class="placeholder hint">点击右下角「开始放大」</div>
						</div>
						<div class="hint" v-if="result">
							{{ result.width }} × {{ result.height }} · {{ formatBytes(result.bytes.length) }}
							<a-tag :color="result.bytes.length >= source.bytes.length ? 'orange' : 'green'" style="margin-left: 6px">
								{{ result.bytes.length >= source.bytes.length ? '增大' : '减小' }}
								{{ Math.abs((1 - result.bytes.length / source.bytes.length) * 100).toFixed(1) }}%
							</a-tag>
							<span v-if="costMs"> · 耗时 {{ costMs }} ms</span>
						</div>
					</div>

					<div class="tool-card block options">
						<div class="block-title">放大设置</div>
						<a-space direction="vertical" size="10" style="width: 100%">
							<a-radio-group v-model:value="form.mode" button-style="solid">
								<a-radio-button value="factor">按倍数</a-radio-button>
								<a-radio-button value="target">按目标尺寸</a-radio-button>
							</a-radio-group>

							<div v-if="form.mode === 'factor'" class="row">
								<span class="label">倍数</span>
								<a-slider v-model:value="form.factor" :min="1.5" :max="8" :step="0.5" style="flex: 1" />
								<span class="hint">{{ form.factor }}×</span>
							</div>

							<div v-else class="grid">
								<a-input-number v-model:value="form.targetWidth" :min="1" :max="20000" addon-before="宽" @change="onWidthChange" />
								<a-input-number v-model:value="form.targetHeight" :min="1" :max="20000" addon-before="高" @change="onHeightChange" />
								<a-checkbox v-model:checked="form.keepRatio">锁定宽高比</a-checkbox>
							</div>

							<div class="row">
								<span class="label">锐化</span>
								<a-slider v-model:value="form.sharpen" :min="0" :max="100" :step="1" style="flex: 1" />
								<span class="hint">{{ form.sharpen }}</span>
							</div>

							<div class="hint">
								输出 {{ outputSize.width }} × {{ outputSize.height }}（原图的
								{{ (outputSize.width / (source?.width || 1)).toFixed(2) }} 倍）
							</div>

							<a-space :size="16" wrap align="center">
								<a-checkbox v-model:checked="showActual">按 1:1 像素显示（可滚动对比）</a-checkbox>
								<span class="switch-item">
									<a-select v-model:value="form.format" size="small" style="width: 150px" :options="formatOptions" />
								</span>
								<template v-if="currentFormat.lossy">
									<span class="hint">质量</span>
									<a-slider v-model:value="form.quality" :min="0.5" :max="1" :step="0.01" style="width: 120px" />
									<span class="hint">{{ Math.round(form.quality * 100) }}%</span>
								</template>
							</a-space>
						</a-space>
					</div>
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<span class="hint">放大倍数越大越慢；截图、图标、UI 素材效果最好，照片建议 2~3 倍</span>
			<a-space>
				<a-button v-if="source" @click="reset">重新选择</a-button>
				<a-button type="primary" :disabled="!source" :loading="busy" @click="upscale">开始放大</a-button>
				<a-button type="primary" ghost :disabled="!result" :loading="busy" @click="saveResult">保存图片</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import {
	IMAGE_FILTER,
	canvasToBytes,
	decodeImageBytes,
	drawImageProgressive,
	formatBytes,
	getOutputFormat,
	sharpenImageData,
	sniffMime,
	stripExt,
} from '@/utils/image'
import { friendlyError, readSourceBytes, saveBytesAs } from '@/utils/tauriIO'

const source = ref(null)
const result = ref(null)
const resultUrl = ref('')
const loading = ref(false)
const busy = ref(false)
const costMs = ref(0)
const showActual = ref(false)

const form = reactive({
	mode: 'factor',
	factor: 2,
	targetWidth: 0,
	targetHeight: 0,
	keepRatio: true,
	sharpen: 30,
	format: 'png',
	quality: 0.95,
})

const formatOptions = [
	{ label: 'PNG（无损）', value: 'png' },
	{ label: 'JPG', value: 'jpg' },
	{ label: 'WEBP', value: 'webp' },
]
const currentFormat = computed(() => getOutputFormat(form.value.format))

const outputSize = computed(() => {
	const width = source.value?.width || 0
	const height = source.value?.height || 0
	if (!width) return { width: 0, height: 0 }
	if (form.value.mode === 'factor') {
		return {
			width: Math.max(1, Math.round(width * form.value.factor)),
			height: Math.max(1, Math.round(height * form.value.factor)),
		}
	}
	return {
		width: Math.max(1, Math.round(form.value.targetWidth || width)),
		height: Math.max(1, Math.round(form.value.targetHeight || height)),
	}
})

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
		form.targetWidth = decoded.width * 2
		form.targetHeight = decoded.height * 2
		clearResult()
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		loading.value = false
	}
}

const onWidthChange = () => {
	if (!form.keepRatio || !source.value) return
	form.targetHeight = Math.max(1, Math.round((form.targetWidth / source.value.width) * source.value.height))
}
const onHeightChange = () => {
	if (!form.keepRatio || !source.value) return
	form.targetWidth = Math.max(1, Math.round((form.targetHeight / source.value.height) * source.value.width))
}

const clearResult = () => {
	if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
	resultUrl.value = ''
	result.value = null
	costMs.value = 0
}

const upscale = async () => {
	if (!source.value) return
	busy.value = true
	const started = performance.now()
	try {
		const size = outputSize.value
		if (size.width < 1 || size.height < 1) throw new Error('目标尺寸不合法')
		if (size.width > 20000 || size.height > 20000) throw new Error('目标尺寸过大（上限 20000 px）')
		const background = currentFormat.value.alpha ? null : '#ffffff'
		const canvas = drawImageProgressive(source.value.img, size.width, size.height, { background })
		// 放大后再做一次锐化，边缘更"实"
		let outCanvas = canvas
		if (form.sharpen > 0) {
			const ctx = canvas.getContext('2d', { willReadFrequently: true })
			const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
			const sharpened = sharpenImageData(data, form.sharpen)
			outCanvas = document.createElement('canvas')
			outCanvas.width = canvas.width
			outCanvas.height = canvas.height
			outCanvas.getContext('2d').putImageData(new ImageData(sharpened.data, sharpened.width, sharpened.height), 0, 0)
		}
		const bytes = await canvasToBytes(outCanvas, form.value.format)
		clearResult()
		result.value = { bytes, width: outCanvas.width, height: outCanvas.height }
		resultUrl.value = URL.createObjectURL(new Blob([bytes], { type: currentFormat.value.mime }))
		costMs.value = Math.round(performance.now() - started)
		message.success(`放大完成：${outCanvas.width} × ${outCanvas.height}`)
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		busy.value = false
	}
}

const saveResult = async () => {
	if (!result.value) return
	try {
		const ext = currentFormat.value.ext
		const path = await saveBytesAs(result.value.bytes, {
			defaultPath: `${stripExt(source.value.name)}_${result.value.width}x${result.value.height}.${ext}`,
			filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const reset = () => {
	if (source.value?.url) URL.revokeObjectURL(source.value.url)
	clearResult()
	source.value = null
}

watch(
	() => [form.mode, form.factor],
	() => clearResult()
)
onUnmounted(() => {
	if (source.value?.url) URL.revokeObjectURL(source.value.url)
	clearResult()
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.imgUpscale {
	.editor {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.side {
		flex: 1;
		min-width: 280px;
	}
	.options {
		width: 380px;
		max-width: 100%;
	}
	.block-title {
		font-weight: 600;
		color: var(--text-color);
		margin-bottom: 10px;
	}
	.preview {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 160px;
		max-height: 380px;
		overflow: hidden;
		border-radius: 10px;
		background:
			linear-gradient(45deg, #f0f0f0 25%, transparent 25%, transparent 75%, #f0f0f0 75%) 0 0 / 16px 16px,
			linear-gradient(45deg, #f0f0f0 25%, transparent 25%, transparent 75%, #f0f0f0 75%) 8px 8px / 16px 16px,
			#fff;
		img {
			max-width: 100%;
			max-height: 380px;
			object-fit: contain;
		}
		&.actual {
			overflow: auto;
			align-items: flex-start;
			justify-content: flex-start;
			max-height: 380px;
			img {
				max-width: none;
				max-height: none;
			}
		}
		.placeholder {
			padding: 40px;
		}
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		.label {
			width: 40px;
			font-size: 13px;
			color: var(--text-color-3);
		}
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		align-items: center;
	}
	.switch-item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	:deep(.ant-input-number) {
		width: 100%;
	}
}
</style>
