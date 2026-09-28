import { onUnmounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { createStreamUrl, friendlyError, revokeStreamUrl, sourceSize } from './tauriIO'
import { VIDEO_FILTER, createVideoElement, setVideoSrc } from './video'

/**
 * 视频类页面的公共逻辑：选择文件、读取元数据、绑定到页面上的 video 元素
 *
 * 注意：这里**不能**把视频整份读进内存（readFile）。几个 G 的视频会把
 * WebView 撑爆、程序直接闪退。Tauri 路径走 asset 协议流式读取，
 * 顺便还能支持拖动进度条（asset 协议带 Range 支持）。
 */
export function useVideoSource({ filters = [VIDEO_FILTER] } = {}) {
	const source = ref(null)
	const duration = ref(0)
	const videoInfo = ref({ width: 0, height: 0 })
	const loading = ref(false)
	const videoRef = ref(null)

	const handleFiles = async sources => {
		const list = (Array.isArray(sources) ? sources : [sources]).filter(Boolean).slice(0, 1)
		if (!list.length) return false
		loading.value = true
		try {
			const streamUrl = await createStreamUrl(list[0])
			const name = typeof list[0] === 'string' ? list[0].split(/[\\/]/).pop() : list[0].name
			const size = await sourceSize(list[0])
			const probe = await createVideoElement(streamUrl)
			const info = { width: probe.videoWidth, height: probe.videoHeight }
			const total = Number.isFinite(probe.duration) ? probe.duration : 0
			probe.removeAttribute('src')
			try {
				probe.load()
			} catch {
				/* 忽略 */
			}

			if (source.value?.url) revokeStreamUrl(source.value)
			source.value = { name, url: streamUrl, size, path: typeof list[0] === 'string' ? list[0] : '' }
			videoInfo.value = info
			duration.value = total

			await new Promise(resolve => {
				requestAnimationFrame(() => {
					const video = videoRef.value
					if (!video) {
						resolve()
						return
					}
					setVideoSrc(video, streamUrl)
					video.onloadeddata = () => resolve()
					setTimeout(resolve, 1500)
				})
			})
			return true
		} catch (err) {
			message.error(friendlyError(err))
			return false
		} finally {
			loading.value = false
		}
	}

	const reset = () => {
		if (source.value?.url) revokeStreamUrl(source.value)
		source.value = null
		duration.value = 0
		videoInfo.value = { width: 0, height: 0 }
	}

	onUnmounted(() => {
		if (source.value?.url) revokeStreamUrl(source.value)
	})

	return { source, duration, videoInfo, loading, videoRef, handleFiles, reset }
}
