<template>
	<div class="tool gifCompress">
		<h1 class="tool-title">
			GIF 压缩
			<span class="tip">保留动画，通过降颜色数 / 缩放 / 抽帧来减小体积，可实时预览效果</span>
		</h1>

		<div class="tool-content">
			<Selector
				v-if="!source"
				title="点击选择 GIF，或拖拽到此处"
				:multiple="false"
				:filters="[GIF_FILTER]"
				@selected="handleFiles"
				@drop="handleFiles"
			/>

			<a-spin v-else :spinning="loading">
				<div class="editor">
					<div class="tool-card block side">
						<div class="block-title">原图</div>
						<div class="preview">
							<img :src="source.url" alt="" />
						</div>
						<div class="hint">
							{{ source.width }} × {{ source.height }} · {{ source.frameCount }} 帧 ·
							{{ formatDuration(source.duration) }} · {{ formatBytes(source.size) }}
						</div>
					</div>

					<div class="tool-card block side">
						<div class="block-title">压缩结果</div>
						<div class="preview">
							<img v-if="resultUrl" :src="resultUrl" alt="" />
							<div v-else class="placeholder hint">调整左侧参数后点「开始压缩」</div>
						</div>
						<div class="hint" v-if="result">
							{{ result.width }} × {{ result.height }} · {{ result.frames }} 帧 · {{ formatBytes(result.bytes.length) }}
							<a-tag :color="result.bytes.length <= source.size ? 'green' : 'orange'" style="margin-left: 6px">
								{{ result.bytes.length <= source.size ? '减小' : '增大' }}
								{{ Math.abs((1 - result.bytes.length / source.size) * 100).toFixed(1) }}%
							</a-tag>
							<span v-if="costMs"> · 耗时 {{ costMs }} ms</span>
						</div>
					</div>

					<div class="tool-card block options">
						<div class="block-title">压缩参数</div>
						<a-space direction="vertical" size="10" style="width: 100%">
							<div class="row">
								<span class="label">缩放</span>
								<a-slider v-model:value="form.scale" :min="10" :max="100" :step="5" style="flex: 1" />
								<span class="hint">{{ form.scale }}%（{{ outputSize.width }}×{{ outputSize.height }}）</span>
							</div>
							<div class="row">
								<span class="label">颜色数</span>
								<a-slider v-model:value="form.colors" :min="8" :max="256" :step="8" style="flex: 1" />
								<span class="hint">{{ form.colors }} 色</span>
							</div>
							<div class="row">
								<span class="label">抽帧</span>
								<a-slider v-model:value="form.frameStep" :min="1" :max="5" :step="1" style="flex: 1" />
								<span class="hint">{{ form.frameStep === 1 ? '不抽帧' : `每 ${form.frameStep} 帧取 1 帧（约剩 ${Math.ceil(source.frameCount / form.frameStep)} 帧）` }}</span>
							</div>
							<a-space :size="16" wrap align="center">
								<span class="switch-item">
									<a-switch v-model:checked="form.dither" size="small" />
									<span class="hint">颜色抖动（画质更好）</span>
								</span>
								<span class="switch-item">
									<span class="hint">循环</span>
									<a-select v-model:value="form.loopMode" size="small" style="width: 120px" :options="loopOptions" />
								</span>
							</a-space>
							<div class="hint">颜色数越低体积越小；抽帧会丢动画流畅度，8~12 帧足够表达大意</div>
						</a-space>
					</div>
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<span class="hint">{{ busy ? `正在处理第 ${progress} / ${totalFrames} 帧…` : '所有处理都在本地完成' }}</span>
			<a-space>
				<a-button v-if="source" :disabled="busy" @click="reset">重新选择</a-button>
				<a-button v-if="busy" danger @click="cancel = true">取消</a-button>
				<a-button type="primary" :disabled="!source || busy" :loading="busy" @click="compress">开始压缩</a-button>
				<a-button type="primary" ghost :disabled="!result" :loading="busy" @click="saveResult">保存 GIF</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import { formatBytes, stripExt } from '@/utils/image'
import { friendlyError, readSourceBytes, saveBytesAs } from '@/utils/tauriIO'
import { GifBuilder } from '@/utils/gif'
import { decodeGif, probeGif } from '@/utils/gifDecode'

const GIF_FILTER = { name: 'GIF 动图', extensions: ['gif'] }

const source = ref(null)
const result = ref(null)
const resultUrl = ref('')
const loading = ref(false)
const busy = ref(false)
const cancel = ref(false)
const progress = ref(0)
const totalFrames = ref(0)
const costMs = ref(0)

const form = reactive({ scale: 70, colors: 128, frameStep: 1, dither: true, loopMode: 'keep' })
const loopOptions = [
	{ label: '保持原样', value: 'keep' },
	{ label: '无限循环', value: 'infinite' },
	{ label: '只播一次', value: 'once' },
]

const outputSize = computed(() => {
	const width = source.value?.width || 0
	const height = source.value?.height || 0
	return {
		width: Math.max(8, Math.round((width * form.scale) / 100)),
		height: Math.max(8, Math.round((height * form.scale) / 100)),
	}
})

