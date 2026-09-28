/**
 * 视频重编码工具
 *
 * 实现方式：离屏 video 解码 → canvas 绘制 → canvas.captureStream + MediaRecorder 录制
 * 优点：不依赖 ffmpeg，纯前端即可导出新视频
 * 限制：录制是实时的（耗时≈片段时长），输出格式取决于内核支持的 MediaRecorder 编码
 */

import { createVideoElement, seekVideo } from './video'

/** 当前内核可用的视频输出格式 */
export function supportedVideoTypes() {
	const candidates = [
		{ mime: 'video/mp4;codecs=avc1.42E01E', label: 'MP4 / H.264（推荐）', ext: 'mp4' },
		{ mime: 'video/mp4', label: 'MP4', ext: 'mp4' },
		{ mime: 'video/webm;codecs=vp9,opus', label: 'WebM / VP9 + Opus', ext: 'webm' },
		{ mime: 'video/webm;codecs=vp8,opus', label: 'WebM / VP8 + Opus', ext: 'webm' },
		{ mime: 'video/webm', label: 'WebM', ext: 'webm' },
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
 * 录制一段视频
 * @param {{
 *   src: string,                       // 视频 URL（blob: 或 asset:）
 *   start?: number, end?: number,      // 时间范围（秒）
 *   width: number, height: number,     // 输出尺寸
 *   fps?: number,
 *   mimeType: string,
 *   videoBitsPerSecond?: number,
 *   audioBitsPerSecond?: number,
 *   withAudio?: boolean,
 *   drawFrame: (ctx: CanvasRenderingContext2D, video: HTMLVideoElement, canvas: HTMLCanvasElement) => void,
 *   onProgress?: (ratio: number) => void,
 *   shouldCancel?: () => boolean,
 * }} options
 */
export async function recordVideoSegment({
	src,
	start = 0,
	end,
	width,
	height,
	fps = 30,
	mimeType,
	videoBitsPerSecond,
	audioBitsPerSecond = 128000,
	withAudio = true,
	drawFrame,
	onProgress,
	shouldCancel,
}) {
	if (typeof MediaRecorder === 'undefined') throw new Error('当前环境不支持 MediaRecorder，无法导出视频')

	const video = await createVideoElement(src)
	const duration = Number.isFinite(video.duration) ? video.duration : end || 0
	const from = Math.max(0, Math.min(start, Math.max(0, duration - 0.05)))
	const to = Math.max(from + 0.05, Math.min(end ?? duration, duration || (end ?? 0)))
	if (!(to > from)) throw new Error('结束时间需要晚于开始时间')

	const canvas = document.createElement('canvas')
	canvas.width = Math.max(2, Math.round(width))
	canvas.height = Math.max(2, Math.round(height))
	const ctx = canvas.getContext('2d')
	const stream = canvas.captureStream(fps)
	const tracks = [...stream.getVideoTracks()]

	let audioCtx = null
	if (withAudio) {
		try {
			const Ctor = window.AudioContext || window.webkitAudioContext
			audioCtx = new Ctor()
			const mediaSource = audioCtx.createMediaElementSource(video)
			const destination = audioCtx.createMediaStreamDestination()
			// 只接到录制目标，不接扬声器：既能录到声音，又不会外放
			mediaSource.connect(destination)
			tracks.push(...destination.stream.getAudioTracks())
		} catch {
			audioCtx = null
			video.muted = true
		}
	} else {
		video.muted = true
	}

	const mixed = new MediaStream(tracks)
	const recorder = new MediaRecorder(mixed, {
		mimeType,
		videoBitsPerSecond,
		audioBitsPerSecond,
	})
	const chunks = []
	recorder.ondataavailable = event => {
		if (event.data && event.data.size) chunks.push(event.data)
	}
	const recorderStopped = new Promise((resolve, reject) => {
		recorder.onstop = () => resolve()
		recorder.onerror = event => reject(event.error || new Error('视频录制失败'))
	})

	const cleanup = () => {
		try {
			recorder.stream.getTracks().forEach(track => track.stop())
		} catch {
			/* 忽略 */
		}
		try {
			audioCtx?.close()
		} catch {
			/* 忽略 */
		}
		video.removeAttribute('src')
		try {
			video.load()
		} catch {
			/* 忽略 */
		}
	}

	try {
		await seekVideo(video, from)
		drawFrame(ctx, video, canvas)
		recorder.start(200)
		await video.play()

		await new Promise((resolve, reject) => {
			let raf = 0
			const step = () => {
				if (shouldCancel?.()) {
					reject(new Error('已取消'))
					return
				}
				try {
					drawFrame(ctx, video, canvas)
				} catch (err) {
					reject(err)
					return
				}
				const ratio = Math.min(1, Math.max(0, (video.currentTime - from) / (to - from)))
				onProgress?.(ratio)
				if (video.currentTime >= to - 0.03 || video.ended) {
					resolve()
					return
				}
				raf = requestAnimationFrame(step)
			}
			raf = requestAnimationFrame(step)
			video.onerror = () => reject(new Error('视频播放出错'))
			return () => cancelAnimationFrame(raf)
		})

		video.pause()
		// 让编码器把尾部数据吐出来
		await new Promise(resolve => setTimeout(resolve, 180))
		recorder.stop()
		await recorderStopped
		onProgress?.(1)

		const blob = new Blob(chunks, { type: mimeType })
		if (!blob.size) throw new Error('没有录到任何数据，请重试或更换输出格式')
		return {
			blob,
			bytes: new Uint8Array(await blob.arrayBuffer()),
			mimeType,
			width: canvas.width,
			height: canvas.height,
			duration: to - from,
		}
	} finally {
		cleanup()
	}
}

/** 常用的绘制函数：整帧铺满输出画布 */
export function drawFullFrame(ctx, video, canvas) {
	ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
}

/** 按裁剪区域绘制（crop 为源视频像素坐标） */
export function makeCropDrawer(crop, sourceWidth, sourceHeight) {
	return (ctx, video, canvas) => {
		ctx.drawImage(
			video,
			crop.x,
			crop.y,
			crop.width,
			crop.height,
			0,
			0,
			canvas.width,
			canvas.height
		)
	}
}
