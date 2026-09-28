<template>
	<div class="tool videoToGif">
		<h1 class="tool-title">
			视频转 GIF
			<span class="tip">本地逐帧提取并编码，不上传；建议片段 5 秒以内、宽度 480 左右</span>
		</h1>

		<div class="tool-content">
			<Selector
				v-if="!source"
				title="点击选择视频，或拖拽到此处"
				desc="支持 MP4 / WebM / MOV 等浏览器可解码的格式"
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
							<a-button size="small" :disabled="!gifUrl || busy" @click="seekTo(form.start)">回到起点</a-button>
						</a-space>
						<div class="preview" v-if="gifUrl">
							<div class="preview-head">
								<span>GIF 预览</span>
								<span class="hint">{{ formatBytes(gifBytes.length) }} · {{ frameCount }} 帧 · {{ outWidth }} × {{ outHeight }}</span>
							</div>
							<img :src="gifUrl" alt="gif preview" />
						</div>
					</div>

					<div class="right">
						<div class="tool-card block">
							<div class="block-title">片段时间</div>
							<div class="grid">
								<a-input-number v-model:value="form.start" :min="0" :max="Math.max(0, duration)" :step="0.1" addon-before="起点" addon-after="s" />
								<a-input-number v-model:value="form.duration" :min="0.1" :max="Math.max(0.1, duration)" :step="0.1" addon-before="时长" addon-after="s" />
							</div>
							<div class="hint">实际范围 {{ rangeText }}</div>
						</div>

						<div class="tool-card block">
							<div class="block-title">输出设置</div>
							<div class="grid">
								<a-select v-model:value="form.fps" :options="fpsOptions" style="width: 100%" />
								<a-input-number v-model:value="form.width" :min="80" :max="1280" :step="20" addon-before="宽" addon-after="px" />
								<a-select v-model:value="form.colors" :options="colorOptions" style="width: 100%" />
							</div>
							<div class="switches">
								<a-space :size="16" align="center">
									<span class="switch-item">
										<a-switch v-model:checked="form.dither" size="small" />
										<span class="hint">颜色抖动（画质更好，体积略大）</span>
									</span>
									<span class="switch-item">
										<a-switch v-model:checked="form.infinity" size="small" />
										<span class="hint">无限循环</span>
									</span>
								</a-space>
							</div>
							<div class="hint" style="margin-top: 8px">
								将生成 {{ frameCount }} 帧（{{ outWidth }} × {{ outHeight }}），预计文件
								{{ formatBytes(estimateBytes) }} 左右
							</div>
						</div>

						<div class="tool-card block" v-if="busy || stageText">
							<div class="block-title">处理进度</div>
							<a-progress :percent="progress" :status="progressStatus" />
							<div class="hint">{{ stageText }}</div>
						</div>

						<a-alert v-if="errorText" type="error" show-icon :message="errorText" />
					</div>
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<span class="hint">
				逐帧解码 + 自研 GIF 编码，帧数越多越慢；先「生成 GIF」再「保存 GIF」
			</span>
			<a-space>
				<a-button v-if="source" :disabled="busy" @click="reset">重新选择</a-button>
				<a-button v-if="source && busy" danger @click="cancel = true">取消</a-button>
				<a-button type="primary" :disabled="!source || busy" :loading="busy" @click="convert">生成 GIF</a-button>
				<a-button type="primary" ghost :disabled="!gifBytes || busy" @click="saveGif">保存 GIF</a-button>
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
import { VIDEO_FILTER, createVideoElement, formatDuration, grabFrame, seekVideo } from '@/utils/video'
import { GifBuilder } from '@/utils/gif'

/** 单个 GIF 的帧数上限，避免卡死或内存爆掉 */
const MAX_FRAMES = 400
/** 调色板采样点数量 */
const SAMPLE_POINTS = 12

const source = ref(null)
const loading = ref(false)
const busy = ref(false)
const cancel = ref(false)
const videoRef = ref(null)
const duration = ref(0)
const progress = ref(0)
const stageText = ref('')
const errorText = ref('')
const gifBytes = ref(null)
const gifUrl = ref(null)
const frameCount = ref(0)
const outWidth = ref(0)
const outHeight = ref(0)
const videoInfo = ref({ width: 0, height: 0 })

