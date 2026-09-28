/**
 * 音频工具：解码、切片、重采样、WAV 编码、波形峰值、重编码（MediaRecorder）
 */

/** 音频文件过滤器（也接受视频文件，尝试从中提取音轨） */
export const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'aac', 'wma', 'aiff', 'amr', 'mp4', 'webm', 'mkv', 'mov']

export const AUDIO_FILTER = { name: '音频 / 视频', extensions: AUDIO_EXTS }

let sharedContext = null

function getContext() {
	if (!sharedContext || sharedContext.state === 'closed') {
		const Ctor = window.AudioContext || window.webkitAudioContext
		if (!Ctor) throw new Error('当前环境不支持 Web Audio，无法处理音频')
		sharedContext = new Ctor()
	}
	return sharedContext
}

/** 解码音频字节为 AudioBuffer */
export async function decodeAudioBytes(bytes) {
	const ctx = getContext()
	// decodeAudioData 会分离传入的 ArrayBuffer，这里复制一份
	const copy = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes
	return await new Promise((resolve, reject) => {
		const promise = ctx.decodeAudioData(copy, resolve, err => reject(err || new Error('音频解码失败，格式可能不受支持')))
		if (promise && typeof promise.then === 'function') promise.then(resolve).catch(reject)
	})
}

export function audioInfo(buffer) {
	return {
		duration: buffer.duration,
		sampleRate: buffer.sampleRate,
		channels: buffer.numberOfChannels,
	}
}

/** 复制出一段音频（不做重采样） */
export function sliceAudioBuffer(buffer, start, end) {
	const from = Math.max(0, Math.min(start, buffer.duration))
	const to = Math.max(from, Math.min(end, buffer.duration))
	const sampleRate = buffer.sampleRate
	const fromSample = Math.floor(from * sampleRate)
	const toSample = Math.min(buffer.length, Math.ceil(to * sampleRate))
	const length = Math.max(1, toSample - fromSample)
	const ctx = getContext()
	const out = ctx.createBuffer(buffer.numberOfChannels, length, sampleRate)
	for (let c = 0; c < buffer.numberOfChannels; c += 1) {
		const src = buffer.getChannelData(c)
		out.getChannelData(c).set(src.subarray(fromSample, fromSample + length))
	}
	return out
}

/**
 * 重采样 / 变声道 / 淡入淡出
 * @param {{ sampleRate?: number, channels?: number, fadeIn?: number, fadeOut?: number, gain?: number }} options
 */
export async function processAudioBuffer(buffer, { sampleRate, channels, fadeIn = 0, fadeOut = 0, gain = 1 } = {}) {
	const rate = sampleRate || buffer.sampleRate
	const channelCount = channels || buffer.numberOfChannels
	const length = Math.max(1, Math.ceil((buffer.duration * rate)))
	const OfflineCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext
	if (!OfflineCtor) throw new Error('当前环境不支持离线音频处理')
	const ctx = new OfflineCtor(channelCount, length, rate)
	const source = ctx.createBufferSource()
	source.buffer = buffer
	const gainNode = ctx.createGain()
	gainNode.gain.value = gain
	const duration = buffer.duration
	if (fadeIn > 0) {
		gainNode.gain.setValueAtTime(0, 0)
		gainNode.gain.linearRampToValueAtTime(gain, Math.min(fadeIn, duration))
	}
	if (fadeOut > 0) {
		const start = Math.max(0, duration - fadeOut)
		gainNode.gain.setValueAtTime(gain, start)
		gainNode.gain.linearRampToValueAtTime(0, duration)
	}
	source.connect(gainNode)
	gainNode.connect(ctx.destination)
	source.start(0)
	return await ctx.startRendering()
}

function writeAscii(view, offset, text) {
	for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
}

/** 编码为 WAV（PCM），支持 16 / 24 位 */
export function encodeWav(buffer, { bitDepth = 16 } = {}) {
	const channels = buffer.numberOfChannels
	const frames = buffer.length
	const sampleRate = buffer.sampleRate
	const bytesPerSample = bitDepth / 8
	const blockAlign = channels * bytesPerSample
	const dataSize = frames * blockAlign
	const out = new Uint8Array(44 + dataSize)
	const view = new DataView(out.buffer)

	writeAscii(view, 0, 'RIFF')
	view.setUint32(4, 36 + dataSize, true)
	writeAscii(view, 8, 'WAVE')
	writeAscii(view, 12, 'fmt ')
	view.setUint32(16, 16, true)
	view.setUint16(20, 1, true) // PCM
	view.setUint16(22, channels, true)
	view.setUint32(24, sampleRate, true)
	view.setUint32(28, sampleRate * blockAlign, true)
	view.setUint16(32, blockAlign, true)
	view.setUint16(34, bitDepth, true)
	writeAscii(view, 36, 'data')
	view.setUint32(40, dataSize, true)

	const chans = []
	for (let c = 0; c < channels; c += 1) chans.push(buffer.getChannelData(c))

	let offset = 44
	const maxInt = bitDepth === 16 ? 0x7fff : 0x7fffff
	const minInt = bitDepth === 16 ? 0x8000 : 0x800000
	for (let i = 0; i < frames; i += 1) {
		for (let c = 0; c < channels; c += 1) {
			let sample = chans[c][i]
			if (sample > 1) sample = 1
			else if (sample < -1) sample = -1
			const value = Math.round(sample < 0 ? sample * minInt : sample * maxInt)
			if (bitDepth === 16) {
				view.setInt16(offset, value, true)
				offset += 2
			} else {
				out[offset] = value & 0xff
				out[offset + 1] = (value >> 8) & 0xff
				out[offset + 2] = (value >> 16) & 0xff
				offset += 3
			}
		}
	}
	return out
}

