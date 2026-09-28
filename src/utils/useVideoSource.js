import { onUnmounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { friendlyError, readSourceBytes } from './tauriIO'
import { VIDEO_FILTER, createVideoElement } from './video'

/**
 * 视频类页面的公共逻辑：选择文件、读取元数据、绑定到页面上的 video 元素
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
			const bytes = await readSourceBytes(list[0])
			const name = typeof list[0] === 'string' ? list[0].split(/[\\/]/).pop() : list[0].name
			const blobUrl = URL.createObjectURL(new Blob([bytes]))
			const probe = await createVideoElement(blobUrl)
			const info = { width: probe.videoWidth, height: probe.videoHeight }
			const total = Number.isFinite(probe.duration) ? probe.duration : 0
			probe.removeAttribute('src')
			try {
				probe.load()
			} catch {
				/* 忽略 */
			}

			if (source.value?.url) URL.revokeObjectURL(source.value.url)
			source.value = { name, url: blobUrl, size: bytes.length }
			videoInfo.value = info
			duration.value = total

			await new Promise(resolve => {
				requestAnimationFrame(() => {
					const video = videoRef.value
					if (!video) {
						resolve()
						return
					}
					video.src = blobUrl
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
		if (source.value?.url) URL.revokeObjectURL(source.value.url)
		source.value = null
		duration.value = 0
		videoInfo.value = { width: 0, height: 0 }
	}

	onUnmounted(() => {
		if (source.value?.url) URL.revokeObjectURL(source.value.url)
	})

	return { source, duration, videoInfo, loading, videoRef, handleFiles, reset }
}
