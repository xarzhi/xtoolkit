<template>
	<div class="tool videoFrame">
		<h1 class="tool-title">
			视频截图
			<span class="tip">从视频里抓取画面存成图片，支持逐帧微调、按间隔批量截图（本地处理，不上传）</span>
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

			<a-spin v-else :spinning="loading || busy">
				<div class="editor">
					<div class="left">
						<div class="stage">
							<video
								ref="videoRef"
								class="video"
								playsinline
								preload="auto"
								@click="playPause"
								@timeupdate="onTimeUpdate"
								@loadedmetadata="syncFromVideo"
							></video>
							<canvas ref="canvasRef" class="hidden-canvas"></canvas>
						</div>

						<div class="hint meta">
							{{ source.name }} · {{ videoInfo.width }}×{{ videoInfo.height }} · 时长
							{{ formatDuration(duration) }} · {{ formatBytes(source.size) }}
						</div>

						<div class="tool-card range-card">
							<a-slider
								v-model:value="currentTime"
								:min="0"
								:max="Math.max(0.01, duration)"
								:step="0.01"
								:tip-formatter="value => formatTime(Number(value))"
								@afterChange="seekTo"
							/>
							<div class="range-info">
								<span>当前 <b>{{ formatTime(currentTime) }}</b></span>
								<span>总时长 {{ formatDuration(duration) }}</span>
							</div>
						</div>

						<a-space :size="8" class="row-actions" wrap>
							<a-button size="small" @click="playPause">{{ playing ? '暂停' : '播放' }}</a-button>
							<a-button size="small" @click="step(-1)">上一帧</a-button>
							<a-button size="small" @click="step(1)">下一帧</a-button>
							<a-button size="small" :disabled="busy" @click="setBatchStart">起点设为当前</a-button>
							<a-button size="small" :disabled="busy" @click="setBatchEnd">终点设为当前</a-button>
						</a-space>

						<div class="tool-card batch-card">
							<div class="block-title">按间隔批量截图</div>
							<div class="grid">
								<a-input-number
									v-model:value="batch.from"
									:min="0"
									:max="Math.max(0, duration)"
									:step="0.5"
									addon-before="起点"
									addon-after="s"
								/>
								<a-input-number
									v-model:value="batch.to"
									:min="0"
									:max="Math.max(0.1, duration)"
									:step="0.5"
									addon-before="终点"
									addon-after="s"
								/>
								<a-input-number
									v-model:value="batch.step"
									:min="0.05"
									:max="600"
									:step="0.5"
									addon-before="间隔"
									addon-after="s"
								/>
								<div class="batch-count hint">将生成 <b>{{ batchCount }}</b> 张</div>
							</div>
							<div class="batch-actions">
								<a-button size="small" :disabled="busy || batchCount === 0" @click="captureBatch">
									开始批量截图
								</a-button>
								<a-button size="small" :disabled="busy" @click="fillBatchFromRoute">用整段视频</a-button>
							</div>
							<a-progress
								v-if="busy"
								:percent="Math.round(batchProgress * 100)"
								status="active"
								:show-info="false"
								style="margin-top: 8px"
							/>
							<div v-if="busy" class="hint">正在逐帧抓取，请勿关闭页面…（本次已完成 {{ shots.length - batchStartCount }} 张）</div>
						</div>
					</div>

					<div class="right">
						<div class="tool-card block">
							<div class="block-title">输出设置</div>
							<div class="grid">
								<a-select v-model:value="form.format" :options="formatOptions" style="width: 100%" />
								<a-input-number v-model:value="form.fps" :min="1" :max="120" :step="1" addon-before="帧率" addon-after="fps" />
							</div>
							<div class="quality" v-if="form.format !== 'png'">
								<span class="hint">质量 {{ form.quality }}</span>
								<a-slider v-model:value="form.quality" :min="10" :max="100" :step="1" />
							</div>
							<div class="hint" style="margin-top: 8px">
								逐帧按钮按 {{ (1 / Math.max(1, form.fps)).toFixed(3) }} 秒跳动；PNG 无损、JPG/WebP 体积更小
							</div>
						</div>

						<div class="tool-card block shots-card">
							<div class="block-title">
								<span>已截取 {{ shots.length }} 张</span>
								<a-button v-if="shots.length" size="small" type="link" danger @click="clearShots">清空</a-button>
							</div>
							<div v-if="!shots.length" class="hint">还没有截图，先播放到想要的画面再点「截取当前画面」</div>
							<div v-else class="shots">
								<div v-for="shot in shots" :key="shot.id" class="shot">
									<img :src="shot.url" :alt="shot.name" @click="previewShot = shot" />
									<div class="shot-meta">
										<span class="time">{{ formatTime(shot.time) }}</span>
										<span class="hint">{{ formatBytes(shot.size) }}</span>
									</div>
									<div class="shot-actions">
										<a-button size="small" type="link" @click="saveShot(shot)">保存</a-button>
										<a-button size="small" type="link" danger @click="removeShot(shot)">删除</a-button>
									</div>
								</div>
							</div>
						</div>

						<a-alert v-if="errorText" type="error" show-icon :message="errorText" />
					</div>
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<span class="hint">截图尺寸与原视频一致；大视频走流式读取，不会整份载入内存</span>
			<a-space>
				<a-button v-if="source" :disabled="busy" @click="reset">重新选择</a-button>
				<a-button v-if="busy" danger @click="cancel = true">取消</a-button>
				<a-button type="primary" :disabled="!source || busy" :loading="capturing" @click="captureCurrent">
					截取当前画面
				</a-button>
				<a-button type="primary" ghost :disabled="!shots.length || busy" @click="saveAll">保存全部</a-button>
			</a-space>
		</div>

		<!-- 点击缩略图看大图 -->
		<a-modal
			:open="!!previewShot"
			:title="previewShot?.name"
			:footer="null"
			width="80%"
			@cancel="previewShot = null"
		>
			<img v-if="previewShot" :src="previewShot.url" style="width: 100%" alt="" />
		</a-modal>
	</div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import { formatBytes } from '@/utils/image'