/** 计算波形峰值（用于绘制波形图） */
export function computePeaks(buffer, buckets = 1200) {
	const channels = buffer.numberOfChannels
	const length = buffer.length
	const count = Math.max(1, Math.min(buckets, length))
	const mins = new Float32Array(count)
	const maxs = new Float32Array(count)
	const data = []
	for (let c = 0; c < channels; c += 1) data.push(buffer.getChannelData(c))
	const step = length / count

	for (let i = 0; i < count; i += 1) {
		const from = Math.floor(i * step)
		const to = Math.min(length, Math.floor((i + 1) * step))
		let min = 1
		let max = -1
		for (let s = from; s < to; s += 1) {
			let value = 0
			for (let c = 0; c < channels; c += 1) value += data[c][s]
			value /= channels
			if (value < min) min = value
			if (value > max) max = value
		}
		mins[i] = min === 1 ? 0 : min
		maxs[i] = max === -1 ? 0 : max
	}
	return { mins, maxs, buckets: count }
}

/** 当前内核可用的音频编码格式 */
export function supportedAudioTypes() {
	const candidates = [
		{ mime: 'audio/webm;codecs=opus', label: 'WebM / Opus（推荐，体积小）', ext: 'webm' },
		{ mime: 'audio/ogg;codecs=opus', label: 'OGG / Opus', ext: 'ogg' },
		{ mime: 'audio/mp4', label: 'M4A / AAC', ext: 'm4a' },
		{ mime: 'audio/webm', label: 'WebM（默认编码）', ext: 'webm' },
	]
	if (typeof MediaRecorder === 'undefined') return []
	return candidates.filter(item => {
		try {
			return MediaRecorder.isTypeSupported(item.mime)
		} catch {
			return false
		}
	})
}

/**
 * 用 MediaRecorder 把 AudioBuffer 重新编码为压缩格式（实时进行，耗时≈音频时长）
 */
export async function encodeAudioWithRecorder({ buffer, mimeType, bitrate = 128000, onProgress, shouldCancel, delay = 0 }) {
	if (typeof MediaRecorder === 'undefined') throw new Error('当前环境不支持音频编码')
	const ctx = getContext()
	await ctx.resume().catch(() => {})
	const destination = ctx.createMediaStreamDestination()
	const source = ctx.createBufferSource()
	source.buffer = buffer
	source.connect(destination)
	// 不连接 ctx.destination，避免边录边外放

	const recorder = new MediaRecorder(destination.stream, { mimeType, audioBitsPerSecond: bitrate })
	const chunks = []
	recorder.ondataavailable = event => {
		if (event.data && event.data.size) chunks.push(event.data)
	}
	const finished = new Promise((resolve, reject) => {
		recorder.onstop = () => resolve()
		recorder.onerror = event => reject(event.error || new Error('音频编码失败'))
	})

	const startedAt = performance.now()
	const total = buffer.duration * 1000
	let timer = 0
	const tick = () => {
		const elapsed = performance.now() - startedAt
		onProgress?.(Math.min(0.99, elapsed / total))
		if (shouldCancel?.()) {
			try {
				source.stop()
			} catch {
				/* 忽略 */
			}
			try {
				recorder.stop()
			} catch {
				/* 忽略 */
			}
			clearInterval(timer)
			return
		}
	}
	timer = setInterval(tick, 120)

	recorder.start(200)
	if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
	source.start(0)
	await new Promise(resolve => {
		source.onended = resolve
	})
	clearInterval(timer)
	recorder.stop()
	await finished
	onProgress?.(1)

	const blob = new Blob(chunks, { type: mimeType })
	return { blob, bytes: new Uint8Array(await blob.arrayBuffer()) }
}

/** 播放一段音频（用于试听），返回停止函数 */
export function playAudioBuffer(buffer, { offset = 0, duration, volume = 1 } = {}) {
	const ctx = getContext()
	ctx.resume().catch(() => {})
	const source = ctx.createBufferSource()
	source.buffer = buffer
	const gain = ctx.createGain()
	gain.gain.value = volume
	source.connect(gain)
	gain.connect(ctx.destination)
	source.start(0, Math.max(0, offset), duration && duration > 0 ? duration : undefined)
	return () => {
		try {
			source.stop()
		} catch {
			/* 忽略 */
		}
	}
}
