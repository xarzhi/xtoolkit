<template>
	<div class="tool modelViewer">
		<h1 class="tool-title">
			3D 模型查看
			<span class="tip">拖入或选择任意受支持的 3D 文件，自动识别类型后直接查看</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<div
					class="stage"
					ref="stageRef"
					:class="{ dragging }"
					:style="{ background: settings.background }"
					@dragover.prevent="onDragOver"
					@dragleave.prevent="onDragLeave"
					@drop.prevent="onDrop"
				>
					<div class="canvas-wrap" ref="containerRef"></div>
					<div v-if="!modelLoaded && !loading" class="drop-tip">
						<div class="big">{{ errorText ? '加载失败' : '还没有模型' }}</div>
						<div class="hint">
							{{ errorText || '把 3D 文件（或装着模型的文件夹）拖到这里，也可以点击下方按钮选择' }}
						</div>
						<div class="ext-chips" v-if="!errorText">
							<span v-for="item in MODEL_FORMATS" :key="item.ext" class="chip">.{{ item.ext }}</span>
						</div>
					</div>
					<div v-if="dragging" class="drop-mask">
						<div class="big">松开鼠标，自动识别并加载</div>
						<div class="hint">支持 {{ MODEL_EXTS.join(' / ') }}；拖入文件夹时会连同外部贴图一起载入</div>
					</div>
					<a-spin v-if="loading" class="loading" size="large" tip="正在解析模型…" />
				</div>

				<div class="panel">
					<div class="tool-card block">
						<div class="block-title">模型信息</div>
						<a-descriptions :column="1" size="small" bordered>
							<a-descriptions-item label="文件">{{ info.name || '-' }}</a-descriptions-item>
							<a-descriptions-item label="识别格式">
								<span v-if="info.format">{{ info.format.label }}（.{{ info.format.ext }}）</span>
								<span v-else>-</span>
							</a-descriptions-item>
							<a-descriptions-item label="体积">{{ info.size ? formatBytes(info.size) : '-' }}</a-descriptions-item>
							<a-descriptions-item label="网格 / 材质">{{ info.meshes }} / {{ info.materials }}</a-descriptions-item>
							<a-descriptions-item label="三角面">{{ info.triangles.toLocaleString() }}</a-descriptions-item>
							<a-descriptions-item label="尺寸">{{ info.dimensions }}</a-descriptions-item>
							<a-descriptions-item label="动画">{{ info.animations }} 个</a-descriptions-item>
						</a-descriptions>
						<a-select
							v-if="animations.length > 1"
							v-model:value="activeAnimation"
							style="width: 100%; margin-top: 10px"
							:options="animations.map((item, index) => ({ label: item.name || `动画 ${index + 1}`, value: index }))"
							@change="playAnimation"
						/>
					</div>

					<div class="tool-card block">
						<div class="block-title">显示设置</div>
						<a-space direction="vertical" size="8" style="width: 100%">
							<a-space :size="16" wrap>
								<span class="switch-item">
									<a-switch v-model:checked="settings.wireframe" size="small" @change="stage?.applyWireframe()" />
									<span class="hint">线框</span>
								</span>
								<span class="switch-item">
									<a-switch v-model:checked="settings.grid" size="small" @change="stage?.applyGrid()" />
									<span class="hint">网格地面</span>
								</span>
								<span class="switch-item">
									<a-switch v-model:checked="settings.autoRotate" size="small" @change="stage?.applyAutoRotate()" />
									<span class="hint">自动旋转</span>
								</span>
								<span class="switch-item" v-if="animations.length">
									<a-switch v-model:checked="settings.playing" size="small" />
									<span class="hint">播放动画</span>
								</span>
							</a-space>
							<div class="bg-row">
								<span class="hint">背景</span>
								<input class="native-picker" type="color" :value="settings.background" @input="applyBackground" />
								<a-button size="small" @click="resetCamera">重置视角</a-button>
								<a-button size="small" :disabled="!modelLoaded" @click="saveScreenshot">截图保存</a-button>
							</div>
						</a-space>
					</div>

					<a-alert v-if="hintText" type="info" show-icon :message="hintText" />
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">左键旋转 · 右键平移 · 滚轮缩放</span>
			<a-space>
				<a-button @click="pickFile">选择 3D 文件</a-button>
				<a-button @click="pickFolder">选择文件夹</a-button>
				<a-button type="primary" :disabled="!modelLoaded" @click="resetCamera">重置视角</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { basename, extname, formatBytes } from '@/utils/image'
