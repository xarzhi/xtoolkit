<template>
	<div class="tool videoConvert">
		<h1 class="tool-title">
			视频格式转换
			<span class="tip">重新编码为 MP4 / WebM，可同时调整分辨率、帧率与码率（耗时≈视频时长）</span>
		</h1>

		<div class="tool-content">
			<Selector
				v-if="!source"
				title="点击选择视频，或拖拽到此处"
				:multiple="false"
				:filters="[VIDEO_FILTER]"
				@selected="handleFiles"
				@drop="handleFiles"
			/>

			<a-spin v-else :spinning="loading">
				<div class="editor">
					<div class="left">
						<video ref="videoRef" class="video" controls playsinline preload="auto"></video>
						<div class="hint meta">
							{{ source.name }} · 时长 {{ formatDuration(duration) }} · {{ formatBytes(source.size) }} ·
							{{ videoInfo.width }} × {{ videoInfo.height }}
						</div>
						<a-alert
							type="info"
							show-icon
							class="alert"
							message="说明：浏览器内核只能输出它支持的编码格式（下方列表已自动检测）。转换过程按实时速度重新编码，原 AVI / MKV / WMV 等容器需先能被本机解码才能转换。"
						/>
						<div class="preview" v-if="resultUrl">
							<div class="preview-head">
								<span>转换结果</span>
								<span class="hint">{{ formatBytes(resultBytes.length) }} · {{ resultInfo }}</span>
							</div>
							<video :src="resultUrl" class="video" controls playsinline></video>
						</div>
					</div>

					<div class="right">
						<div class="tool-card block">
							<div class="block-title">输出格式</div>
							<a-select v-model:value="form.mimeType" :options="formatOptions" style="width: 100%" />
							<div class="hint" style="margin-top: 6px">
								当前内核可用格式 {{ availableTypes.length }} 种；没有 MP4 说明内核不支持 MP4 录制，改用 WebM 即可
							</div>
						</div>

						<div class="tool-card block">
							<div class="block-title">画面</div>
							<div class="grid">
								<a-select v-model:value="form.scale" :options="scaleOptions" style="width: 100%" />
								<a-input-number v-model:value="form.fps" :min="10" :max="60" :step="1" addon-before="帧率" />
							</div>
							<div class="hint" style="margin-top: 6px">输出尺寸 {{ outWidth }} × {{ outHeight }}</div>
						</div>

						<div class="tool-card block">
							<div class="block-title">码率与声音</div>
							<div class="slider-row">
								<span class="name">视频码率</span>
								<a-slider v-model:value="form.bitrate" :min="1" :max="30" :step="0.5" class="slider" />
								<span class="hint">{{ form.bitrate }} Mbps</span>
							</div>
							<div class="slider-row">
								<span class="name">音频码率</span>
								<a-slider v-model:value="form.audioBitrate" :min="48" :max="320" :step="16" class="slider" />
								<span class="hint">{{ form.audioBitrate }} kbps</span>
							</div>
							<div class="switches">
								<span class="switch-item">
									<a-switch v-model:checked="form.withAudio" size="small" />
									<span class="hint">保留声音</span>
								</span>
								<span class="hint">预估体积约 {{ formatBytes(estimateBytes) }}</span>
							</div>
						</div>

						<div class="tool-card block" v-if="busy || progress > 0">
							<div class="block-title">转换进度</div>
							<a-progress :percent="Math.round(progress * 100)" :status="busy ? 'active' : 'success'" />
							<div class="hint">实时重新编码中，请保持页面打开…</div>
						</div>

						<a-alert v-if="errorText" type="error" show-icon :message="errorText" />
					</div>
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<span class="hint">转换 = 解码 + 重新编码，画质会有轻微损失；只想切片段请用「视频截取」</span>
			<a-space>
				<a-button v-if="source" :disabled="busy" @click="reset">重新选择</a-button>
				<a-button v-if="busy" danger @click="cancel = true">取消</a-button>
				<a-button type="primary" :disabled="!source || busy" :loading="busy" @click="convert">开始转换</a-button>
				<a-button type="primary" ghost :disabled="!resultBytes || busy" @click="saveResult">保存视频</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import { formatBytes } from '@/utils/image'
import { friendlyError, saveBytesAs } from '@/utils/tauriIO'
import { VIDEO_FILTER, formatDuration } from '@/utils/video'
import { drawFullFrame, recordVideoSegment, supportedVideoTypes } from '@/utils/videoExport'
import { useVideoSource } from '@/utils/useVideoSource'

