<template>
	<div class="tool videoCrop">
		<h1 class="tool-title">
			视频裁剪
			<span class="tip">框选画面区域并导出为新视频，支持常用比例与自定义输出尺寸</span>
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
					<div class="stage-wrap" ref="containerRef">
						<div class="stage" ref="stageRef" :style="stageStyle">
							<video ref="videoRef" class="video" controls playsinline preload="auto"></video>
							<div class="crop-box" :style="boxStyle" @mousedown.stop="startDrag($event, 'move')">
								<div
									v-for="handle in handles"
									:key="handle"
									:class="['handle', handle]"
									@mousedown.stop="startDrag($event, 'resize', handle)"
								></div>
								<div class="size-tag">{{ crop.width }} × {{ crop.height }}</div>
							</div>
						</div>
						<div class="hint meta">
							{{ source.name }} · 原片 {{ videoInfo.width }} × {{ videoInfo.height }} · 时长 {{ formatDuration(duration) }}
						</div>
						<a-space :size="8" class="row-actions" wrap>
							<a-button size="small" :disabled="busy" @click="setStart">用当前时间作起点</a-button>
							<a-button size="small" :disabled="busy" @click="useFull">使用整段</a-button>
						</a-space>
						<div class="preview" v-if="resultUrl">
							<div class="preview-head">
								<span>导出结果</span>
								<span class="hint">{{ formatBytes(resultBytes.length) }} · {{ outWidth }} × {{ outHeight }}</span>
							</div>
							<video :src="resultUrl" class="result-video" controls playsinline></video>
						</div>
					</div>

					<div class="panel">
						<div class="tool-card block">
							<div class="block-title">裁剪比例</div>
							<a-radio-group v-model:value="ratioKey" size="small" @change="applyRatio">
								<a-radio-button v-for="item in CROP_RATIOS" :key="item.value" :value="item.value">
									{{ item.label }}
								</a-radio-button>
							</a-radio-group>
						</div>

						<div class="tool-card block">
							<div class="block-title">裁剪区域（原片像素）</div>
							<div class="grid">
								<a-input-number v-model:value="crop.x" :min="0" :max="Math.max(0, videoInfo.width - crop.width)" addon-before="X" @change="normalizeCrop" />
								<a-input-number v-model:value="crop.y" :min="0" :max="Math.max(0, videoInfo.height - crop.height)" addon-before="Y" @change="normalizeCrop" />
								<a-input-number v-model:value="crop.width" :min="16" :max="videoInfo.width" addon-before="宽" @change="() => onSizeChange('width')" />
								<a-input-number v-model:value="crop.height" :min="16" :max="videoInfo.height" addon-before="高" @change="() => onSizeChange('height')" />
							</div>
							<a-space :size="8" style="margin-top: 10px">
								<a-button size="small" @click="maxCrop">占满</a-button>
								<a-button size="small" @click="centerCrop">居中</a-button>
								<a-button size="small" @click="resetCrop">重置</a-button>
							</a-space>
						</div>

						<div class="tool-card block">
							<div class="block-title">输出</div>
							<a-radio-group v-model:value="outMode" size="small">
								<a-radio-button value="crop">跟随裁剪尺寸</a-radio-button>
								<a-radio-button value="custom">自定义尺寸</a-radio-button>
							</a-radio-group>
							<div class="grid" v-if="outMode === 'custom'" style="margin-top: 8px">
								<a-input-number v-model:value="outSize.width" :min="16" :max="4096" addon-before="宽" @change="() => onOutSizeChange('width')" />
								<a-input-number v-model:value="outSize.height" :min="16" :max="4096" addon-before="高" @change="() => onOutSizeChange('height')" />
							</div>
							<a-checkbox v-if="outMode === 'custom'" v-model:checked="keepOutRatio" style="margin-top: 8px">锁定宽高比</a-checkbox>
							<div class="hint" style="margin-top: 6px">实际输出 {{ outWidth }} × {{ outHeight }}</div>
						</div>

						<div class="tool-card block">
							<div class="block-title">时间与编码</div>
							<div class="grid">
								<a-input-number v-model:value="form.start" :min="0" :max="Math.max(0, duration - 0.05)" :step="0.1" addon-before="起点" addon-after="s" @change="syncTime" />
								<a-input-number v-model:value="form.seconds" :min="0.1" :max="duration || 0.1" :step="0.1" addon-before="时长" addon-after="s" @change="syncTime" />
								<a-select v-model:value="form.mimeType" :options="formatOptions" style="width: 100%" />
								<a-input-number v-model:value="form.bitrate" :min="1" :max="40" :step="1" addon-before="码率" addon-after="Mbps" />
								<a-input-number v-model:value="form.fps" :min="10" :max="60" :step="1" addon-before="帧率" />
								<span class="switch-item">
									<a-switch v-model:checked="form.withAudio" size="small" />
									<span class="hint">保留声音</span>
								</span>
							</div>
							<div class="hint" style="margin-top: 8px">
								实时录制，预计耗时约 {{ clipSeconds.toFixed(1) }} 秒
							</div>
						</div>

						<div class="tool-card block" v-if="busy || progress > 0">
							<div class="block-title">导出进度</div>
							<a-progress :percent="Math.round(progress * 100)" :status="busy ? 'active' : 'success'" />
						</div>

						<a-alert v-if="errorText" type="error" show-icon :message="errorText" />
					</div>
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<span class="hint">拖动画框可移动，拖角/边可缩放；比例锁定时仅四角可拉伸</span>
			<a-space>
				<a-button v-if="source" :disabled="busy" @click="reset">重新选择</a-button>
				<a-button v-if="busy" danger @click="cancel = true">取消</a-button>
				<a-button type="primary" :disabled="!source || busy" :loading="busy" @click="exportCropped">导出裁剪视频</a-button>
				<a-button type="primary" ghost :disabled="!resultBytes || busy" @click="saveResult">保存视频</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import {
	CROP_RATIOS,
	MIN_CROP,
	clampRect,
	fitRectToRatio,
	formatBytes,
	moveRect,
	resizeRectFree,
	resizeRectLocked,
} from '@/utils/image'
import { friendlyError, saveBytesAs } from '@/utils/tauriIO'
import { VIDEO_FILTER, formatDuration } from '@/utils/video'
import { makeCropDrawer, recordVideoSegment, supportedVideoTypes } from '@/utils/videoExport'
import { useVideoSource } from '@/utils/useVideoSource'
import { useFitBox } from '@/utils/useFitBox'