const form = reactive({
	start: 0,
	duration: 3,
	fps: 10,
	width: 480,
	colors: 256,
	dither: true,
	infinity: true,
})

const fpsOptions = [5, 8, 10, 12, 15, 20, 24].map(v => ({ label: `${v} 帧/秒`, value: v }))
const colorOptions = [
	{ label: '256 色（推荐）', value: 256 },
	{ label: '128 色（更小）', value: 128 },
	{ label: '64 色（最小）', value: 64 },
]

const rangeText = computed(() => {
	const start = Math.max(0, Math.min(form.start, Math.max(0, duration.value - 0.05)))
	const end = Math.min(duration.value || 0, start + Math.max(0.1, form.duration))
	return `${start.toFixed(2)}s ~ ${end.toFixed(2)}s`
})

const targetFrames = computed(() => {
	const start = Math.max(0, form.start)
	const end = Math.min(duration.value || 0, start + Math.max(0.1, form.duration))
	return Math.max(1, Math.floor(Math.max(0, end - start) * form.fps))
})

const estimateBytes = computed(() => Math.round(outWidth.value * outHeight.value * targetFrames.value * 0.45))

const progressStatus = computed(() => (busy.value ? 'active' : gifBytes.value ? 'success' : 'normal'))

/* ---------------- 载入 ---------------- */

const handleFiles = async sources => {
	const list = (Array.isArray(sources) ? sources : [sources]).filter(Boolean).slice(0, 1)
	if (!list.length) return
	loading.value = true
	errorText.value = ''
	try {
		const bytes = await readSourceBytes(list[0])
		const name = typeof list[0] === 'string' ? list[0].split(/[\\/]/).pop() : list[0].name
		const blobUrl = URL.createObjectURL(new Blob([bytes]))
		const info = await createVideoElement(blobUrl)
		if (source.value?.url) URL.revokeObjectURL(source.value.url)
		clearGif()
		source.value = { name, url: blobUrl, size: bytes.length }
		videoInfo.value = { width: info.videoWidth, height: info.videoHeight }
		duration.value = Number.isFinite(info.duration) ? info.duration : 0
		// 释放临时解码器
		info.removeAttribute('src')
		info.load()
		form.start = 0
		form.duration = Math.min(5, Math.max(0.5, duration.value || 3))
		// 默认宽度不超过原视频宽度
		form.width = Math.min(480, info.videoWidth || 480)
		await new Promise(resolve => {
			requestAnimationFrame(() => {
				if (videoRef.value) {
					videoRef.value.src = blobUrl
					videoRef.value.onloadeddata = () => resolve()
					setTimeout(resolve, 1500)
				} else resolve()
			})
		})
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		loading.value = false
	}
}

const seekTo = async time => {
	const video = videoRef.value
	if (!video) return
	try {
		await seekVideo(video, time)
	} catch {
		/* 忽略 */
	}
}

const setStart = () => {
	const video = videoRef.value
	if (!video) return
	form.start = Math.max(0, Math.round(video.currentTime * 100) / 100)
}

const setEnd = () => {
	const video = videoRef.value
	if (!video) return
	const end = Math.round(video.currentTime * 100) / 100
	if (end <= form.start + 0.1) {
		message.warning('终点需要晚于起点')
		return
	}
	form.duration = Math.round((end - form.start) * 100) / 100
}

/* ---------------- 转换 ---------------- */

const clearGif = () => {
	if (gifUrl.value) URL.revokeObjectURL(gifUrl.value)
	gifUrl.value = null
	gifBytes.value = null
	frameCount.value = 0
}

