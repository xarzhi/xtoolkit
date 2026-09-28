import { onMounted, onUnmounted, ref } from 'vue'

/**
 * 按容器可用宽度与最大高度，等比计算"媒体显示尺寸"。
 *
 * 为什么需要它：如果只用 CSS 的 max-width/max-height，盒子会被压扁，
 * 图片/视频会被拉伸（object-fit: fill）或与叠加层错位，导致裁剪框和画面不一致。
 * 这里由 JS 算出精确的宽高，保证显示盒子的宽高比与素材本身完全一致。
 */
export function useFitBox({ maxWidth = 860, maxHeight = 520 } = {}) {
	const containerRef = ref(null)
	const availableWidth = ref(maxWidth)
	let observer = null

	const measure = () => {
		const el = containerRef.value
		if (!el) return
		const width = el.clientWidth || maxWidth
		availableWidth.value = Math.max(120, Math.min(width, maxWidth))
	}

	onMounted(() => {
		measure()
		if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
			observer = new ResizeObserver(measure)
			observer.observe(containerRef.value)
		} else {
			window.addEventListener('resize', measure)
		}
	})

	onUnmounted(() => {
		if (observer) observer.disconnect()
		else window.removeEventListener('resize', measure)
	})

	/** 返回等比缩放后的显示尺寸（px） */
	const fit = (width, height) => {
		if (!width || !height) return { width: '0px', height: '0px' }
		const scale = Math.min(1, availableWidth.value / width, maxHeight / height)
		return {
			width: `${Math.max(1, Math.round(width * scale))}px`,
			height: `${Math.max(1, Math.round(height * scale))}px`,
		}
	}

	return { containerRef, availableWidth, fit, measure }
}