import { ensureDir, friendlyError, pickDirectory, saveBytesAs, writeBytes } from '@/utils/tauriIO'
import { VIDEO_FILTER, formatDuration, seekVideo } from '@/utils/video'
import { useVideoSource } from '@/utils/useVideoSource'

// useVideoSource 负责选文件 + 流式地址 + 元数据，并把它绑到下面这个 video 元素上
const {
	source,
	duration,
	videoInfo,
	loading,
	videoRef,
	handleFiles: loadSource,
	reset: resetSource,
} = useVideoSource()

const canvasRef = ref(null)
const currentTime = ref(0)
const playing = ref(false)
const capturing = ref(false)
const busy = ref(false)
const cancel = ref(false)
const batchProgress = ref(0)
const batchStartCount = ref(0)
const errorText = ref('')
const previewShot = ref(null)

const form = reactive({ format: 'png', quality: 92, fps: 30 })
const batch = reactive({ from: 0, to: 0, step: 1 })
const shots = ref([])

let shotSeq = 0

const formatOptions = [
	{ label: 'PNG（无损）', value: 'png' },
	{ label: 'JPG（体积小）', value: 'jpg' },
	{ label: 'WebP（体积小）', value: 'webp' },
]

const MIME_BY_FORMAT = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
const EXT_BY_FORMAT = { png: 'png', jpg: 'jpg', webp: 'webp' }