const convert = async () => {
	const video = videoRef.value
	if (!source.value || !video) return
	if (!videoInfo.value.width) {
		message.error('视频还没有加载完成')
		return
	}
	errorText.value = ''
	clearGif()
	busy.value = true
	cancel.value = false
	progress.value = 0

	try {
		const start = Math.max(0, Math.min(form.start, Math.max(0, duration.value - 0.05)))
		const end = Math.min(duration.value || start + form.duration, start + Math.max(0.1, form.duration))
		const fps = form.fps
		const total = Math.max(1, Math.floor((end - start) * fps))
		if (total > MAX_FRAMES) {
			throw new Error(`帧数过多（${total} 帧，上限 ${MAX_FRAMES}），请缩短时长或降低帧率`)
		}

		const width = Math.max(16, Math.round(form.width))
		const height = Math.max(2, Math.round((width * videoInfo.value.height) / videoInfo.value.width))
		outWidth.value = width
		outHeight.value = height
		frameCount.value = total

		const work = document.createElement('canvas')
		const builder = new GifBuilder({
			width,
			height,
			maxColors: form.colors,
			dither: form.dither,
			loop: form.infinity ? 0 : null,
			delay: Math.max(2, Math.round(100 / fps)),
		})

		// 第一遍：在整个片段范围内均匀采样，避免调色板偏色
		stageText.value = '正在采样调色板…'
		const sampleCount = Math.max(3, Math.min(SAMPLE_POINTS, Math.floor(total / 2) || 3))
		for (let i = 0; i < sampleCount; i += 1) {
			if (cancel.value) throw new Error('已取消')
			const t = start + ((end - start) * i) / Math.max(1, sampleCount - 1)
			await seekVideo(video, t)
			const data = grabFrame(video, work, width, height)
			builder.addSample(data.data, 29)
			progress.value = Math.round(((i + 1) / sampleCount) * 15)
			await new Promise(resolve => setTimeout(resolve, 0))
		}
		builder.buildPalette()

		// 第二遍：逐帧提取并立刻转成索引，避免同时持有大量位图
		for (let i = 0; i < total; i += 1) {
			if (cancel.value) throw new Error('已取消')
			const t = start + i / fps
			await seekVideo(video, t)
			const data = grabFrame(video, work, width, height)
			builder.addFrame(data.data)
			stageText.value = `正在提取第 ${i + 1} / ${total} 帧…`
			progress.value = 15 + Math.round(((i + 1) / total) * 70)
			await new Promise(resolve => setTimeout(resolve, 0))
		}

		stageText.value = '正在压缩并生成 GIF…'
		await new Promise(resolve => setTimeout(resolve, 30))
		const bytes = builder.build()
		gifBytes.value = bytes
		gifUrl.value = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }))
		progress.value = 100
		stageText.value = `完成：${total} 帧，${formatBytes(bytes.length)}`
		message.success(`GIF 生成完成，共 ${total} 帧，${formatBytes(bytes.length)}`)
	} catch (err) {
		errorText.value = friendlyError(err)
		stageText.value = ''
		progress.value = 0
		if (String(err?.message || err).includes('已取消')) message.info('已取消生成')
		else message.error(errorText.value)
	} finally {
		busy.value = false
	}
}

const saveGif = async () => {
	if (!gifBytes.value) return
	try {
		const base = stripExt(source.value?.name || 'video')
		const path = await saveBytesAs(gifBytes.value, {
			defaultPath: `${base}.gif`,
			filters: [{ name: 'GIF', extensions: ['gif'] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const reset = () => {
	if (source.value?.url) URL.revokeObjectURL(source.value.url)
	clearGif()
	source.value = null
	duration.value = 0
	stageText.value = ''
	progress.value = 0
}

onUnmounted(() => {
	if (source.value?.url) URL.revokeObjectURL(source.value.url)
	if (gifUrl.value) URL.revokeObjectURL(gifUrl.value)
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.videoToGif {
	.editor {
		display: flex;
		gap: 20px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.left {
		flex: 1;
		min-width: 320px;
	}
	.video {
		width: 100%;
		max-height: 320px;
		background: #000;
		border-radius: 8px;
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
			color: #262626;
			margin-bottom: 8px;
		}
		img {
			max-width: 100%;
			max-height: 360px;
			border-radius: 8px;
			box-shadow: 0 1px 8px rgba(0, 0, 0, 0.16);
			background:
				linear-gradient(45deg, #f2f2f2 25%, transparent 25%, transparent 75%, #f2f2f2 75%) 0 0 / 12px 12px,
				linear-gradient(45deg, #f2f2f2 25%, transparent 25%, transparent 75%, #f2f2f2 75%) 6px 6px / 12px 12px,
				#fff;
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
