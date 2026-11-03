<template>
	<div class="tool videoCompress">
		<h1 class="tool-title">
			视频压缩
			<span class="tip">降分辨率 / 降帧率 / 降码率三管齐下，也可以直接指定目标体积</span>
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
							message="压缩由浏览器内核重新编码完成（实时速度：耗时≈视频时长），转换期间请保持页面在前台。想要更小的体积，就降分辨率或降码率。"
						/>
						<div class="preview" v-if="resultUrl">
							<div class="preview-head">
								<span>压缩结果</span>
								<span class="hint">{{ formatBytes(resultBytes.length) }} · {{ outWidth }} × {{ outHeight }}</span>
							</div>
							<video :src="resultUrl" class="video" controls playsinline></video>
						</div>
					</div>

					<div class="right">
						<div class="tool-card block">
							<div class="block-title">压缩方式</div>
							<a-radio-group v-model:value="form.mode" size="small" button-style="solid">
								<a-radio-button value="preset">按档位</a-radio-button>
								<a-radio-button value="size">按目标体积</a-radio-button>
							</a-radio-group>

							<template v-if="form.mode === 'preset'">
								<div class="preset-row">
									<a-button
										v-for="item in PRESETS"
										:key="item.value"
										size="small"
										:type="form.preset === item.value ? 'primary' : 'default'"
										@click="applyPreset(item.value)"
									>
										{{ item.label }}
									</a-button>
								</div>
								<div class="hint">{{ currentPreset?.desc }}</div>
							</template>

							<template v-else>
								<div class="row" style="margin-top: 10px">
									<span class="label">目标体积</span>
									<a-input-number
										v-model:value="form.targetMB"
										:min="1"
										:max="4096"
										:step="1"
										addon-after="MB"
										style="width: 150px"
										@change="syncBitrateFromTarget"
									/>
									<span class="hint">原文件 {{ formatBytes(source?.size || 0) }}</span>
								</div>
								<div class="hint" style="margin-top: 6px">
									已换算成视频码率 {{ effectiveBitrate.toFixed(2) }} Mbps（扣除音频后自动分配），实际体积会有少量偏差
								</div>
							</template>
						</div>

						<div class="tool-card block">
							<div class="block-title">画面</div>
							<div class="grid">
								<a-select v-model:value="form.scale" :options="scaleOptions" style="width: 100%" />
								<a-select v-model:value="form.fps" :options="fpsOptions" style="width: 100%" />
							</div>
							<div class="hint" style="margin-top: 6px">输出尺寸 {{ outWidth }} × {{ outHeight }}</div>
							<div class="row" style="margin-top: 10px">
								<span class="label">视频码率</span>
								<a-slider
									v-model:value="form.bitrate"
									:min="0.2"
									:max="20"
									:step="0.1"
									class="slider"
									:disabled="form.mode === 'size'"
								/>
								<span class="hint value">{{ form.bitrate.toFixed(1) }} Mbps</span>
							</div>
						</div>

						<div class="tool-card block">
							<div class="block-title">声音</div>
							<div class="switches">
								<span class="switch-item">
									<a-switch v-model:checked="form.withAudio" size="small" />
									<span class="hint">保留声音</span>
								</span>
								<span class="hint">静音能再省一点体积</span>
							</div>
							<div class="row" style="margin-top: 10px" v-if="form.withAudio">
								<span class="label">音频码率</span>
								<a-slider v-model:value="form.audioBitrate" :min="32" :max="192" :step="16" class="slider" />
								<span class="hint value">{{ form.audioBitrate }} kbps</span>
							</div>
						</div>

						<div class="tool-card block" v-if="source">
							<div class="block-title">体积预估</div>
							<div class="result-row">
								<span class="hint">原文件</span>
								<span class="strong">{{ formatBytes(source.size) }}</span>
							</div>
							<div class="result-row">
								<span class="hint">预计输出</span>
								<span class="strong">约 {{ formatBytes(estimateBytes) }}</span>
							</div>
							<div class="result-row">
								<span class="hint">预计压缩</span>
								<span class="strong" :class="estimateRate > 0 ? 'ok' : 'warn'">
									{{ estimateRate > 0 ? `减小 ${estimateRate.toFixed(0)}%` : '收益有限（源文件码率已经很低）' }}
								</span>
							</div>
							<div class="hint" style="margin-top: 8px" v-if="cappedByResolution">
								按 {{ estimateBitrate.toFixed(1) }} Mbps 估算 —— 这个分辨率再往上加码率基本是浪费，编码器用不到
							</div>
						</div>

						<div class="tool-card block" v-if="busy || progress > 0">
							<div class="block-title">压缩进度</div>
							<a-progress :percent="Math.round(progress * 100)" :status="busy ? 'active' : 'success'" />
							<div class="hint">正在实时重新编码，请保持页面打开…</div>
						</div>

						<a-alert v-if="errorText" type="error" show-icon :message="errorText" />
					</div>
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<span class="hint">压缩后画质会下降，属于正常现象；只想切片段请用「视频截取」</span>
			<a-space>
				<a-button v-if="source" :disabled="busy" @click="reset">重新选择</a-button>
				<a-button v-if="busy" danger @click="cancel = true">取消</a-button>
				<a-button type="primary" :disabled="!source || busy" :loading="busy" @click="compress">开始压缩</a-button>
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

