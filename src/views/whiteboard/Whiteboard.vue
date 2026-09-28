<template>
	<div class="tool whiteboard">
		<h1 class="tool-title">
			白板
		</h1>

		<a-alert v-if="mountError" type="error" show-icon :message="`白板组件加载失败：${mountError}`" class="alert" />

		<div class="canvas-wrap" :class="{ 'drag-over': dragOver }" ref="containerRef">
			<div v-if="dragOver" class="drop-hint">松开鼠标：图片会插入白板，.excalidraw 文件会直接打开</div>
		</div>
	</div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
	Excalidraw,
	MainMenu,
	convertToExcalidrawElements,
	getCommonBounds,
	getSceneVersion,
	restore,
	serializeAsJSON,
	viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { IMAGE_EXTS, bytesToDataUrl, extname, joinPath, loadImageFromUrl, sniffMime } from '@/utils/image'
import {
	ensureDir,
	friendlyError,
	isTauri,
	openFiles,
	pathExists,
	readSourceBytes,
	readSourceText,
	saveBytesAs,
	saveTextAs,
	writeText,
} from '@/utils/tauriIO'
import { toggleTheme as toggleGlobalTheme, uiState } from '@/utils/uiState'

const AUTOSAVE_NAME = 'whiteboard-autosave.excalidraw'
const AUTOSAVE_KEY = 'xtools-whiteboard-autosave'

const containerRef = ref(null)
const api = ref(null)
const ready = ref(false)
const mountError = ref('')
const dragOver = ref(false)
const storageLabel = ref('')
const hydrated = ref(false)
/** 当前关联的白板文件（打开/另存为后由它决定写回哪里） */
const currentFile = ref('')
/** 是否改动后自动保存 */
const autoSave = ref(true)

let root = null
let saveTimer = null
let unlistenDrop = null
const storage = { kind: '', path: '' }

/* ---------------- 存档位置与读写 ---------------- */

const resolveStorage = async () => {
	if (isTauri()) {
		try {
			const { appDataDir } = await import('@tauri-apps/api/path')
			const dir = await appDataDir()
			// 首次运行时应用数据目录可能还不存在，先创建
			await ensureDir(dir)
			storage.kind = 'file'
			storage.path = joinPath(dir, AUTOSAVE_NAME)
			storageLabel.value = storage.path
			return
		} catch {
			/* 退回到 localStorage */
		}
	}
	storage.kind = 'local'
	storage.path = `localStorage:${AUTOSAVE_KEY}`
	storageLabel.value = '浏览器 localStorage（应用内为 %APPDATA% 目录）'
}

const readAutosaveText = async () => {
	if (storage.kind === 'file') {
		if (!(await pathExists(storage.path))) return ''
		return await readSourceText(storage.path)
	}
	return localStorage.getItem(AUTOSAVE_KEY) || ''
}

const writeAutosaveText = async text => {
	if (storage.kind === 'file') {
		await writeText(storage.path, text)
		return
	}
	localStorage.setItem(AUTOSAVE_KEY, text)
}

let quotaWarned = false
let lastSavedVersion = -1

/** 把当前场景写回指定文件（不弹对话框） */
const writeSceneToFile = async (path, { silent = false } = {}) => {
	const instance = api.value
	if (!instance || !path) return false
	const elements = instance.getSceneElements()
	const json = serializeAsJSON(elements, instance.getAppState(), instance.getFiles(), 'local')
	await writeText(path, json)
	lastSavedVersion = getSceneVersion(elements)
	if (!silent) message.success(`已保存到 ${path}`)
	return true
}

/** 保存：有关联文件就直接写回，没有就走另存为 */
const saveScene = async () => {
	try {
		if (currentFile.value) {
			await writeSceneToFile(currentFile.value)
			return
		}
		await saveSceneAs()
	} catch (err) {
		message.error(friendlyError(err))
	}
}