import { MODEL_EXTS, MODEL_FILTER, MODEL_FORMATS, detectModelFormat, isModelFile, loadModel } from '@/utils/model3d'
import { createModelStage } from '@/utils/useModelStage'
import { uiState } from '@/utils/uiState'
import {
	defaultOutputDir,
	friendlyError,
	isTauri,
	openFiles,
	pickDirectory,
	saveBytesAs,
} from '@/utils/tauriIO'

const containerRef = ref(null)
const stageRef = ref(null)
const dragging = ref(false)
let unlistenDrag = null

const loading = ref(false)
const modelLoaded = ref(false)
const errorText = ref('')
const hintText = ref('')
const animations = ref([])
const activeAnimation = ref(0)
let stage = null

const DEFAULT_STAGE_BG = { light: '#f5f6f8', dark: '#1a1a1a' }
const settings = reactive({
	wireframe: false,
	grid: true,
	autoRotate: false,
	playing: true,
	background: DEFAULT_STAGE_BG[uiState.theme] || DEFAULT_STAGE_BG.light,
})
const info = reactive({
	name: '',
	size: 0,
	format: null,
	meshes: 0,
	materials: 0,
	triangles: 0,
	dimensions: '-',
	animations: 0,
})

/* ---------------- 载入 ---------------- */

const applyLoaded = (loaded, name) => {
	animations.value = loaded.animations || []
	activeAnimation.value = 0
	stage.setModel(loaded.object, animations.value, loaded.urls)
	info.name = name
	info.size = loaded.size
	info.format = loaded.format
	info.animations = animations.value.length
	modelLoaded.value = true
	errorText.value = ''
	hintText.value = (loaded.warnings || []).join('；')
	message.success(`已识别为 ${loaded.format.label}，模型加载完成`)
}

/** 从磁盘路径载入（可以顺带把同目录的 .bin / 贴图 / .mtl 读进来） */
const loadFromPath = async path => {
	loading.value = true
	errorText.value = ''
	hintText.value = ''
	const name = basename(String(path))
	try {
		if (!isModelFile(name)) {
			throw new Error(`暂不支持 .${extname(name) || '未知'} 格式，当前支持 ${MODEL_EXTS.join(' / ')}`)
		}
		const loaded = await loadModel({ path, name })
		applyLoaded(loaded, name)
	} catch (err) {
		modelLoaded.value = false
		errorText.value = `加载失败：${friendlyError(err)}`
		message.error(errorText.value)
	} finally {
		loading.value = false
	}
}

/** 浏览器环境只有内存里的字节，没有同目录资源可读 */
const loadFromBytes = async (bytes, name) => {
	loading.value = true
	errorText.value = ''
	hintText.value = ''
	try {
		const loaded = await loadModel({ bytes, name })
		applyLoaded(loaded, name)
	} catch (err) {
		modelLoaded.value = false
		errorText.value = `加载失败：${friendlyError(err)}`
		message.error(errorText.value)
	} finally {
		loading.value = false
	}
}

