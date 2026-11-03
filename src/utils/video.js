/**
 * 视频取帧工具（依赖 DOM，仅在 WebView / 浏览器中可用）
 */

export const VIDEO_EXTS = ['mp4', 'webm', 'mkv', 'mov', 'm4v', 'avi', 'ogv', 'mpg', 'mpeg', 'wmv', 'flv', 'ts']

export const VIDEO_FILTER = { name: '视频', extensions: VIDEO_EXTS }

/**
 * 给 video/audio 设置地址。
 * 走 asset 协议（不是 blob:）时必须带 crossOrigin='anonymous'：
 * 否则画布会被标记为「被污染」，getImageData / toBlob 会直接抛 SecurityError，
 * 裁剪、转 GIF 这些取帧的功能就全废了。asset 协议本身会回 Access-Control-Allow-Origin。
 * 注意 crossOrigin 必须在 src 之前设置，设完再改是无效的。
 */
export function setVideoSrc(media, url) {
	if (!media || !url) return
	if (!String(url).startsWith('blob:')) media.crossOrigin = 'anonymous'
	media.src = url
}

/**
 * 取到视频的真实时长。
 * 浏览器录制的 WebM（MediaRecorder 输出）常常没有时长元数据，duration 会是 Infinity，
 * 这类视频一旦拿 Infinity 去算截取终点就会只录到几十毫秒。这里用「seek 到一个超大
 * 时间点」的老办法逼内核把真实时长算出来。
 */
export async function resolveVideoDuration(video) {
	if (!video) return 0
	if (Number.isFinite(video.duration) && video.duration > 0) return video.duration
	await new Promise(resolve => {
		let settled = false
		const finish = () => {
			if (settled) return
			settled = true
			video.removeEventListener('durationchange', onChange)
			video.removeEventListener('timeupdate', onChange)
			resolve()
		}
		const onChange = () => {
			if (Number.isFinite(video.duration) && video.duration > 0) finish()
		}
		video.addEventListener('durationchange', onChange)
		video.addEventListener('timeupdate', onChange)
		try {
			video.currentTime = 1e101
		} catch {
			finish()
		}
		setTimeout(finish, 2000)
	})
	try {
		video.currentTime = 0
	} catch {
		/* 忽略 */
	}
	return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
}

/** 用字节数据创建 video 元素并等待元数据就绪 */
export async function createVideoElement(url) {
	const video = document.createElement('video')
	video.preload = 'auto'
	video.muted = true
	video.playsInline = true
	setVideoSrc(video, url)
	await new Promise((resolve, reject) => {
		const cleanup = () => {
			video.removeEventListener('loadeddata', onLoaded)
			video.removeEventListener('error', onError)
		}
		const onLoaded = () => {
			cleanup()
			resolve()
		}
		const onError = () => {
			cleanup()
			reject(new Error('无法解码该视频（编码格式可能不受支持，建议使用 MP4/H.264 或 WebM）'))
		}
		video.addEventListener('loadeddata', onLoaded)
		video.addEventListener('error', onError)
	})
	await resolveVideoDuration(video)
	return video
}

/** 跳转到指定时间并等待画面就绪 */
export function seekVideo(video, time) {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			video.removeEventListener('seeked', onSeeked)
			video.removeEventListener('error', onError)
		}
		const onSeeked = () => {
			cleanup()
			resolve()
		}
		const onError = () => {
			cleanup()
			reject(new Error('视频跳转失败'))
		}
		video.addEventListener('seeked', onSeeked)
		video.addEventListener('error', onError)
		const duration = Number.isFinite(video.duration) ? video.duration : time
		video.currentTime = Math.max(0, Math.min(time, Math.max(0, duration - 0.01)))
	})
}

/** 截取当前帧到画布并返回 ImageData */
export function grabFrame(video, canvas, width, height, background = '#000000') {
	canvas.width = width
	canvas.height = height
	const ctx = canvas.getContext('2d', { willReadFrequently: true })
	if (background) {
		ctx.fillStyle = background
		ctx.fillRect(0, 0, width, height)
	}
	ctx.drawImage(video, 0, 0, width, height)
	return ctx.getImageData(0, 0, width, height)
}

export function formatDuration(seconds) {
	if (!Number.isFinite(seconds) || seconds < 0) return '未知'
	const total = Math.round(seconds * 10) / 10
	const m = Math.floor(total / 60)
	const s = total - m * 60
	return m > 0 ? `${m} 分 ${s.toFixed(1)} 秒` : `${s.toFixed(1)} 秒`
}
