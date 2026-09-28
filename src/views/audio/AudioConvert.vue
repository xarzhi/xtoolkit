<template>
	<div class="tool audioConvert">
		<h1 class="tool-title">
			音频格式转换
			<span class="tip">转 WAV（无损）或 WebM/Opus、M4A/AAC 等压缩格式，可改采样率与声道</span>
		</h1>

		<div class="tool-content">
			<Selector
				v-if="!loaded"
				title="点击选择音频文件，或拖拽到此处"
				desc="支持 MP3 / WAV / FLAC / M4A / OGG 等；也可以选视频文件尝试提取音轨"
				:multiple="false"
				:filters="[AUDIO_FILTER]"
				@selected="loadFile"
				@drop="loadFile"
			/>

			<a-spin v-else :spinning="loading">
				<div class="editor">
					<div class="tool-card block">
						<div class="block-title">波形</div>
						<Waveform :peaks="peaks" :duration="info.duration" :editable="false" :height="120" />
						<div class="hint" style="margin-top: 8px">
							{{ fileName }} · {{ formatDuration(info.duration) }} · {{ info.sampleRate }} Hz ·
							{{ info.channels === 1 ? '单声道' : '立体声' }} · {{ formatBytes(fileSize) }}
						</div>
						<div class="row-actions">
							<a-button size="small" @click="togglePlay">{{ playing ? '停止试听' : '试听' }}</a-button>
							<a-button size="small" :disabled="busy" @click="reset">重新选择</a-button>
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">输出设置</div>
						<a-radio-group v-model:value="form.format" size="small" @change="onFormatChange">
							<a-radio-button value="wav">WAV（无损）</a-radio-button>
							<a-radio-button v-for="type in availableTypes" :key="type.mime" :value="type.mime">
								{{ type.label }}
							</a-radio-button>
						</a-radio-group>

						<div class="grid" style="margin-top: 12px">
							<template v-if="form.format === 'wav'">
								<a-select v-model:value="form.bitDepth" :options="bitDepthOptions" style="width: 100%" />
								<a-select v-model:value="form.sampleRate" :options="sampleRateOptions" style="width: 100%" />
							</template>
							<template v-else>
								<a-select v-model:value="form.bitrate" :options="bitrateOptions" style="width: 100%" />
							</template>
							<a-select v-model:value="form.channels" :options="channelOptions" style="width: 100%" />
						</div>

						<div class="hint" style="margin-top: 8px" v-if="form.format !== 'wav'">
							压缩格式需要实时编码，耗时约等于音频时长（{{ formatDuration(info.duration) }}）；WAV 是瞬间完成的
						</div>
						<div class="hint" style="margin-top: 8px" v-else>
							WAV 是无压缩的 PCM 文件，体积通常比原 MP3 大，适合后期剪辑
						</div>
					</div>

					<div class="tool-card block" v-if="busy || progress > 0">
						<div class="block-title">转换进度</div>
						<a-progress :percent="Math.round(progress * 100)" :status="busy ? 'active' : 'success'" />
					</div>

					<div class="tool-card block" v-if="result">
						<div class="block-title">转换结果</div>
						<div class="hint">
							{{ result.label }} · {{ formatBytes(result.bytes.length) }}
							<span v-if="fileSize">（原文件 {{ formatBytes(fileSize) }}，{{ sizeHint }}）</span>
						</div>
						<div class="row-actions">
							<a-button type="primary" size="small" @click="saveResult">保存文件</a-button>
						</div>
					</div>

					<a-alert v-if="errorText" type="error" show-icon :message="errorText" />
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<span class="hint">解码与编码全部在本地完成</span>
			<a-space>
				<a-button v-if="busy" danger @click="cancel = true">取消</a-button>
				<a-button type="primary" :disabled="!loaded || busy" :loading="busy" @click="convert">开始转换</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref } from 'vue'
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
	supportedAudioTypes,
} from '@/utils/audio'