const handleFiles = async sources => {
	const list = (Array.isArray(sources) ? sources : [sources]).filter(Boolean).slice(0, 1)
	if (!list.length) return
	loading.value = true
	try {
		const bytes = await readSourceBytes(list[0])
		const name = typeof list[0] === 'string' ? list[0].split(/[\\/]/).pop() : list[0].name
		const probe = probeGif(bytes)
		if (source.value?.url) URL.revokeObjectURL(source.value.url)
		clearResult()
		source.value = {
			name,
			bytes,
			url: URL.createObjectURL(new Blob([bytes], { type: 'image/gif' })),
			width: probe.width,
			height: probe.height,
			frameCount: probe.frameCount,
			duration: probe.duration,
			loop: probe.loop,
			size: bytes.length,
		}
		if (probe.frameCount <= 1) message.info('这是一张静态 GIF，压缩后会变成单帧图')
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		loading.value = false
	}
}

const clearResult = () => {
	if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
	resultUrl.value = ''
	result.value = null
	costMs.value = 0
}

const compress = async () => {
	if (!source.value) return
	busy.value = true
	cancel.value = false
	progress.value = 0
	const started = performance.now()
	try {
		const target = outputSize.value
		const needsScale = target.width !== source.value.width || target.height !== source.value.height
		const step = Math.max(1, Math.round(form.frameStep))

		// 先统计要保留多少帧，并采样调色板
		const info = probeGif(source.value.bytes)
		totalFrames.value = Math.ceil(info.frameCount / step)

		const builder = new GifBuilder({
			width: target.width,
			height: target.height,
			maxColors: form.colors,
			dither: form.dither,
			loop: form.loopMode === 'keep' ? info.loop : form.loopMode === 'infinite' ? 0 : null,
			delay: 10,
		})

		// 采样：均匀取一部分帧
		const sampleStride = Math.max(step, Math.floor((info.frameCount || 1) / 8) * step)
		decodeGif(source.value.bytes, {
			frameStride: sampleStride,
			background: [255, 255, 255, 255],
			onFrame: frame => builder.addSample(frame.data, 23),
		})
		builder.buildPalette()

		const fromCanvas = needsScale ? document.createElement('canvas') : null
		const toCanvas = needsScale ? document.createElement('canvas') : null
		let processed = 0
		decodeGif(source.value.bytes, {
			background: [255, 255, 255, 255],
			onFrame: frame => {
				if (cancel.value) throw new Error('已取消')
				if (frame.index % step !== 0) return
				let rgba = frame.data
				if (needsScale) {
					fromCanvas.width = info.width
					fromCanvas.height = info.height
					fromCanvas.getContext('2d').putImageData(new ImageData(frame.data, info.width, info.height), 0, 0)
					toCanvas.width = target.width
					toCanvas.height = target.height
					const ctx = toCanvas.getContext('2d')
					ctx.imageSmoothingEnabled = true
					ctx.imageSmoothingQuality = 'high'
					ctx.drawImage(fromCanvas, 0, 0, target.width, target.height)
					rgba = ctx.getImageData(0, 0, target.width, target.height).data
				}
				builder.addFrame(rgba, frame.delay)
				processed += 1
				progress.value = processed
			},
		})

		const bytes = builder.build()
		clearResult()
		result.value = { bytes, width: builder.width, height: builder.height, frames: processed }
		resultUrl.value = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }))
		costMs.value = Math.round(performance.now() - started)
		message.success(`压缩完成：${formatBytes(source.value.size)} → ${formatBytes(bytes.length)}`)
	} catch (err) {
		if (String(err?.message || err).includes('已取消')) message.info('已取消')
		else message.error(friendlyError(err))
	} finally {
		busy.value = false
	}
}

const saveResult = async () => {
	if (!result.value) return
	try {
		const path = await saveBytesAs(result.value.bytes, {
			defaultPath: `${stripExt(source.value.name)}_compressed.gif`,
			filters: [{ name: 'GIF', extensions: ['gif'] }],
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

onUnmounted(() => {
	if (source.value?.url) URL.revokeObjectURL(source.value.url)
	clearResult()
})

const formatDuration = seconds => {
	const value = Number(seconds) || 0
	return value >= 1 ? `${value.toFixed(2)} 秒` : `${Math.round(value * 1000)} 毫秒`
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.gifCompress {
	.editor {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.side {
		flex: 1;
		min-width: 260px;
	}
	.options {
		width: 400px;
		max-width: 100%;
	}
	.block-title {
		font-weight: 600;
		color: #262626;
		margin-bottom: 10px;
	}
	.preview {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 160px;
		max-height: 340px;
		overflow: hidden;
		border-radius: 10px;
		background:
			linear-gradient(45deg, #f0f0f0 25%, transparent 25%, transparent 75%, #f0f0f0 75%) 0 0 / 16px 16px,
			linear-gradient(45deg, #f0f0f0 25%, transparent 25%, transparent 75%, #f0f0f0 75%) 8px 8px / 16px 16px,
			#fff;
		img {
			max-width: 100%;
			max-height: 340px;
			object-fit: contain;
		}
		.placeholder {
			padding: 40px;
			text-align: center;
		}
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		.label {
			width: 46px;
			font-size: 13px;
			color: rgba(0, 0, 0, 0.65);
		}
	}
	.switch-item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
}
</style>