/** 另存为：选一个新位置并设为当前文件 */
const saveSceneAs = async () => {
	const scene = getScene()
	if (!scene) return
	try {
		const json = serializeAsJSON(scene.elements, scene.appState, scene.files, 'local')
		const defaultName = currentFile.value ? String(currentFile.value).split(/[\\/]/).pop() : '白板.excalidraw'
		const path = await saveTextAs(json, {
			defaultPath: defaultName,
			filters: [{ name: 'Excalidraw 白板', extensions: ['excalidraw'] }],
		})
		if (!path) return
		currentFile.value = path
		lastSavedVersion = getSceneVersion(scene.elements)
		message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

/** 没有关联文件时的兜底：写应用数据目录里的自动存档 */
const saveAutosave = async () => {
	const instance = api.value
	if (!instance) return
	try {
		const elements = instance.getSceneElements()
		// 只是选中/平移等操作不产生新版本，跳过写入，避免大场景频繁落盘
		const version = getSceneVersion(elements)
		if (version === lastSavedVersion) return
		const json = serializeAsJSON(elements, instance.getAppState(), instance.getFiles(), 'local')
		await writeAutosaveText(json)
		lastSavedVersion = version
	} catch (err) {
		// 浏览器里 localStorage 有 5MB 左右上限，插了大图时可能写不下（应用内写文件没有此限制）
		if (!quotaWarned) {
			quotaWarned = true
			message.warning('自动保存失败（内容可能过大），建议用菜单里的「另存为」导出工程文件')
		}
		console.warn('自动保存失败', err)
	}
}

/** 自动保存：关联了文件就写文件，否则写内部存档 */
const runAutoSave = async () => {
	if (!autoSave.value) return
	try {
		if (currentFile.value) await writeSceneToFile(currentFile.value, { silent: true })
		else await saveAutosave()
	} catch (err) {
		message.error(`自动保存失败：${friendlyError(err)}`)
	}
}

const scheduleSave = () => {
	if (!hydrated.value) return
	if (saveTimer) clearTimeout(saveTimer)
	saveTimer = setTimeout(runAutoSave, 800)
}

/* ---------------- 场景载入 / 导出 ---------------- */

/** 载入 .excalidraw 文本（菜单打开文件、拖入文件、恢复自动存档都走这里） */
const applySceneText = async (text, { silent = false } = {}) => {
	const instance = api.value
	if (!instance) throw new Error('白板还没准备好')
	const data = JSON.parse(text)
	if (!data || !Array.isArray(data.elements)) throw new Error('不是有效的 .excalidraw 文件（缺少 elements 字段）')
	// 注意：restore 的第一个参数是 { elements, appState, files } 对象，不是 elements 数组
	const restored = restore({ elements: data.elements, appState: data.appState, files: data.files }, null, null)
	const fileList = Object.values(restored.files || {})
	if (fileList.length) {
		try {
			instance.addFiles(fileList)
		} catch (err) {
			console.warn('附件载入失败', err)
		}
	}
	instance.updateScene({ elements: restored.elements })
	// 用自己实现的适应内容（官方 fitToViewport 会被 10% 下限卡住，大场景看不全）
	requestAnimationFrame(() => {
		try {
			fitToContent(restored.elements)
		} catch {
			/* 版本差异，忽略 */
		}
	})
	if (!silent) message.success(`已载入白板（${restored.elements.length} 个元素）`)
	return restored
}

const getScene = () => {
	const instance = api.value
	if (!instance) return null
	return {
		elements: instance.getSceneElements(),
		appState: instance.getAppState(),
		files: instance.getFiles(),
	}
}

const openScene = async () => {
	if (!api.value) return
	try {
		const files = await openFiles({
			multiple: false,
			title: '打开白板文件',
			filters: [{ name: 'Excalidraw 白板', extensions: ['excalidraw', 'json'] }],
		})
		if (!files?.length) return
		const text = await readSourceText(files[0])
		await applySceneText(text)
		// 直接接管这个文件：之后的改动都会写回它
		currentFile.value = typeof files[0] === 'string' ? files[0] : ''
		lastSavedVersion = getSceneVersion(api.value.getSceneElements())
		message.success(currentFile.value ? `已打开并关联文件：${currentFile.value}` : '已载入')
	} catch (err) {
		message.error(`白板文件解析失败：${friendlyError(err)}`)
	}
}

/* 导出图片改用 Excalidraw 自带的「导出图片 / 保存为图片」菜单项（见 buildMainMenu） */

const confirmClear = () => {
	Modal.confirm({
		title: '清空画布？',
		content: '清空后无法撤销，建议先「保存白板」导出工程文件。清空后自动存档也会同步为空。',
		okText: '清空',
		okType: 'danger',
		cancelText: '取消',
		onOk: () => {
			api.value?.updateScene({ elements: [] })
			message.success('画布已清空')
		},
	})
}

// 画布主题跟随全局明暗主题（顶部栏那个按钮切换）
const theme = computed(() => uiState.theme)

const toggleTheme = () => {
	toggleGlobalTheme()
}

// 全局主题变化时同步给 Excalidraw（画布底色只在它还是默认值时跟着换，不覆盖自定义底色）
const CANVAS_BG = { light: '#ffffff', dark: '#121212' }
watch(theme, next => {
	try {
		const instance = api.value
		if (!instance) return
		const patch = { theme: next }
		const current = String(instance.getAppState()?.viewBackgroundColor || '').toLowerCase()
		if (!current || current === CANVAS_BG.light || current === CANVAS_BG.dark) {
			patch.viewBackgroundColor = CANVAS_BG[next]
		}
		instance.updateScene({ appState: patch })
	} catch {
		/* 忽略 */
	}
})

const toggleAutoSave = () => {
	autoSave.value = !autoSave.value
	if (autoSave.value) {
		message.success('已开启自动保存：改动后会写回文件')
		// 立刻补存一次，避免刚才的改动还悬着
		runAutoSave()
	} else {
		message.info('已关闭自动保存')
	}
}

/* ---------------- 拖拽：图片 / 白板文件 ---------------- */

const imageSize = async dataURL => {
	try {
		const img = await loadImageFromUrl(dataURL)
		const width = img.naturalWidth || img.width
		const height = img.naturalHeight || img.height
		if (width && height) return { width, height }
	} catch {
		/* 退回到默认尺寸 */
	}
	return { width: 320, height: 240 }
}

/**
 * 把本地图片插入白板
 * sources 可以是 Tauri 路径字符串，也可以是浏览器里的 File（方便调试）
 */
const insertImages = async (sources, position) => {
	const instance = api.value
	if (!instance) return 0
	const container = containerRef.value
	const dpr = window.devicePixelRatio || 1
	const rect = container?.getBoundingClientRect()
	const clientX = position ? position.x / dpr : (rect ? rect.left + rect.width / 2 : 200)
	const clientY = position ? position.y / dpr : (rect ? rect.top + rect.height / 2 : 200)
	const scenePoint = viewportCoordsToSceneCoords({ clientX, clientY }, instance.getAppState())

	const nameOf = source => (typeof source === 'string' ? source.split(/[\\/]/).pop() : source?.name || '图片')
	const files = []
	const elements = []
	let offset = 0

	for (const source of sources) {
		try {
			const bytes = await readSourceBytes(source)
			const mime = sniffMime(bytes)
			if (!mime.startsWith('image/')) continue
			const dataURL = bytesToDataUrl(bytes, mime)
			const size = await imageSize(dataURL)
			const scale = Math.min(1, 520 / Math.max(size.width, size.height))
			const width = Math.max(24, size.width * scale)
			const height = Math.max(24, size.height * scale)
			const fileId = `xtools-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
			files.push({
				id: fileId,
				mimeType: mime,
				dataURL,
				created: Date.now(),
				lastRetrieved: Date.now(),
			})
			const created = convertToExcalidrawElements([
				{
					type: 'image',
					x: scenePoint.x - width / 2 + offset,
					y: scenePoint.y - height / 2 + offset,
					width,
					height,
					fileId,
					// 文件已经写进场景的 files 里，标记为已保存，避免一直显示"未保存"
					status: 'saved',
				},
			])
			elements.push(...created)
			offset += 28
		} catch (err) {
			message.error(`${nameOf(source)}：${friendlyError(err)}`)
		}
	}

	if (!elements.length) return 0
	instance.addFiles(files)
	instance.updateScene({ elements: [...instance.getSceneElements(), ...elements] })
	return elements.length
}

const isImageSource = source => {
	const name = typeof source === 'string' ? source : source?.name || ''
	return IMAGE_EXTS.includes(extname(name))
}

/** 拖入 .excalidraw 时也顺手关联文件 */
const handleDroppedPaths = async (paths, position) => {
	const sceneFile = paths.find(path => typeof path === 'string' && /\.excalidraw$/i.test(path))
	if (sceneFile) {
		try {
			await applySceneText(await readSourceText(sceneFile))
			currentFile.value = sceneFile
			lastSavedVersion = getSceneVersion(api.value?.getSceneElements() || [])
			message.success(`已打开并关联文件：${sceneFile}`)
		} catch (err) {
			message.error(`白板文件解析失败：${friendlyError(err)}`)
		}
		return
	}
	const images = paths.filter(isImageSource)
	if (!images.length) {
		message.warning('拖入的内容里没有图片或 .excalidraw 文件')
		return
	}
	const count = await insertImages(images, position)
	if (count) message.success(`已插入 ${count} 张图片`)
}

const setupTauriDragDrop = async () => {
	if (!isTauri()) return
	try {
		const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
		unlistenDrop = await getCurrentWebviewWindow().onDragDropEvent(async event => {
			const { type, paths, position } = event.payload
			if (type === 'over') {
				dragOver.value = isInsideWhiteboard(position)
				return
			}
			if (type === 'drop') {
				const inside = isInsideWhiteboard(position)
				dragOver.value = false
				if (inside && paths?.length) await handleDroppedPaths(paths, position)
				return
			}
			if (type === 'leave' || type === 'cancel') dragOver.value = false
		})
	} catch (err) {
		console.warn('拖拽监听注册失败', err)
	}
}

const isInsideWhiteboard = position => {
	const el = containerRef.value
	if (!el || !position) return false
	const rect = el.getBoundingClientRect()
	const dpr = window.devicePixelRatio || 1
	const x = position.x / dpr
	const y = position.y / dpr
	return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

/* ---------------- 缩放：解除 Excalidraw 的 10% 下限 ---------------- */

/**
 * Excalidraw 内部把缩放夹在 [MIN_ZOOM, MAX_ZOOM] = [0.1, 30]，MIN_ZOOM 是模块常量、无法通过 props 修改。
 * 这里不改它的源码，而是：
 *  1) 用 updateScene 直接写入更小的 zoom（实测不会被夹回）
 *  2) Ctrl/⌘ + 滚轮 落到 10% 附近时接管手势，自己算「以光标为锚点」的缩放
 *  3) 提供不套用 10% 下限的「适应全部内容」
 * 只保留 0.1% 的安全下限，避免 zoom 归零后坐标出现 Infinity / NaN。
 */
const EXCALIDRAW_MIN_ZOOM = 0.1
const MIN_ZOOM_CUSTOM = 0.001
const MAX_ZOOM_LIMIT = 30

const applyZoom = (nextZoom, clientX, clientY) => {
	const instance = api.value
	const container = containerRef.value
	if (!instance || !container) return null
	const appState = instance.getAppState()
	const zoom = Math.min(MAX_ZOOM_LIMIT, Math.max(MIN_ZOOM_CUSTOM, nextZoom))
	const rect = container.getBoundingClientRect()
	const clientPoint = {
		clientX: clientX ?? rect.left + rect.width / 2,
		clientY: clientY ?? rect.top + rect.height / 2,
	}
	// 保持光标下的场景点不动：viewportCoordsToSceneCoords 的逆运算
	const scenePoint = viewportCoordsToSceneCoords(clientPoint, appState)
	instance.updateScene({
		appState: {
			zoom: { value: zoom },
			scrollX: (clientPoint.clientX - (appState.offsetLeft ?? 0)) / zoom - scenePoint.x,
			scrollY: (clientPoint.clientY - (appState.offsetTop ?? 0)) / zoom - scenePoint.y,
		},
	})
	return zoom
}

const zoomTo = value => applyZoom(value)

/** 适应全部内容（可低于 Excalidraw 的 10% 下限） */
const fitToContent = (elements, padding = 48) => {
	const instance = api.value
	const container = containerRef.value
	if (!instance || !container) return null
	const list = (elements || instance.getSceneElements()).filter(element => !element.isDeleted)
	if (!list.length) return null
	const appState = instance.getAppState()
	const [minX, minY, maxX, maxY] = getCommonBounds(list)
	const contentW = Math.max(1, maxX - minX)
	const contentH = Math.max(1, maxY - minY)
	const rect = container.getBoundingClientRect()
	const viewW = Math.max(80, (appState.width || rect.width) - padding * 2)
	const viewH = Math.max(80, (appState.height || rect.height) - padding * 2)
	const zoom = Math.min(MAX_ZOOM_LIMIT, Math.max(MIN_ZOOM_CUSTOM, Math.min(viewW / contentW, viewH / contentH, 1)))
	const centerX = (minX + maxX) / 2
	const centerY = (minY + maxY) / 2
	const viewportCenterX = rect.left + rect.width / 2
	const viewportCenterY = rect.top + rect.height / 2
	instance.updateScene({
		appState: {
			zoom: { value: zoom },
			scrollX: (viewportCenterX - (appState.offsetLeft ?? 0)) / zoom - centerX,
			scrollY: (viewportCenterY - (appState.offsetTop ?? 0)) / zoom - centerY,
		},
	})
	return zoom
}

const isInsideWhiteboardNode = node => {
	const container = containerRef.value
	return !!(container && node && (node === container || container.contains(node)))
}

/** Ctrl/⌘ + 滚轮：接近或低于 10% 时由这里接管，可继续无限缩小 */
const onWheelCapture = event => {
	if (!(event.ctrlKey || event.metaKey)) return
	if (!isInsideWhiteboardNode(event.target)) return
	const instance = api.value
	if (!instance) return
	const current = instance.getAppState().zoom.value
	const factor = Math.exp(-event.deltaY * 0.0016)
	const next = current * factor
	// 仍在 10% 以上、且不会越过下限时交回 Excalidraw，保持它原本的手感
	if (current > EXCALIDRAW_MIN_ZOOM + 1e-4 && next >= EXCALIDRAW_MIN_ZOOM) return
	event.preventDefault()
	event.stopPropagation()
	applyZoom(next, event.clientX, event.clientY)
}

/** Ctrl/⌘ + +/-：低于 10% 之后同样接管，保证还能放大回来 */
const onKeyDownCapture = event => {
	if (!(event.ctrlKey || event.metaKey)) return
	const key = event.key
	if (key !== '-' && key !== '_' && key !== '=' && key !== '+') return
	const active = document.activeElement
	if (active && active !== document.body && active.matches?.('input, textarea, [contenteditable="true"]')) return
	const instance = api.value
	if (!instance) return
	const current = instance.getAppState().zoom.value
	if (current > EXCALIDRAW_MIN_ZOOM + 1e-4) return
	event.preventDefault()
	event.stopPropagation()
	applyZoom(current * (key === '-' || key === '_' ? 1 / 1.1 : 1.1))
}

/** Ctrl/⌘ + S：保存到当前文件（接管 Excalidraw 自带的下载行为） */
const onKeyDownSave = event => {
	if (!(event.ctrlKey || event.metaKey)) return
	if (event.key !== 's' && event.key !== 'S') return
	event.preventDefault()
	event.stopPropagation()
	saveScene()
}

/* ---------------- 自定义主菜单 ---------------- */

const menuItem = (key, label, onSelect, extra = {}) => createElement(MainMenu.Item, { key, onSelect, ...extra }, label)

const currentFileName = computed(() => {
	const path = currentFile.value
	if (!path) return '未关联文件'
	return String(path).split(/[\\/]/).pop()
})

const buildMainMenu = () =>
	createElement(
		MainMenu,
		null,
		// 直接操作文件
		menuItem('xtools-save', '保存', saveScene, { shortcut: 'Ctrl+S' }),
		menuItem('xtools-save-as', '另存为…', saveSceneAs),
		menuItem('xtools-open', '打开白板…', openScene),
		menuItem('xtools-autosave', `自动保存${autoSave.value ? '（已开启）' : '（已关闭）'}`, () => toggleAutoSave(), {
			selected: autoSave.value,
		}),
		menuItem('xtools-current', `当前文件：${currentFileName.value}`, () => {
			Modal.info({
				title: '当前编辑的文件',
				content: currentFile.value || `尚未关联文件（改动会自动存到内部存档：${storage.path || '未初始化'}）`,
				okText: '知道了',
			})
		}),
		createElement(MainMenu.Separator, { key: 'sep-1' }),
		// 图片导出用 Excalidraw 自带的
		createElement(MainMenu.DefaultItems.Export, { key: 'excalidraw-export' }),
		createElement(MainMenu.DefaultItems.SaveAsImage, { key: 'excalidraw-save-image' }),
		createElement(MainMenu.Separator, { key: 'sep-2' }),
		menuItem('xtools-clear', '清空画布', confirmClear),
		menuItem('xtools-theme', '切换深浅色', toggleTheme),
		createElement(MainMenu.Separator, { key: 'sep-zoom' }),
		// 缩放：官方 10% 下限之外的部分
		menuItem('xtools-fit', '适应全部内容（不卡 10%）', () => fitToContent()),
		menuItem('xtools-zoom-10', '缩放到 10%', () => zoomTo(0.1)),
		menuItem('xtools-zoom-1', '缩放到 1%', () => zoomTo(0.01)),
		menuItem('xtools-zoom-01', '缩放到 0.1%（最小）', () => zoomTo(MIN_ZOOM_CUSTOM)),
		menuItem('xtools-zoom-100', '重置缩放（100%）', () => zoomTo(1)),
		createElement(MainMenu.Separator, { key: 'sep-3' }),
		createElement(MainMenu.DefaultItems.ChangeCanvasBackground, { key: 'excalidraw-bg' }),
		createElement(MainMenu.DefaultItems.Help, { key: 'excalidraw-help' })
	)

/* ---------------- 挂载 ---------------- */

const waitForApi = async (timeout = 15000) => {
	const started = Date.now()
	while (!api.value) {
		if (Date.now() - started > timeout) throw new Error('白板初始化超时')
		await new Promise(resolve => setTimeout(resolve, 60))
	}
	return api.value
}

/** 渲染（或重渲染）画板与主菜单：菜单里显示当前文件与自动保存状态，所以状态变化时需要重渲染 */
const renderBoard = () => {
	if (!root) return
	root.render(
		createElement(
			Excalidraw,
			{
				excalidrawAPI: instance => {
					api.value = instance
					ready.value = true
				},
				theme: theme.value,
				langCode: 'zh-CN',
				initialData: { appState: { viewBackgroundColor: CANVAS_BG[theme.value] || CANVAS_BG.light } },
				// 每次改动都触发，用于自动保存
				onChange: () => scheduleSave(),
				UIOptions: {
					canvasActions: {
						loadScene: false,
						// 注意：export 必须是对象。传 true 时 Excalidraw 0.18 会执行
						// `export.saveFileToDisk = ...` 而抛 TypeError，整个白板都渲染不出来
						export: { saveFileToDisk: false },
						saveToActiveFile: false,
						saveAsImage: true,
						clearCanvas: false,
						toggleTheme: false,
						// 需要保持开启，否则官方「画布背景」菜单项会返回 null
						changeViewBackgroundColor: true,
					},
				},
			},
			buildMainMenu()
		)
	)
}

onMounted(async () => {
	const container = containerRef.value
	if (!container) return
	try {
		root = createRoot(container)
		renderBoard()
		// 菜单里要显示文件名与自动保存开关状态，这两项变化时重渲染
		watch([currentFile, autoSave], () => renderBoard())

		await waitForApi()
		await resolveStorage()
		let restored = false
		try {
			const text = await readAutosaveText()
			if (text && text.trim()) {
				await applySceneText(text, { silent: true })
				restored = true
			}
		} catch (err) {
			console.warn('恢复自动存档失败', err)
		}
		// 恢复完成后才允许自动保存，避免空场景把存档覆盖掉
		hydrated.value = true
		if (restored) message.success('已恢复上次绘制的内容')
		await setupTauriDragDrop()
		// 解除 10% 缩放下限：接管 Ctrl/⌘ + 滚轮 与 Ctrl/⌘ + +/-
		document.addEventListener('wheel', onWheelCapture, { capture: true, passive: false })
		document.addEventListener('keydown', onKeyDownCapture, { capture: true })
		// Ctrl/⌘ + S 保存到当前文件
		document.addEventListener('keydown', onKeyDownSave, { capture: true })

		if (import.meta.env.DEV) {
			window.__whiteboardTest = {
				applySceneText,
				insertImages,
				handleDroppedPaths,
				api: () => api.value,
				zoom: () => api.value?.getAppState()?.zoom?.value,
				zoomTo,
				fitToContent,
				saveScene,
				saveSceneAs,
				currentFile: () => currentFile.value,
				setCurrentFile: value => {
					currentFile.value = value
				},
				autoSave: () => autoSave.value,
				toggleAutoSave,
				// 模拟 ctrl+滚轮，用于确认缩放上下限
				wheelZoom: (deltaY, times, ctrl = true) => {
					const target = containerRef.value?.querySelector('.excalidraw__canvas') || containerRef.value
					for (let i = 0; i < times; i += 1) {
						target.dispatchEvent(
							new WheelEvent('wheel', {
								deltaY,
								clientX: 400,
								clientY: 300,
								ctrlKey: ctrl,
								bubbles: true,
								cancelable: true,
							})
						)
					}
				},
				// 事件之间隔一段时间，贴近真实手势（updateScene 异步生效，同步连发只会算一次）
				wheelZoomAsync: async (deltaY, times, gap = 24, ctrl = true) => {
					const target = containerRef.value?.querySelector('.excalidraw__canvas') || containerRef.value
					for (let i = 0; i < times; i += 1) {
						target.dispatchEvent(
							new WheelEvent('wheel', {
								deltaY,
								clientX: 400,
								clientY: 300,
								ctrlKey: ctrl,
								bubbles: true,
								cancelable: true,
							})
						)
						await new Promise(resolve => setTimeout(resolve, gap))
					}
				},
				stats: () => {
					const elements = api.value?.getSceneElements?.() || []
					const types = {}
					for (const element of elements) types[element.type] = (types[element.type] || 0) + 1
					return {
						elements: elements.length,
						types,
						images: elements
							.filter(element => element.type === 'image')
							.map(element => ({
								fileId: String(element.fileId || '').slice(0, 18),
								status: element.status,
								size: `${Math.round(element.width)}x${Math.round(element.height)}`,
							}))
							.slice(-3),
						files: Object.keys(api.value?.getFiles?.() || {}).length,
						hydrated: hydrated.value,
						storage: storage.path,
					}
				},
			}
		}
	} catch (err) {
		mountError.value = err?.message || String(err)
	}
})

onUnmounted(() => {
	if (saveTimer) clearTimeout(saveTimer)
	if (typeof unlistenDrop === 'function') unlistenDrop()
	document.removeEventListener('wheel', onWheelCapture, { capture: true })
	document.removeEventListener('keydown', onKeyDownCapture, { capture: true })
	document.removeEventListener('keydown', onKeyDownSave, { capture: true })
	if (import.meta.env.DEV && typeof window !== 'undefined') delete window.__whiteboardTest
	try {
		root?.unmount()
	} catch {
		/* 忽略 */
	}
	root = null
	api.value = null
	ready.value = false
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.whiteboard {
	.alert {
		flex: none;
		margin-bottom: 10px;
	}
	.canvas-wrap {
		flex: 1;
		min-height: 0;
		position: relative;
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid var(--border-color);
		background: var(--panel-bg);
		transition: box-shadow 0.2s ease;
		// Excalidraw 需要一个有确定高度的容器
		:deep(.excalidraw) {
			height: 100%;
		}
		&.drag-over {
			box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.55) inset;
		}
		.drop-hint {
			position: absolute;
			left: 50%;
			top: 16px;
			transform: translateX(-50%);
			z-index: 20;
			padding: 6px 14px;
			border-radius: 999px;
			background: rgba(22, 119, 255, 0.92);
			color: #fff;
			font-size: 13px;
			pointer-events: none;
		}
	}
}
</style>