const { source, duration, videoInfo, loading, videoRef, handleFiles, reset: resetSource } = useVideoSource()

const busy = ref(false)
const cancel = ref(false)
const progress = ref(0)
const errorText = ref('')
const resultUrl = ref(null)
const resultBytes = ref(null)
const resultMime = ref('')

const availableTypes = supportedVideoTypes()
/** 压缩统一输出 MP4(H.264)，内核不支持时退回 WebM */
const outputType =
	availableTypes.find(item => item.ext === 'mp4') || availableTypes.find(item => item.ext === 'webm') || availableTypes[0]

const PRESETS = [
	{ value: 'light', label: '轻度', desc: '画质几乎无损，体积约降到原来的 50%~70%', scale: 1, fps: 30, bitrate: 6 },
	{ value: 'normal', label: '标准', desc: '降到 720p，日常分享足够，体积约降到 1/3', scale: 720, fps: 30, bitrate: 2.5 },
	{ value: 'strong', label: '强力', desc: '降到 480p，体积可降到 1/8，适合发群里', scale: 480, fps: 24, bitrate: 1 },
]

const fpsOptions = [
	{ label: '原始帧率（按 30）', value: 30 },
	{ label: '60 fps', value: 60 },
	{ label: '24 fps', value: 24 },
	{ label: '15 fps', value: 15 },
]
const scaleOptions = [
	{ label: '原始分辨率', value: 1 },
	{ label: '1080p', value: 1080 },
	{ label: '720p', value: 720 },
	{ label: '480p', value: 480 },
	{ label: '360p', value: 360 },
]

const form = reactive({
	mode: 'preset',
	preset: 'normal',
	scale: 720,
	fps: 30,
	bitrate: 2.5,
	audioBitrate: 96,
	withAudio: true,
	targetMB: 20,
})

const currentPreset = computed(() => PRESETS.find(item => item.value === form.preset))

/** 目标体积模式下，码率由体积反算，不允许手动改 */
const effectiveBitrate = computed(() => {
	if (form.mode !== 'size') return form.bitrate
	const seconds = duration.value || 0
	if (!seconds) return form.bitrate
	const audio = form.withAudio ? form.audioBitrate / 1000 : 0
	// 留 4% 余量给封装开销，别一上来就超标
	const total = (form.targetMB * 8 * 1_000_000 * 0.96) / seconds / 1_000_000
	return Math.min(20, Math.max(0.15, total - audio))
})

/** 输出尺寸：只降不升，并且保证是偶数（H.264 要求） */
const outHeight = computed(() => {
	const height = videoInfo.value.height || 0
	if (!height) return 0
	if (form.scale === 1) return Math.round(height / 2) * 2
	return Math.round(Math.min(height, form.scale) / 2) * 2
})
const outWidth = computed(() => {
	const width = videoInfo.value.width || 0
	const height = videoInfo.value.height || 0
	if (!width || !height) return 0
	return Math.round((outHeight.value * (width / height)) / 2) * 2
})

/** 该分辨率下编码器实际能「吃下」的码率上限（经验值 0.08 bit/像素/帧），用来把预估拉回现实 */
const resolutionCap = computed(() => {
	const pixels = outWidth.value * outHeight.value
	if (!pixels) return 20
	return Math.max(0.3, Math.min(20, (pixels * form.fps * 0.08) / 1_000_000))
})

