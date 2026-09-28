<template>
	<div class="tool videoTrim">
		<h1 class="tool-title">
			视频截取
			<span class="tip">按时间截取片段并导出为新视频（实时重编码，耗时≈片段时长）</span>
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
							{{ source.name }} · 时长 {{ formatDuration(duration) }} · {{ formatBytes(source.size) }}
						</div>
						<a-space :size="8" class="row-actions" wrap>
							<a-button size="small" :disabled="busy" @click="setStart">从当前时间设为起点</a-button>
							<a-button size="small" :disabled="busy" @click="setEnd">把当前时间设为终点</a-button>
							<a-button size="small" :disabled="busy" @click="playSelection">试听片段</a-button>
						</a-space>

						<div class="tool-card range-card">
							<a-slider
								v-model:value="range"
								range
								:min="0"
								:max="Math.max(0.1, duration)"
								:step="0.05"
								:tip-formatter="value => `${Number(value).toFixed(2)}s`"
							/>
							<div class="range-info">
								<span>起点 <b>{{ range[0].toFixed(2) }}</b> s</span>
								<span>终点 <b>{{ range[1].toFixed(2) }}</b> s</span>
								<span>片段时长 <b>{{ segmentDuration.toFixed(2) }}</b> s</span>
							</div>
						</div>

						<div class="preview" v-if="resultUrl">
							<div class="preview-head">
								<span>导出结果</span>
								<span class="hint">{{ formatBytes(resultBytes.length) }} · {{ resultInfo }}</span>
							</div>
							<video :src="resultUrl" class="video" controls playsinline></video>
						</div>
					</div>

					<div class="right">
						<div class="tool-card block">
							<div class="block-title">精确时间</div>
							<div class="grid">
								<a-input-number v-model:value="start" :min="0" :max="Math.max(0, duration - 0.05)" :step="0.1" addon-before="起点" addon-after="s" @change="syncRange" />
								<a-input-number v-model:value="end" :min="0.05" :max="duration" :step="0.1" addon-before="终点" addon-after="s" @change="syncRange" />
							</div>
							<a-space :size="8" style="margin-top: 8px">
								<a-button size="small" @click="useFull">使用整段</a-button>
								<a-button size="small" @click="useFirst10">前 10 秒</a-button>
							</a-space>
						</div>

						<div class="tool-card block">
							<div class="block-title">输出设置</div>
							<div class="grid">
								<a-select v-model:value="form.mimeType" :options="formatOptions" style="width: 100%" />
								<a-select v-model:value="form.scale" :options="scaleOptions" style="width: 100%" />
								<a-input-number v-model:value="form.fps" :min="10" :max="60" :step="1" addon-before="帧率" />
								<a-input-number v-model:value="form.bitrate" :min="1" :max="40" :step="1" addon-before="码率" addon-after="Mbps" />
							</div>
							<div class="switches">
								<span class="switch-item">
									<a-switch v-model:checked="form.withAudio" size="small" />
									<span class="hint">保留声音</span>
								</span>
							</div>
							<div class="hint" style="margin-top: 8px">
								输出尺寸 {{ outWidth }} × {{ outHeight }}，实际耗时约 {{ segmentDuration.toFixed(1) }} 秒
							</div>
						</div>

						<div class="tool-card block" v-if="busy || progress > 0">
							<div class="block-title">导出进度</div>
							<a-progress :percent="Math.round(progress * 100)" :status="busy ? 'active' : 'success'" />
							<div class="hint">正在实时录制，请勿关闭页面…</div>
						</div>

						<a-alert v-if="errorText" type="error" show-icon :message="errorText" />
					</div>
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<span class="hint">导出会重新编码，需要按实时时长等待；输出格式取决于当前内核对 MediaRecorder 的支持</span>
			<a-space>
				<a-button v-if="source" :disabled="busy" @click="reset">重新选择</a-button>
				<a-button v-if="busy" danger @click="cancel = true">取消</a-button>
				<a-button type="primary" :disabled="!source || busy" :loading="busy" @click="exportSegment">导出片段</a-button>
				<a-button type="primary" ghost :disabled="!resultBytes || busy" @click="saveResult">保存视频</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import { formatBytes } from '@/utils/image'
import { friendlyError, saveBytesAs } from '@/utils/tauriIO'
import { VIDEO_FILTER, formatDuration } from '@/utils/video'
import { drawFullFrame, recordVideoSegment, supportedVideoTypes } from '@/utils/videoExport'
import { useVideoSource } from '@/utils/useVideoSource'

const { source, duration, videoInfo, loading, videoRef, handleFiles, reset } = useVideoSource()