const { source, duration, videoInfo, loading, videoRef, handleFiles, reset } = useVideoSource()
/** 按视频真实宽高比计算显示尺寸，避免被 CSS 压扁导致裁剪框与画面对不上 */
const { containerRef, fit } = useFitBox({ maxWidth: 900, maxHeight: 520 })

const stageRef = ref(null)
const crop = reactive({ x: 0, y: 0, width: 0, height: 0 })
const outSize = reactive({ width: 0, height: 0 })
const ratioKey = ref('free')
const outMode = ref('crop')
const keepOutRatio = ref(true)

const busy = ref(false)
const cancel = ref(false)
const progress = ref(0)
const errorText = ref('')
const resultUrl = ref(null)
const resultBytes = ref(null)
const resultMime = ref('')

const availableTypes = supportedVideoTypes()
const formatOptions = availableTypes.map(item => ({ label: item.label, value: item.mime }))
const form = reactive({
	start: 0,
	seconds: 0,
	mimeType: availableTypes[0]?.mime || 'video/webm',
	bitrate: 8,
	fps: 30,
	withAudio: true,
})

const currentRatio = computed(() => CROP_RATIOS.find(i => i.value === ratioKey.value)?.ratio ?? null)

const stageStyle = computed(() => {
	if (!videoInfo.value.width) return {}
	return fit(videoInfo.value.width, videoInfo.value.height)
})

const boxStyle = computed(() => {
	const info = videoInfo.value
	if (!info.width) return {}
	return {
		left: `${(crop.x / info.width) * 100}%`,
		top: `${(crop.y / info.height) * 100}%`,
		width: `${(crop.width / info.width) * 100}%`,
		height: `${(crop.height / info.height) * 100}%`,
	}
})

