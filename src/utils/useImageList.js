import { computed, ref } from 'vue'
import { IMAGE_EXTS, decodeImageBytes, extname, sniffMime } from './image'
import { probeGif } from './gifDecode'
import { readSourceBytes } from './tauriIO'

let seed = 0

/**
 * 图片列表管理：读取字节、解码预览、记录尺寸，供各图片工具页复用
 */
export function useImageList({ filterImage = true } = {}) {
	const items = ref([])
	const loading = ref(false)
	const totalSize = computed(() => items.value.reduce((sum, i) => sum + (i.size || 0), 0))

	const remove = id => {
		const target = items.value.find(i => i.id === id)
		if (target?.url) URL.revokeObjectURL(target.url)
		if (target?.out?.blobUrl) URL.revokeObjectURL(target.out.blobUrl)
		items.value = items.value.filter(i => i.id !== id)
	}

	const clear = () => {
		items.value.forEach(i => {
			if (i.url) URL.revokeObjectURL(i.url)
			if (i.out?.blobUrl) URL.revokeObjectURL(i.out.blobUrl)
		})
		items.value = []
	}

	/**
	 * @param {(string|File)[]} sources Tauri 路径或浏览器 File
	 * @returns {Promise<string[]>} 出错信息列表
	 */
	const addSources = async sources => {
		const list = (Array.isArray(sources) ? sources : [sources]).filter(Boolean)
		const errors = []
		loading.value = true
		try {
			for (const source of list) {
				const name = typeof source === 'string' ? source.split(/[\\/]/).pop() : source.name || '未命名'
				const ext = extname(name)
				if (filterImage && ext && !IMAGE_EXTS.includes(ext)) {
					errors.push(`${name}：不是支持的图片格式`)
					continue
				}
				try {
					const bytes = await readSourceBytes(source)
					const mime = sniffMime(bytes)
					if (filterImage && !mime.startsWith('image/') && ext !== 'svg') {
						errors.push(`${name}：无法识别为图片`)
						continue
					}
					const decoded = await decodeImageBytes(bytes, mime)
					// GIF 额外解析结构，拿到帧数等信息（不做像素解码，速度很快）
					let gif = null
					if (mime === 'image/gif') {
						try {
							gif = probeGif(bytes)
						} catch {
							gif = null
						}
					}
					items.value.push({
						id: `img_${(seed += 1)}`,
						source,
						path: typeof source === 'string' ? source : '',
						name,
						ext,
						mime,
						bytes,
						url: decoded.url,
						width: decoded.width,
						height: decoded.height,
						size: bytes.length,
						status: 'ready',
						gif,
					})
				} catch (err) {
					errors.push(`${name}：${err?.message || err}`)
				}
			}
		} finally {
			loading.value = false
		}
		return errors
	}

	return { items, loading, totalSize, addSources, remove, clear }
}