const start = ref(0)
const end = ref(0)
const range = ref([0, 1])
const busy = ref(false)
const cancel = ref(false)
const progress = ref(0)
const errorText = ref('')
const resultUrl = ref(null)
const resultBytes = ref(null)
const resultMime = ref('')

const availableTypes = supportedVideoTypes()
const formatOptions = availableTypes.map(item => ({ label: item.label, value: item.mime }))
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
	withAudio: true,
})

const segmentDuration = computed(() => Math.max(0, range.value[1] - range.value[0]))

const outWidth = computed(() => {
	if (form.scale === 1) return videoInfo.value.width
	const ratio = videoInfo.value.height / (videoInfo.value.width || 1)
	const height = form.scale
	const width = Math.round(height / (ratio || 1))
	return Math.round(width / 2) * 2
})
const outHeight = computed(() => {
	if (form.scale === 1) return videoInfo.value.height
	return Math.round(form.scale / 2) * 2
})

watch(duration, value => {
	if (!value) return
	range.value = [0, Math.min(value, 10)]
	start.value = 0
	end.value = Math.min(value, 10)
})

watch(range, value => {
	start.value = value[0]
	end.value = value[1]
})

const syncRange = () => {
	const from = Math.max(0, Math.min(start.value, duration.value - 0.05))
	const to = Math.max(from + 0.05, Math.min(end.value, duration.value))
	start.value = from
	end.value = to
	range.value = [from, to]
}

const setStart = () => {
	if (!videoRef.value) return
	start.value = Math.round(videoRef.value.currentTime * 100) / 100
	syncRange()
}

const setEnd = () => {
	if (!videoRef.value) return
	end.value = Math.round(videoRef.value.currentTime * 100) / 100
	syncRange()
}

const useFull = () => {
	start.value = 0
	end.value = duration.value
	syncRange()
}

const useFirst10 = () => {
	start.value = 0
	end.value = Math.min(duration.value, 10)
	syncRange()
}

let stopPreview = null
const playSelection = () => {
	const video = videoRef.value
	if (!video) return
	if (stopPreview) {
		stopPreview()
		stopPreview = null
		return
	}
	video.currentTime = range.value[0]
	video.play()
	const limit = range.value[1]
	const check = () => {
		if (video.currentTime >= limit) {
			video.pause()
			stopPreview = null
			return
		}
		stopPreview = requestAnimationFrame(check)
	}
	stopPreview = requestAnimationFrame(check)
}

const exportSegment = async () => {
	if (!source.value || !videoInfo.value.width) {
		message.error('视频还没有加载完成')
		return
	}
	syncRange()
	busy.value = true
	cancel.value = false
	progress.value = 0
	errorText.value = ''
	clearResult()
	try {
		const result = await recordVideoSegment({
			src: source.value.url,
			start: range.value[0],
			end: range.value[1],
			width: outWidth.value,
			height: outHeight.value,
			fps: form.fps,
			mimeType: form.mimeType,
			videoBitsPerSecond: form.bitrate * 1_000_000,
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
		message.success(`导出成功（${formatBytes(result.bytes.length)}）`)
	} catch (err) {
		errorText.value = friendlyError(err)
		message.error(errorText.value)
	} finally {
		busy.value = false
	}
}

const resultInfo = computed(() => {
	const type = availableTypes.find(item => item.mime === resultMime.value)
	return `${type?.label || resultMime.value} · ${outWidth.value} × ${outHeight.value} · ${segmentDuration.value.toFixed(2)}s`
})

const clearResult = () => {
	if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
	resultUrl.value = null
	resultBytes.value = null
}

const saveResult = async () => {
	if (!resultBytes.value) return
	const type = availableTypes.find(item => item.mime === resultMime.value)
	const ext = type?.ext || 'webm'
	try {
		const path = await saveBytesAs(resultBytes.value, {
			defaultPath: `${(source.value?.name || 'video').replace(/\.[^.]+$/, '')}_clip.${ext}`,
			filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

onUnmounted(() => {
	if (stopPreview) cancelAnimationFrame(stopPreview)
	clearResult()
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.videoTrim {
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
	.row-actions {
		margin-top: 10px;
	}
	.range-card {
		margin-top: 12px;
		padding: 8px 16px 4px;
		.range-info {
			display: flex;
			justify-content: space-between;
			font-size: 12px;
			color: rgba(0, 0, 0, 0.6);
			b {
				color: #1677ff;
			}
		}
	}
	.preview {
		margin-top: 16px;
		.preview-head {
			display: flex;
			align-items: baseline;
			justify-content: space-between;
			font-weight: 600;
			color: #262626;
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
			color: #262626;
			margin-bottom: 10px;
		}
		.grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 8px;
		}
		.switches {
			margin-top: 10px;
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
}
</style>