const { source, duration, videoInfo, loading, videoRef, handleFiles, reset } = useVideoSource()

const busy = ref(false)
const cancel = ref(false)
const progress = ref(0)
const errorText = ref('')
const resultUrl = ref(null)
const resultBytes = ref(null)
const resultMime = ref('')

const availableTypes = supportedVideoTypes()
const formatOptions = availableTypes.map(item => ({ label: `${item.label}（.${item.ext}）`, value: item.mime }))
const scaleOptions = [
	{ label: '原始分辨率', value: 1 },
	{ label: '1080p', value: 1080 },
	{ label: '720p', value: 720 },
	{ label: '480p', value: 480 },
	{ label: '360p', value: 360 },
]

const form = reactive({
	mimeType: availableTypes[0]?.mime || 'video/webm',
	scale: 1,
	fps: 30,
	bitrate: 8,
	audioBitrate: 128,
	withAudio: true,
})

const outWidth = computed(() => {
	if (form.scale === 1) return videoInfo.value.width
	const ratio = videoInfo.value.width / (videoInfo.value.height || 1)
	return Math.round((form.scale * ratio) / 2) * 2
})
const outHeight = computed(() => (form.scale === 1 ? videoInfo.value.height : Math.round(form.scale / 2) * 2))
const estimateBytes = computed(() => ((form.bitrate + (form.withAudio ? form.audioBitrate / 1000 : 0)) * 1_000_000 * (duration.value || 0)) / 8)
const resultInfo = computed(() => {
	const type = availableTypes.find(item => item.mime === resultMime.value)
	return `${type?.label || resultMime.value} · ${outWidth.value} × ${outHeight.value}`
})

const clearResult = () => {
	if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
	resultUrl.value = null
	resultBytes.value = null
}

const convert = async () => {
	if (!source.value || !videoInfo.value.width) {
		message.error('视频还没有加载完成')
		return
	}
	busy.value = true
	cancel.value = false
	progress.value = 0
	errorText.value = ''
	clearResult()
	try {
		const result = await recordVideoSegment({
			src: source.value.url,
			start: 0,
			end: duration.value,
			width: outWidth.value,
			height: outHeight.value,
			fps: form.fps,
			mimeType: form.mimeType,
			videoBitsPerSecond: form.bitrate * 1_000_000,
			audioBitsPerSecond: form.audioBitrate * 1000,
			withAudio: form.withAudio,
			drawFrame: drawFullFrame,
			onProgress: ratio => {
				progress.value = ratio
			},
			shouldCancel: () => cancel.value,
		})
		resultBytes.value = result.bytes
		resultMime.value = result.mimeType
		resultUrl.value = URL.createObjectURL(result.blob)
		message.success(`转换完成（${formatBytes(result.bytes.length)}）`)
	} catch (err) {
		errorText.value = friendlyError(err)
		message.error(errorText.value)
	} finally {
		busy.value = false
	}
}

const saveResult = async () => {
	if (!resultBytes.value) return
	const type = availableTypes.find(item => item.mime === resultMime.value)
	const ext = type?.ext || 'webm'
	try {
		const path = await saveBytesAs(resultBytes.value, {
			defaultPath: `${(source.value?.name || 'video').replace(/\.[^.]+$/, '')}_converted.${ext}`,
			filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

onUnmounted(clearResult)
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.videoConvert {
	.editor {
		display: flex;
		gap: 20px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.left {
		flex: 1;
		min-width: 340px;
	}
	.video {
		width: 100%;
		max-height: 330px;
		background: #000;
		border-radius: 8px;
	}
	.meta {
		margin-top: 10px;
	}
	.alert {
		margin-top: 12px;
	}
	.preview {
		margin-top: 16px;
		.preview-head {
			display: flex;
			align-items: baseline;
			justify-content: space-between;
			font-weight: 600;
			color: var(--text-color);
			margin-bottom: 8px;
		}
	}
	.right {
		width: 400px;
		max-width: 100%;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.block {
		.block-title {
			font-weight: 600;
			color: var(--text-color);
			margin-bottom: 10px;
		}
		.grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 8px;
			align-items: center;
		}
		.switches {
			margin-top: 10px;
			display: flex;
			align-items: center;
			justify-content: space-between;
			.switch-item {
				display: inline-flex;
				align-items: center;
				gap: 6px;
			}
		}
		:deep(.ant-input-number) {
			width: 100%;
		}
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
			min-width: 90px;
			margin: 0 4px;
		}
	}
}
</style>