const formatTime = seconds => {
	const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
	const minutes = Math.floor(value / 60)
	const rest = value - minutes * 60
	return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`
}

/** 文件名里的时间戳：00m12s350 */
const timeTag = seconds => {
	const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
	const minutes = Math.floor(value / 60)
	const secs = Math.floor(value - minutes * 60)
	const ms = Math.round((value - Math.floor(value)) * 1000)
	return `${String(minutes).padStart(2, '0')}m${String(secs).padStart(2, '0')}s${String(ms).padStart(3, '0')}`
}

const baseName = computed(() => (source.value?.name || 'video').replace(/\.[^.]+$/, ''))

/** 批量截图一次最多出这么多张，防止一次塞爆内存 */
const MAX_SHOTS = 500

const batchCount = computed(() => {
	const from = Number(batch.from) || 0
	const to = Number(batch.to) || 0
	const stepSeconds = Number(batch.step) || 0
	if (to <= from || stepSeconds <= 0) return 0
	return Math.min(MAX_SHOTS, Math.floor((to - from) / stepSeconds) + 1)
})

const syncFromVideo = () => {
	const video = videoRef.value
	if (!video) return
	if (!duration.value && Number.isFinite(video.duration)) duration.value = video.duration
	if (!batch.to) batch.to = Math.max(0.1, duration.value)
	currentTime.value = video.currentTime
}

const onTimeUpdate = () => {
	const video = videoRef.value
	if (video) currentTime.value = video.currentTime
}

const seekTo = async time => {
	const video = videoRef.value
	if (!video) return
	try {
		await seekVideo(video, time)
		currentTime.value = video.currentTime
	} catch {
		/* 忽略：有些格式 seek 会失败，保持原位置即可 */
	}
}

const playPause = () => {
	const video = videoRef.value
	if (!video) return
	if (video.paused) {
		video.play().catch(() => {})
		playing.value = true
	} else {
		video.pause()
		playing.value = false
	}
}

const step = async direction => {
	const video = videoRef.value
	if (!video) return
	video.pause()
	playing.value = false
	const delta = direction / Math.max(1, Number(form.fps) || 30)
	await seekTo(Math.max(0, Math.min(duration.value || video.duration || 0, video.currentTime + delta)))
}

const setBatchStart = () => {
	batch.from = Math.max(0, Number(currentTime.value) || 0)
	if (batch.to <= batch.from) batch.to = Math.max(batch.from + 0.5, duration.value)
}

const setBatchEnd = () => {
	batch.to = Math.min(duration.value || currentTime.value, Math.max((Number(batch.from) || 0) + 0.05, currentTime.value))
}

/** 把当前帧画到画布并转成图片 */
const grabCurrent = async () => {
	const video = videoRef.value
	const canvas = canvasRef.value
	if (!video || !canvas || !video.videoWidth) return null
	canvas.width = video.videoWidth
	canvas.height = video.videoHeight
	const ctx = canvas.getContext('2d')
	ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
	const mime = MIME_BY_FORMAT[form.format] || 'image/png'
	const quality = form.format === 'png' ? undefined : Math.min(1, Math.max(0.1, Number(form.quality) / 100))
	const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, quality))
	if (!blob) throw new Error('当前内核不支持该图片格式，换 PNG 试试')
	return blob
}

const addShot = async (time, blob) => {
	shotSeq += 1
	shots.value.push({
		id: shotSeq,
		time,
		blob,
		url: URL.createObjectURL(blob),
		size: blob.size,
		name: `${baseName.value}_${timeTag(time)}.${EXT_BY_FORMAT[form.format] || 'png'}`,
	})
}

const captureCurrent = async () => {
	if (!source.value || capturing.value || busy.value) return
	capturing.value = true
	errorText.value = ''
	try {
		const video = videoRef.value
		if (video && !video.paused) {
			video.pause()
			playing.value = false
		}
		const time = video?.currentTime || currentTime.value
		const blob = await grabCurrent()
		if (blob) {
			await addShot(time, blob)
			message.success(`已截取 ${formatTime(time)} 的画面`)
		}
	} catch (err) {
		errorText.value = friendlyError(err)
		message.error(errorText.value)
	} finally {
		capturing.value = false
	}
}

const captureBatch = async () => {
	if (!source.value || busy.value) return
	const video = videoRef.value
	if (!video) return
	errorText.value = ''
	busy.value = true
	cancel.value = false
	batchProgress.value = 0
	batchStartCount.value = shots.value.length
	video.pause()
	playing.value = false
	try {
		const from = Math.max(0, Number(batch.from) || 0)
		const to = Math.min(duration.value || Number(batch.to) || 0, Number(batch.to) || 0)
		const stepSeconds = Math.max(0.05, Number(batch.step) || 1)
		const total = Math.min(MAX_SHOTS, Math.floor((to - from) / stepSeconds) + 1)
		for (let i = 0; i < total; i += 1) {
			if (cancel.value) break
			const time = from + i * stepSeconds
			await seekTo(Math.min(time, Math.max(0, (duration.value || time) - 0.001)))
			const blob = await grabCurrent()
			if (blob) await addShot(time, blob)
			batchProgress.value = (i + 1) / Math.max(1, total)
		}
		if (cancel.value) message.info('已取消批量截图')
		else message.success(`批量截图完成，共新增 ${shots.value.length - batchStartCount.value} 张`)
	} catch (err) {
		errorText.value = friendlyError(err)
		message.error(errorText.value)
	} finally {
		busy.value = false
		batchProgress.value = 0
	}
}

const fillBatchFromRoute = () => {
	batch.from = 0
	batch.to = Math.max(0.1, duration.value)
	if (!Number(batch.step)) batch.step = 1
}

const removeShot = shot => {
	URL.revokeObjectURL(shot.url)
	if (previewShot.value?.id === shot.id) previewShot.value = null
	shots.value = shots.value.filter(item => item.id !== shot.id)
}

const clearShots = () => {
	shots.value.forEach(shot => URL.revokeObjectURL(shot.url))
	shots.value = []
	previewShot.value = null
}

const saveShot = async shot => {
	try {
		const bytes = new Uint8Array(await shot.blob.arrayBuffer())
		const ext = shot.name.split('.').pop()
		const path = await saveBytesAs(bytes, {
			defaultPath: shot.name,
			filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const saveAll = async () => {
	if (!shots.value.length) return
	try {
		const dir = await pickDirectory({ title: '选择保存截图的文件夹' })
		if (!dir) return
		await ensureDir(dir)
		const sep = dir.includes('\\') ? '\\' : '/'
		let saved = 0
		for (const shot of shots.value) {
			const bytes = new Uint8Array(await shot.blob.arrayBuffer())
			await writeBytes(`${dir.replace(/[\\/]+$/, '')}${sep}${shot.name}`, bytes)
			saved += 1
		}
		message.success(`已保存 ${saved} 张到 ${dir}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const handleFiles = async sources => {
	const ok = await loadSource(sources)
	if (ok) {
		currentTime.value = 0
		playing.value = false
		batch.from = 0
		batch.to = Math.max(0.1, duration.value)
	}
	return ok
}

const reset = () => {
	clearShots()
	resetSource()
	currentTime.value = 0
	playing.value = false
	batch.from = 0
	batch.to = 0
}

onUnmounted(() => {
	clearShots()
})

// 开发期测试钩子：脚本里可以直接喂一个本地路径，验证 asset 协议取帧是否正常
if (import.meta.env.DEV) {
	window.__videoFrameTest = {
		handleFiles,
		seekTo,
		captureCurrent,
		captureBatch,
		grabCurrent,
		state: () => ({
			url: source.value?.url || '',
			size: source.value?.size || 0,
			duration: duration.value,
			videoWidth: videoRef.value?.videoWidth || 0,
			currentTime: videoRef.value?.currentTime || 0,
			shots: shots.value.length,
			shotSize: shots.value[0]?.size || 0,
		}),
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.videoFrame {
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
	.stage {
		position: relative;
		border-radius: 8px;
		overflow: hidden;
		background: #000;
	}
	.video {
		width: 100%;
		max-height: 330px;
		background: #000;
		display: block;
		cursor: pointer;
	}
	.hidden-canvas {
		display: none;
	}
	.meta {
		margin-top: 10px;
	}
	.row-actions {
		margin-top: 12px;
	}
	.range-card {
		margin-top: 12px;
		padding: 8px 16px 4px;
		.range-info {
			display: flex;
			justify-content: space-between;
			font-size: 12px;
			color: var(--text-color-3);
			b {
				color: #1677ff;
			}
		}
	}
	.batch-card {
		margin-top: 12px;
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
		.batch-count {
			grid-column: span 2;
		}
		.batch-actions {
			margin-top: 10px;
			display: flex;
			gap: 8px;
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
			display: flex;
			align-items: center;
			justify-content: space-between;
			font-weight: 600;
			color: var(--text-color);
			margin-bottom: 10px;
		}
		.grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 8px;
		}
		:deep(.ant-input-number) {
			width: 100%;
		}
	}
	.quality {
		margin-top: 8px;
	}
	.shots-card {
		.shots {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 10px;
			max-height: 420px;
			overflow: auto;
		}
		.shot {
			border: 1px solid var(--border-color);
			border-radius: 8px;
			padding: 6px;
			background: var(--panel-bg);
			img {
				width: 100%;
				border-radius: 5px;
				display: block;
				cursor: zoom-in;
			}
			.shot-meta {
				display: flex;
				justify-content: space-between;
				align-items: baseline;
				margin-top: 4px;
				font-size: 12px;
				.time {
					color: var(--text-color);
				}
			}
			.shot-actions {
				display: flex;
				justify-content: space-between;
			}
		}
	}
}
</style>