const pickFile = async () => {
	try {
		const files = await openFiles({
			multiple: false,
			title: '选择 3D 模型文件',
			filters: [MODEL_FILTER],
		})
		if (!files?.length) return
		await loadFromPath(files[0])
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const pickFolder = async () => {
	if (!isTauri()) {
		message.warning('浏览器环境无法读取文件夹，请用「选择 3D 文件」')
		return
	}
	try {
		const dir = await pickDirectory({
			title: '选择包含模型的文件夹',
			defaultPath: (await defaultOutputDir()) || undefined,
		})
		if (!dir) return
		await loadFromDir(dir)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

/** 从文件夹里挑出第一个能识别的模型 */
const loadFromDir = async dir => {
	loading.value = true
	errorText.value = ''
	try {
		const { readDir } = await import('@tauri-apps/plugin-fs')
		const entries = await readDir(dir)
		const files = entries.filter(entry => entry.isFile).map(entry => entry.name)
		// 按 MODEL_FORMATS 的顺序优先，避免同目录里 .glb 和 .stl 随机选一个
		const picked = MODEL_FORMATS.map(item => files.find(name => extname(name) === item.ext)).find(Boolean)
		if (!picked) throw new Error(`这个文件夹里没有可识别的模型文件（支持 ${MODEL_EXTS.join(' / ')}）`)
		const sep = String(dir).includes('\\') ? '\\' : '/'
		await loadFromPath(`${String(dir).replace(/[\\/]+$/, '')}${sep}${picked}`)
	} catch (err) {
		modelLoaded.value = false
		errorText.value = `加载失败：${friendlyError(err)}`
		message.error(errorText.value)
	} finally {
		loading.value = false
	}
}

/* ---------------- 拖拽 ---------------- */

/** 拖拽位置是否落在视口内。Tauri 给的是物理像素，两种口径都试一次，兼顾高 DPI 缩放 */
const insideStage = point => {
	const el = stageRef.value
	// keep-alive 缓存的页面 DOM 已脱离文档，不响应拖拽
	if (!el || !el.isConnected) return false
	if (!point) return true
	const rect = el.getBoundingClientRect()
	const inRect = (x, y) => x > rect.left && x < rect.right && y > rect.top && y < rect.bottom
	const dpr = window.devicePixelRatio || 1
	return inRect(point.x, point.y) || inRect(point.x / dpr, point.y / dpr)
}

/** 拖进来的可能是模型文件，也可能是装着模型的文件夹 */
const loadFromDrop = async paths => {
	const list = (paths || []).map(String).filter(Boolean)
	if (!list.length) return
	const file = list.find(path => isModelFile(path))
	if (file) {
		await loadFromPath(file)
		return
	}
	await loadFromDir(list[0])
}

const onDragOver = () => {
	dragging.value = true
}
const onDragLeave = () => {
	dragging.value = false
}
const onDrop = async evt => {
	dragging.value = false
	const files = Array.from(evt.dataTransfer?.files || [])
	if (!files.length) return
	const file = files.find(item => isModelFile(item.name))
	if (!file) {
		message.warning(`请拖入 3D 模型文件（支持 ${MODEL_EXTS.join(' / ')}）`)
		return
	}
	await loadFromBytes(new Uint8Array(await file.arrayBuffer()), file.name)
}

/* ---------------- 显示设置 ---------------- */

const applyBackground = event => {
	settings.background = event.target.value
	stage?.setBackground(settings.background)
}

// 明暗主题切换时，如果底色还是默认值就跟着换（自己挑过颜色则保留）
watch(
	() => uiState.theme,
	next => {
		const current = String(settings.background || '').toLowerCase()
		if (current && current !== DEFAULT_STAGE_BG.light && current !== DEFAULT_STAGE_BG.dark) return
		settings.background = DEFAULT_STAGE_BG[next] || DEFAULT_STAGE_BG.light
		stage?.setBackground(settings.background)
	}
)

const resetCamera = () => {
	stage?.frame()
}

const playAnimation = () => {
	stage?.playClip(activeAnimation.value)
}

const saveScreenshot = async () => {
	try {
		const dataUrl = stage?.capture()
		if (!dataUrl) return
		const binary = atob(dataUrl.split(',')[1])
		const bytes = new Uint8Array(binary.length)
		for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
		const path = await saveBytesAs(bytes, {
			defaultPath: `${(info.name || 'model').replace(/\.[^.]+$/, '')}.png`,
			filters: [{ name: 'PNG', extensions: ['png'] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

/* ---------------- 生命周期 ---------------- */

onMounted(() => {
	stage = createModelStage(containerRef.value, {
		settings,
		onStats: stats => {
			info.meshes = stats.meshes
			info.materials = stats.materials
			info.triangles = stats.triangles
			info.dimensions = stats.dimensions
		},
	})
	try {
		if (!stage.init()) errorText.value = 'WebGL 初始化失败'
	} catch (err) {
		errorText.value = `WebGL 初始化失败：${err.message}`
	}
	stage.applyAutoRotate()

	// Tauri 会拦截系统级文件拖拽，HTML5 的 drop 事件不触发，必须用窗口级事件
	if (isTauri()) {
		import('@tauri-apps/api/webviewWindow')
			.then(async ({ getCurrentWebviewWindow }) => {
				unlistenDrag = await getCurrentWebviewWindow().onDragDropEvent(event => {
					const { type, paths, position } = event.payload || {}
					if (type === 'over') {
						dragging.value = insideStage(position)
						return
					}
					dragging.value = false
					if (type === 'drop' && insideStage(position) && paths?.length) loadFromDrop(paths)
				})
			})
			.catch(err => {
				console.warn('拖拽监听注册失败：', err)
			})
	}

	// 开发期暴露加载函数，便于用真实模型做校验（生产构建不会包含）
	if (import.meta.env.DEV) {
		window.__model3dTest = {
			loadFromBytes,
			loadFromPath,
			info: () => ({ ...info, format: info.format?.ext || '' }),
			hasModel: () => modelLoaded.value,
			detect: name => detectModelFormat(name)?.ext || null,
			rendererInfo: () => stage?.rendererInfo() || null,
		}
	}
})

onUnmounted(() => {
	unlistenDrag?.()
	unlistenDrag = null
	stage?.dispose()
	stage = null
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.modelViewer {
	.layout {
		display: flex;
		gap: 16px;
		height: 100%;
		min-height: 0;
	}
	.stage {
		flex: 1;
		min-width: 320px;
		position: relative;
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid var(--border-color);
	}
	.canvas-wrap {
		width: 100%;
		height: 100%;
		:deep(canvas) {
			display: block;
			width: 100%;
			height: 100%;
		}
	}
	.drop-tip {
		position: absolute;
		inset: 0;
		display: flex;
		flex-flow: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		text-align: center;
		padding: 20px;
		pointer-events: none;
		.big {
			font-size: 15px;
			font-weight: 600;
			color: var(--text-color-3);
		}
		.ext-chips {
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
			justify-content: center;
			margin-top: 4px;
			max-width: 420px;
			.chip {
				font-size: 11px;
				line-height: 1;
				padding: 4px 6px;
				border-radius: 5px;
				background: rgba(22, 119, 255, 0.1);
				color: #1677ff;
			}
		}
	}
	.loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.6);
	}
	.stage.dragging {
		border-color: #1677ff;
	}
	.drop-mask {
		position: absolute;
		inset: 0;
		display: flex;
		flex-flow: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		text-align: center;
		padding: 24px;
		pointer-events: none;
		background: rgba(22, 119, 255, 0.12);
		border: 2px dashed #1677ff;
		border-radius: 12px;
		.big {
			font-size: 16px;
			font-weight: 600;
			color: #1677ff;
		}
		.hint {
			max-width: 340px;
			line-height: 1.6;
		}
	}
	.panel {
		width: 340px;
		max-width: 100%;
		display: flex;
		flex-flow: column;
		gap: 12px;
		overflow: auto;
	}
	.block-title {
		font-weight: 600;
		color: var(--text-color);
		margin-bottom: 10px;
	}
	.switch-item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.bg-row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		.native-picker {
			width: 44px;
			height: 30px;
			padding: 0;
			border: 1px solid var(--panel-border);
			border-radius: 6px;
			background: none;
			cursor: pointer;
		}
	}
}
</style>
