<template>
	<div class="tool audioTrim">
		<h1 class="tool-title">
			音频截取
			<span class="tip">拖动波形上的绿色/红色标记选择片段，可加淡入淡出后导出</span>
		</h1>

		<div class="tool-content">
			<Selector
				v-if="!loaded"
				title="点击选择音频文件，或拖拽到此处"
				desc="支持 MP3 / WAV / FLAC / M4A / OGG 等"
				:multiple="false"
				:filters="[AUDIO_FILTER]"
				@selected="loadFile"
				@drop="loadFile"
			/>

			<a-spin v-else :spinning="loading">
				<div class="editor">
					<div class="tool-card block">
						<div class="block-title">波形（点击或拖动标记调整范围）</div>
						<Waveform
							:peaks="peaks"
							:duration="info.duration"
							:start="start"
							:end="end"
							:playhead="playhead"
							:height="140"
							@update:start="value => (start = value)"
							@update:end="value => (end = value)"
						/>
						<div class="range-info">
							<span>起点 <b>{{ start.toFixed(2) }}</b> s</span>
							<span>终点 <b>{{ end.toFixed(2) }}</b> s</span>
							<span>片段时长 <b>{{ segment.toFixed(2) }}</b> s</span>
							<span class="hint">原文件 {{ formatDuration(info.duration) }} · {{ info.sampleRate }} Hz · {{ info.channels === 1 ? '单声道' : '立体声' }}</span>
						</div>
						<a-space :size="8" wrap class="row-actions">
							<a-button size="small" type="primary" @click="playSelection">{{ playing ? '停止' : '试听片段' }}</a-button>
							<a-button size="small" @click="useFull">使用整段</a-button>
							<a-button size="small" @click="resetRange">重置范围</a-button>
							<a-button size="small" :disabled="busy" @click="reset">重新选择</a-button>
						</a-space>
					</div>

					<div class="tool-card block">
						<div class="block-title">精确时间</div>
						<div class="grid">
							<a-input-number v-model:value="start" :min="0" :max="Math.max(0, end - 0.05)" :step="0.1" addon-before="起点" addon-after="s" />
							<a-input-number v-model:value="end" :min="start + 0.05" :max="info.duration" :step="0.1" addon-before="终点" addon-after="s" />
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">处理与输出</div>
						<div class="grid">
							<a-input-number v-model:value="fadeIn" :min="0" :max="Math.max(0, segment / 2)" :step="0.1" addon-before="淡入" addon-after="s" />
							<a-input-number v-model:value="fadeOut" :min="0" :max="Math.max(0, segment / 2)" :step="0.1" addon-before="淡出" addon-after="s" />
							<a-select v-model:value="form.format" :options="formatOptions" style="width: 100%" />
							<a-select v-model:value="form.channels" :options="channelOptions" style="width: 100%" />
							<a-select v-if="form.format === 'wav'" v-model:value="form.bitDepth" :options="bitDepthOptions" style="width: 100%" />
							<a-select v-else v-model:value="form.bitrate" :options="bitrateOptions" style="width: 100%" />
						</div>
						<div class="hint" style="margin-top: 8px" v-if="form.format !== 'wav'">
							压缩格式实时编码，耗时约 {{ segment.toFixed(1) }} 秒
						</div>
					</div>

					<div class="tool-card block" v-if="busy || progress > 0">
						<div class="block-title">导出进度</div>
						<a-progress :percent="Math.round(progress * 100)" :status="busy ? 'active' : 'success'" />
					</div>

					<div class="tool-card block" v-if="result">
						<div class="block-title">导出结果</div>
						<div class="hint">{{ result.label }} · {{ formatBytes(result.bytes.length) }} · {{ segment.toFixed(2) }} 秒</div>
						<div class="row-actions">
							<a-button type="primary" size="small" @click="saveResult">保存文件</a-button>
						</div>
					</div>

					<a-alert v-if="errorText" type="error" show-icon :message="errorText" />
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<span class="hint">先用「试听片段」确认范围，再导出</span>
			<a-space>
				<a-button v-if="busy" danger @click="cancel = true">取消</a-button>
				<a-button type="primary" :disabled="!loaded || busy" :loading="busy" @click="exportAudio">导出片段</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import Waveform from '@/components/Waveform.vue'
import { formatBytes } from '@/utils/image'
import { friendlyError, readSourceBytes, saveBytesAs } from '@/utils/tauriIO'
import { formatDuration } from '@/utils/video'
import {
	AUDIO_FILTER,
	audioInfo,
	computePeaks,
	decodeAudioBytes,
	encodeAudioWithRecorder,
	encodeWav,
	playAudioBuffer,
	processAudioBuffer,
	sliceAudioBuffer,
	supportedAudioTypes,
} from '@/utils/audio'

const loaded = ref(false)
const loading = ref(false)
const busy = ref(false)
const cancel = ref(false)
const progress = ref(0)
const errorText = ref('')
const fileName = ref('')
const info = reactive({ duration: 0, sampleRate: 0, channels: 2 })
const peaks = ref(null)
const buffer = ref(null)
const result = ref(null)
const start = ref(0)
const end = ref(0)
const fadeIn = ref(0)
const fadeOut = ref(0)
const playing = ref(false)
const playhead = ref(-1)