const handles = computed(() => (currentRatio.value ? ['nw', 'ne', 'se', 'sw'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']))

const outWidth = computed(() => {
	if (outMode.value === 'crop') return even(crop.width)
	return even(Math.max(16, Math.round(outSize.width)))
})
const outHeight = computed(() => {
	if (outMode.value === 'crop') return even(crop.height)
	return even(Math.max(16, Math.round(outSize.height)))
})
const even = value => Math.max(2, Math.round(value / 2) * 2)

const clipSeconds = computed(() => {
	const from = Math.max(0, form.start)
	const to = Math.min(duration.value || from + form.seconds, from + Math.max(0.1, form.seconds))
	return Math.max(0.1, to - from)
})

watch(
	videoInfo,
	info => {
		if (!info.width) return
		ratioKey.value = 'free'
		outMode.value = 'crop'
		Object.assign(crop, fitRectToRatio(info.width, info.height, null))
		Object.assign(outSize, { width: info.width, height: info.height })
		form.start = 0
		form.seconds = Math.min(10, duration.value || 10)
	}
)

/* ---------------- 裁剪操作 ---------------- */

const bounds = () => ({ width: videoInfo.value.width, height: videoInfo.value.height })

const normalizeCrop = () => Object.assign(crop, clampRect(crop, bounds().width, bounds().height, MIN_CROP))
const maxCrop = () => Object.assign(crop, fitRectToRatio(bounds().width, bounds().height, currentRatio.value))
const centerCrop = () =>
	Object.assign(
		crop,
		clampRect(
			{ x: (bounds().width - crop.width) / 2, y: (bounds().height - crop.height) / 2, width: crop.width, height: crop.height },
			bounds().width,
			bounds().height,
			MIN_CROP
		)
	)
const resetCrop = () => {
	Object.assign(crop, fitRectToRatio(bounds().width, bounds().height, null))
	ratioKey.value = 'free'
}
const applyRatio = () => Object.assign(crop, fitRectToRatio(bounds().width, bounds().height, currentRatio.value, { ...crop }))

const onSizeChange = changed => {
	const ratio = currentRatio.value
	if (ratio) {
		if (changed === 'width') crop.height = Math.round(crop.width / ratio)
		else crop.width = Math.round(crop.height * ratio)
	}
	normalizeCrop()
}

const onOutSizeChange = changed => {
	if (!keepOutRatio.value || !crop.width || !crop.height) return
	const ratio = crop.width / crop.height
	if (changed === 'width') outSize.height = Math.round(outSize.width / ratio)
	else outSize.width = Math.round(outSize.height * ratio)
}

const drag = ref(null)
const toVideoPoint = event => {
	const rect = stageRef.value.getBoundingClientRect()
	const scaleX = videoInfo.value.width / rect.width
	const scaleY = videoInfo.value.height / rect.height
	return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY }
}

const startDrag = (event, mode, handle) => {
	if (!source.value || event.button !== 0) return
	event.preventDefault()
	drag.value = { mode, handle, startCrop: { ...crop }, startPoint: toVideoPoint(event) }
	window.addEventListener('mousemove', onDragMove)
	window.addEventListener('mouseup', endDrag)
}

const onDragMove = event => {
	const current = drag.value
	if (!current) return
	const point = toVideoPoint(event)
	if (current.mode === 'move') {
		Object.assign(crop, moveRect(current.startCrop, point.x - current.startPoint.x, point.y - current.startPoint.y, bounds()))
	} else if (currentRatio.value) {
		Object.assign(crop, resizeRectLocked(current.handle, point, current.startCrop, currentRatio.value, bounds(), 16))
	} else {
		Object.assign(crop, resizeRectFree(current.handle, point.x - current.startPoint.x, point.y - current.startPoint.y, current.startCrop, bounds(), 16))
	}
}

const endDrag = () => {
	drag.value = null
	window.removeEventListener('mousemove', onDragMove)
	window.removeEventListener('mouseup', endDrag)
}

onUnmounted(() => {
	endDrag()
	clearResult()
})

const syncTime = () => {
	form.start = Math.max(0, Math.min(form.start, Math.max(0, duration.value - 0.05)))
	const maxSeconds = Math.max(0.1, (duration.value || form.seconds) - form.start)
	form.seconds = Math.max(0.1, Math.min(form.seconds, maxSeconds))
}

const setStart = () => {
	if (!videoRef.value) return
	form.start = Math.round(videoRef.value.currentTime * 100) / 100
	syncTime()
}

const useFull = () => {
	form.start = 0
	form.seconds = duration.value
	syncTime()
}

/* ---------------- 导出 ---------------- */

const clearResult = () => {
	if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
	resultUrl.value = null
	resultBytes.value = null
}

const exportCropped = async () => {
	if (!source.value || !videoInfo.value.width) {
		message.error('视频还没有加载完成')
		return
	}
	normalizeCrop()
	busy.value = true
	cancel.value = false
	progress.value = 0
	errorText.value = ''
	clearResult()
	try {
		const from = Math.max(0, form.start)
		const to = Math.min(duration.value || from + form.seconds, from + Math.max(0.1, form.seconds))
		const result = await recordVideoSegment({
			src: source.value.url,
			start: from,
			end: to,
			width: outWidth.value,
			height: outHeight.value,
			fps: form.fps,
			mimeType: form.mimeType,
			videoBitsPerSecond: form.bitrate * 1_000_000,
			withAudio: form.withAudio,
			drawFrame: makeCropDrawer({ ...crop }, videoInfo.value.width, videoInfo.value.height),
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

const saveResult = async () => {
	if (!resultBytes.value) return
	const type = availableTypes.find(item => item.mime === resultMime.value)
	const ext = type?.ext || 'webm'
	try {
		const path = await saveBytesAs(resultBytes.value, {
			defaultPath: `${(source.value?.name || 'video').replace(/\.[^.]+$/, '')}_crop.${ext}`,
			filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.videoCrop {
	.editor {
		display: flex;
		gap: 20px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.stage-wrap {
		flex: 1;
		min-width: 340px;
		display: flex;
		flex-flow: column;
	}
	.stage {
		position: relative;
		overflow: hidden;
		border-radius: 8px;
		background: #000;
		line-height: 0;
		margin: 0 auto;
		.video {
			display: block;
			width: 100%;
			height: 100%;
			object-fit: contain;
			pointer-events: none;
		}
		.crop-box {
			position: absolute;
			box-sizing: border-box;
			border: 1px solid #fff;
			box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
			cursor: move;
			.size-tag {
				position: absolute;
				left: 0;
				top: -24px;
				padding: 0 6px;
				font-size: 12px;
				line-height: 20px;
				color: #fff;
				background: rgba(0, 0, 0, 0.55);
				border-radius: 4px;
				white-space: nowrap;
			}
			.handle {
				position: absolute;
				width: 10px;
				height: 10px;
				background: #fff;
				border: 1px solid #1677ff;
				border-radius: 2px;
				box-sizing: border-box;
			}
			.handle.nw { left: -5px; top: -5px; cursor: nwse-resize; }
			.handle.n { left: 50%; margin-left: -5px; top: -5px; cursor: ns-resize; }
			.handle.ne { right: -5px; top: -5px; cursor: nesw-resize; }
			.handle.e { right: -5px; top: 50%; margin-top: -5px; cursor: ew-resize; }
			.handle.se { right: -5px; bottom: -5px; cursor: nwse-resize; }
			.handle.s { left: 50%; margin-left: -5px; bottom: -5px; cursor: ns-resize; }
			.handle.sw { left: -5px; bottom: -5px; cursor: nesw-resize; }
			.handle.w { left: -5px; top: 50%; margin-top: -5px; cursor: ew-resize; }
		}
	}
	.meta {
		margin-top: 10px;
	}
	.row-actions {
		margin-top: 10px;
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
		.result-video {
			width: 100%;
			max-height: 300px;
			background: #000;
			border-radius: 8px;
		}
	}
	.panel {
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
		.switch-item {
			display: inline-flex;
			align-items: center;
			gap: 6px;
		}
		:deep(.ant-input-number) {
			width: 100%;
		}
	}
}
</style>