const loaded = ref(false)
const loading = ref(false)
const busy = ref(false)
const cancel = ref(false)
const progress = ref(0)
const errorText = ref('')
const fileName = ref('')
const fileSize = ref(0)
const info = reactive({ duration: 0, sampleRate: 0, channels: 2 })
const peaks = ref(null)
const buffer = ref(null)
const result = ref(null)
const playing = ref(false)

const availableTypes = supportedAudioTypes()

const form = reactive({
	format: 'wav',
	bitDepth: 16,
	sampleRate: 0,
	channels: 0,
	bitrate: 128,
})

const bitDepthOptions = [
	{ label: '16 位（通用）', value: 16 },
	{ label: '24 位（高精度）', value: 24 },
]
const sampleRateOptions = [
	{ label: '保持原采样率', value: 0 },
	{ label: '48000 Hz', value: 48000 },
	{ label: '44100 Hz', value: 44100 },
	{ label: '32000 Hz', value: 32000 },
	{ label: '22050 Hz', value: 22050 },
]
const channelOptions = [
	{ label: '保持原声道', value: 0 },
	{ label: '单声道', value: 1 },
	{ label: '立体声', value: 2 },
]
const bitrateOptions = [64, 96, 128, 192, 256, 320].map(v => ({ label: `${v} kbps`, value: v }))

const sizeHint = computed(() => {
	if (!result.value || !fileSize.value) return ''
	const rate = (1 - result.value.bytes.length / fileSize.value) * 100
	return rate >= 0 ? `减小 ${rate.toFixed(1)}%` : `增大 ${Math.abs(rate).toFixed(1)}%`
})

const onFormatChange = () => {
	result.value = null
	errorText.value = ''
}

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
		fileSize.value = bytes.length
		Object.assign(info, audioInfo(decoded))
		peaks.value = computePeaks(decoded, 1400)
		loaded.value = true
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		loading.value = false
	}
}

let stopPlayback = null
const togglePlay = () => {
	if (playing.value) {
		stopPlayback?.()
		playing.value = false
		return
	}
	if (!buffer.value) return
	stopPlayback = playAudioBuffer(buffer.value, {})
	playing.value = true
	const total = info.duration * 1000
	setTimeout(() => {
		playing.value = false
	}, total)
}

const convert = async () => {
	if (!buffer.value) return
	busy.value = true
	cancel.value = false
	progress.value = 0
	errorText.value = ''
	result.value = null
	try {
		if (form.format === 'wav') {
			const processed = await processAudioBuffer(buffer.value, {
				sampleRate: form.sampleRate || undefined,
				channels: form.channels || undefined,
			})
			const bytes = encodeWav(processed, { bitDepth: form.bitDepth })
			result.value = { bytes, ext: 'wav', label: `WAV · ${form.bitDepth} 位 · ${processed.sampleRate} Hz` }
			progress.value = 1
			message.success(`转换完成（${formatBytes(bytes.length)}）`)
		} else {
			const type = availableTypes.find(item => item.mime === form.format)
			const processed = await processAudioBuffer(buffer.value, {
				channels: form.channels || undefined,
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
			message.success(`转换完成（${formatBytes(encoded.bytes.length)}）`)
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
			defaultPath: `${fileName.value.replace(/\.[^.]+$/, '')}.converted.${result.value.ext}`,
			filters: [{ name: result.value.ext.toUpperCase(), extensions: [result.value.ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const reset = () => {
	stopPlayback?.()
	playing.value = false
	loaded.value = false
	buffer.value = null
	peaks.value = null
	result.value = null
	errorText.value = ''
}

onUnmounted(() => stopPlayback?.())
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.audioConvert {
	.editor {
		display: flex;
		flex-flow: column;
		gap: 12px;
		max-width: 900px;
	}
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
	.row-actions {
		margin-top: 10px;
	}
}
</style>
