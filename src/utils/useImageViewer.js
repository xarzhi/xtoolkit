import { nextTick, onUnmounted, ref } from 'vue'
import Viewer from 'viewerjs'
import 'viewerjs/dist/viewer.css'

/** Viewer.js 的创建参数：全屏遮罩、只留文件名、去掉幻灯片按钮 */
const VIEWER_OPTIONS = {
	inline: false,
	title: image => image.alt || '',
	navbar: false,
	loading: true,
	transition: true,
	keyboard: true,
	movable: true,
	zoomable: true,
	scalable: true,
	rotatable: true,
	loop: true,
	zoomRatio: 0.12,
	minZoomRatio: 0.1,
	maxZoomRatio: 12,
	toolbar: {
		zoomIn: true,
		zoomOut: true,
		oneToOne: true,
		reset: true,
		prev: true,
		next: true,
		rotateLeft: true,
		rotateRight: true,
		flipHorizontal: true,
		flipVertical: true,
		play: false,
	},
}

/**
 * 图片全屏预览（Viewer.js）。
 *
 * 用法：模板里放一个宿主容器，把当前这一组图片 v-for 渲染进去——
 * ```html
 * <div ref="hostRef" class="viewer-host" aria-hidden="true">
 *   <img v-for="s in sources" :key="s.key" :src="s.url" :alt="s.name" />
 * </div>
 * ```
 * 宿主必须是「有布局但看不见」（position:fixed + 移出屏幕），不能 display:none，
 * 库要靠这些 <img> 建预览列表。
 *
 * @param {() => { key: string, url: string, name: string }[]} getSources 当前这一组图源
 */
export function useImageViewer(getSources) {
	const hostRef = ref(null)
	let instance = null

	const ensure = () => {
		if (instance || !hostRef.value) return instance
		instance = new Viewer(hostRef.value, VIEWER_OPTIONS)
		return instance
	}

	/** 关闭动画还没结束时 view() 会被库直接忽略，等它收完再开 */
	const waitIdle = async viewer => {
		const start = performance.now()
		while (viewer.hiding && performance.now() - start < 1000) {
			await new Promise(resolve => setTimeout(resolve, 30))
		}
	}

	/** 打开预览并定位到 key 对应的那张（找不到就显示第一张） */
	const open = async key => {
		// 等 v-for 把这一组图挂上去，再让 Viewer 重新收图
		await nextTick()
		const viewer = ensure()
		if (!viewer) return
		await waitIdle(viewer)
		viewer.update()
		const index = getSources().findIndex(source => source.key === key)
		viewer.view(index < 0 ? 0 : index)
	}

	const close = () => instance?.hide()

	const destroy = () => {
		instance?.destroy()
		instance = null
	}

	onUnmounted(destroy)

	return { hostRef, open, close, destroy, getViewer: () => instance }
}