/** 预估用的码率：目标体积模式直接按换算值，档位模式再被分辨率上限收一下 */
const estimateBitrate = computed(() => {
	if (form.mode === 'size') return effectiveBitrate.value
	return Math.min(effectiveBitrate.value, resolutionCap.value)
})
const cappedByResolution = computed(() => form.mode !== 'size' && estimateBitrate.value < effectiveBitrate.value)

const estimateBytes = computed(() => {
	const seconds = duration.value || 0
	const audio = form.withAudio ? form.audioBitrate / 1000 : 0
	return ((estimateBitrate.value + audio) * 1_000_000 * seconds) / 8
})
const estimateRate = computed(() => {
	const before = source.value?.size || 0
	if (!before || !estimateBytes.value) return 0
	return (1 - estimateBytes.value / before) * 100
})

const applyPreset = value => {
	const preset = PRESETS.find(item => item.value === value)
	if (!preset) return
	form.preset = value
	form.scale = preset.scale
	form.fps = preset.fps
	form.bitrate = preset.bitrate
}

const syncBitrateFromTarget = () => {
	form.bitrate = Number(effectiveBitrate.value.toFixed(1))
}

const clearResult = () => {
	if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
	resultUrl.value = null
	resultBytes.value = null
}

const compress = async () => {
	if (!source.value || !videoInfo.value.width) {
		message.error('视频还没有加载完成')
		return
	}
	if (!outputType) {
		message.error('当前内核不支持任何视频录制格式，无法压缩')
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
			mimeType: outputType.mime,
			videoBitsPerSecond: Math.round(effectiveBitrate.value * 1_000_000),
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
		const rate = (1 - result.bytes.length / (source.value.size || 1)) * 100
		if (rate > 0) {
			message.success(`压缩完成：${formatBytes(result.bytes.length)}，减小 ${rate.toFixed(0)}%`)
		} else {
			message.warning(`压缩完成，但体积比原文件大了 ${Math.abs(rate).toFixed(0)}%，建议降低码率或分辨率`)
		}
	} catch (err) {
		errorText.value = friendlyError(err)
		message.error(errorText.value)
	} finally {
		busy.value = false
	}
}

const saveResult = async () => {
	if (!resultBytes.value) return
	const ext = outputType?.ext || 'webm'
	try {
		const path = await saveBytesAs(resultBytes.value, {
			defaultPath: `${(source.value?.name || 'video').replace(/\.[^.]+$/, '')}_compressed.${ext}`,
			filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const reset = () => {
	resetSource()
	clearResult()
	progress.value = 0
	errorText.value = ''
}

onUnmounted(clearResult)

/* 开发期探针：无头浏览器里塞真实视频进来跑一遍压缩（生产构建不会包含） */
if (import.meta.env.DEV) {
	window.__videoCompressTest = {
		load: file => handleFiles([file]),
		compress,
		set: patch => Object.assign(form, patch),
		applyPreset,
		state: () => ({
			duration: duration.value,
			width: videoInfo.value.width,
			height: videoInfo.value.height,
			outWidth: outWidth.value,
			outHeight: outHeight.value,
			bitrate: Number(effectiveBitrate.value.toFixed(2)),
			estimateBitrate: Number(estimateBitrate.value.toFixed(2)),
			capped: cappedByResolution.value,
			estimate: Math.round(estimateBytes.value),
			sourceSize: source.value?.size || 0,
			resultSize: resultBytes.value?.length || 0,
			progress: Number(progress.value.toFixed(2)),
			error: errorText.value,
			hasResult: !!resultBytes.value,
		}),
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.videoCompress {
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
			display: flex;
			align-items: center;
			justify-content: space-between;
			.switch-item {
				display: inline-flex;
				align-items: center;
				gap: 6px;
			}
		}
	}
	.preset-row {
		display: flex;
		gap: 8px;
		margin: 10px 0 8px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.label {
		font-size: 13px;
		color: var(--text-color-3);
		white-space: nowrap;
	}
	.slider {
		flex: 1;
		min-width: 90px;
		margin: 0 4px;
	}
	.value {
		width: 74px;
		text-align: right;
		white-space: nowrap;
	}
	.result-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		& + .result-row {
			margin-top: 8px;
		}
		.strong {
			font-size: 13px;
			font-weight: 600;
			color: var(--text-color);
			&.ok {
				color: #52c41a;
			}
			&.warn {
				color: #fa8c16;
			}
		}
	}
}
</style>