const availableTypes = supportedAudioTypes()
const formatOptions = [
	{ label: 'WAV（无损 PCM）', value: 'wav' },
	...availableTypes.map(type => ({ label: type.label, value: type.mime })),
]
const channelOptions = [
	{ label: '保持原声道', value: 0 },
	{ label: '单声道', value: 1 },
	{ label: '立体声', value: 2 },
]
const bitDepthOptions = [
	{ label: '16 位', value: 16 },
	{ label: '24 位', value: 24 },
]
const bitrateOptions = [64, 96, 128, 192, 256, 320].map(v => ({ label: `${v} kbps`, value: v }))

const form = reactive({ format: 'wav', channels: 0, bitDepth: 16, bitrate: 128 })
const segment = computed(() => Math.max(0.05, end.value - start.value))

const loadFile = async sources => {
	const list = (Array.isArray(sources) ? sources : [sources]).filter(Boolean).slice(0, 1)
	if (!list.length) return
	loading.value = true
	errorText.value = ''
	result.value = null
	try {
		const bytes = await readSourceBytes(list[0])
		const name = typeof list[0] === 'string' ? list[0].split(/[\\/]/).pop() : list[0].name
		const decoded = await decodeAudioBytes(bytes)
		buffer.value = decoded
		fileName.value = name
		Object.assign(info, audioInfo(decoded))
		peaks.value = computePeaks(decoded, 1600)
		start.value = 0
		end.value = decoded.duration
		fadeIn.value = 0
		fadeOut.value = 0
		loaded.value = true
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		loading.value = false
	}
}

watch(start, value => {
	if (value > end.value) end.value = Math.min(info.duration, value + 0.05)
})
watch(end, value => {
	if (value < start.value) start.value = Math.max(0, value - 0.05)
})

const useFull = () => {
	start.value = 0
	end.value = info.duration
}
const resetRange = () => {
	useFull()
	fadeIn.value = 0
	fadeOut.value = 0
}

let stopPlayback = null
let stopHead = null
const stopAll = () => {
	stopPlayback?.()
	stopPlayback = null
	if (stopHead) cancelAnimationFrame(stopHead)
	stopHead = null
	playing.value = false
	playhead.value = -1
}

const playSelection = () => {
	if (playing.value) {
		stopAll()
		return
	}
	if (!buffer.value) return
	const offset = start.value
	const duration = segment.value
	stopPlayback = playAudioBuffer(buffer.value, { offset, duration })
	playing.value = true
	const begin = performance.now()
	const tick = () => {
		const elapsed = (performance.now() - begin) / 1000
		playhead.value = offset + elapsed
		if (elapsed >= duration) {
			stopAll()
			return
		}
		stopHead = requestAnimationFrame(tick)
	}
	stopHead = requestAnimationFrame(tick)
}

const exportAudio = async () => {
	if (!buffer.value) return
	busy.value = true
	cancel.value = false
	progress.value = 0
	errorText.value = ''
	result.value = null
	stopAll()
	try {
		const sliced = sliceAudioBuffer(buffer.value, start.value, end.value)
		if (form.format === 'wav') {
			const processed = await processAudioBuffer(sliced, {
				channels: form.channels || undefined,
				fadeIn: fadeIn.value,
				fadeOut: fadeOut.value,
			})
			const bytes = encodeWav(processed, { bitDepth: form.bitDepth })
			result.value = { bytes, ext: 'wav', label: `WAV · ${form.bitDepth} 位` }
			progress.value = 1
			message.success(`导出完成（${formatBytes(bytes.length)}）`)
		} else {
			const type = availableTypes.find(item => item.mime === form.format)
			const processed = await processAudioBuffer(sliced, {
				channels: form.channels || undefined,
				fadeIn: fadeIn.value,
				fadeOut: fadeOut.value,
			})
			const encoded = await encodeAudioWithRecorder({
				buffer: processed,
				mimeType: form.format,
				bitrate: form.bitrate * 1000,
				onProgress: ratio => {
					progress.value = ratio
				},
				shouldCancel: () => cancel.value,
			})
			if (cancel.value) throw new Error('已取消')
			result.value = { bytes: encoded.bytes, ext: type?.ext || 'webm', label: `${type?.label || form.format} · ${form.bitrate} kbps` }
			message.success(`导出完成（${formatBytes(encoded.bytes.length)}）`)
		}
	} catch (err) {
		errorText.value = friendlyError(err)
		if (!String(err?.message || err).includes('已取消')) message.error(errorText.value)
	} finally {
		busy.value = false
	}
}

const saveResult = async () => {
	if (!result.value) return
	try {
		const path = await saveBytesAs(result.value.bytes, {
			defaultPath: `${fileName.value.replace(/\.[^.]+$/, '')}_clip.${result.value.ext}`,
			filters: [{ name: result.value.ext.toUpperCase(), extensions: [result.value.ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const reset = () => {
	stopAll()
	loaded.value = false
	buffer.value = null
	peaks.value = null
	result.value = null
	errorText.value = ''
}

onUnmounted(stopAll)
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.audioTrim {
	.editor {
		display: flex;
		flex-flow: column;
		gap: 12px;
		max-width: 980px;
	}
	.block-title {
		font-weight: 600;
		color: var(--text-color);
		margin-bottom: 10px;
	}
	.range-info {
		display: flex;
		gap: 18px;
		flex-wrap: wrap;
		margin-top: 10px;
		font-size: 12px;
		color: var(--text-color-3);
		b {
			color: #1677ff;
		}
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.row-actions {
		margin-top: 10px;
	}
}
</style>
