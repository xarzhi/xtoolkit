<template>
	<div class="tool gltfViewer">
		<h1 class="tool-title">
			GLTF 模型查看
			<span class="tip">支持 .glb 与 .gltf（含外部 .bin/贴图时请用「选择文件夹」）</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<div class="stage" :style="{ background: settings.background }">
					<div class="canvas-wrap" ref="containerRef"></div>
					<div v-if="!modelLoaded && !loading" class="drop-tip">
						<div class="big">{{ errorText ? '加载失败' : '还没有模型' }}</div>
						<div class="hint">{{ errorText || '点击下方「选择 .glb / .gltf」或「选择文件夹」，也可以把文件拖进来' }}</div>
					</div>
					<a-spin v-if="loading" class="loading" size="large" tip="正在加载模型…" />
				</div>

				<div class="panel">
					<div class="tool-card block">
						<div class="block-title">模型信息</div>
						<a-descriptions :column="1" size="small" bordered>
							<a-descriptions-item label="文件">{{ info.name || '-' }}</a-descriptions-item>
							<a-descriptions-item label="体积">{{ info.size ? formatBytes(info.size) : '-' }}</a-descriptions-item>
							<a-descriptions-item label="网格 / 材质">{{ info.meshes }} / {{ info.materials }}</a-descriptions-item>
							<a-descriptions-item label="三角面">{{ info.triangles.toLocaleString() }}</a-descriptions-item>
							<a-descriptions-item label="尺寸">{{ info.dimensions }}</a-descriptions-item>
							<a-descriptions-item label="动画">{{ info.animations }} 个</a-descriptions-item>
						</a-descriptions>
						<a-select
							v-if="animations.length"
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
									<a-switch v-model:checked="settings.wireframe" size="small" @change="applyWireframe" />
									<span class="hint">线框</span>
								</span>
								<span class="switch-item">
									<a-switch v-model:checked="settings.grid" size="small" @change="applyGrid" />
									<span class="hint">网格地面</span>
								</span>
								<span class="switch-item">
									<a-switch v-model:checked="settings.autoRotate" size="small" @change="applyAutoRotate" />
									<span class="hint">自动旋转</span>
								</span>
								<span class="switch-item" v-if="animations.length">
									<a-switch v-model:checked="settings.playAnimation" size="small" />
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

					<a-alert
						v-if="hintText"
						type="info"
						show-icon
						:message="hintText"
					/>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">左键旋转 · 右键平移 · 滚轮缩放</span>
			<a-space>
				<a-button @click="pickFile">选择 .glb / .gltf</a-button>
				<a-button @click="pickFolder">选择文件夹</a-button>
				<a-button type="primary" :disabled="!modelLoaded" @click="resetCamera">重置视角</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import { message } from 'ant-design-vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { formatBytes } from '@/utils/image'
import { uiState } from '@/utils/uiState'
import { defaultOutputDir, friendlyError, isTauri, openFiles, pickDirectory, readSourceBytes, saveBytesAs } from '@/utils/tauriIO'

const containerRef = ref(null)
const loading = ref(false)
const modelLoaded = ref(false)
const errorText = ref('')
const hintText = ref('')
const animations = ref([])
const activeAnimation = ref(0)
/** 视口底色默认值：跟随明暗主题，用户自己改过就不再动 */
const DEFAULT_STAGE_BG = { light: '#f5f6f8', dark: '#1a1a1a' }
const settings = reactive({
	wireframe: false,
	grid: true,
	autoRotate: false,
	background: DEFAULT_STAGE_BG[uiState.theme] || DEFAULT_STAGE_BG.light,
	playAnimation: true,
})
const info = reactive({ name: '', size: 0, meshes: 0, materials: 0, triangles: 0, dimensions: '-', animations: 0 })

// three 的对象不需要响应式
const scene = shallowRef(null)
const camera = shallowRef(null)
const renderer = shallowRef(null)
const controls = shallowRef(null)
const grid = shallowRef(null)
const currentModel = shallowRef(null)
const mixer = shallowRef(null)
let frameId = 0
let lastFrameTime = performance.now()
let resizeObserver = null
let currentUrl = ''
const blobUrls = []

const GLTF_EXTS = ['glb', 'gltf']

const initScene = () => {
	const container = containerRef.value
	if (!container) return
	const width = container.clientWidth || 640
	const height = container.clientHeight || 420
	const rendererInstance = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false })
	rendererInstance.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
	rendererInstance.setSize(width, height)
	rendererInstance.outputColorSpace = THREE.SRGBColorSpace
	rendererInstance.toneMapping = THREE.ACESFilmicToneMapping
	container.appendChild(rendererInstance.domElement)
	renderer.value = rendererInstance

	const sceneInstance = new THREE.Scene()
	sceneInstance.background = new THREE.Color(settings.background)
	scene.value = sceneInstance

	const cameraInstance = new THREE.PerspectiveCamera(50, width / height, 0.01, 5000)
	cameraInstance.position.set(3, 2.4, 4)
	camera.value = cameraInstance

	const controlsInstance = new OrbitControls(cameraInstance, rendererInstance.domElement)
	controlsInstance.enableDamping = true
	controlsInstance.dampingFactor = 0.08
	controlsInstance.autoRotateSpeed = 1.6
	controls.value = controlsInstance

	// 灯光 + 环境（让 PBR 材质有正常反射）
	sceneInstance.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.1))
	const dirLight = new THREE.DirectionalLight(0xffffff, 1.6)
	dirLight.position.set(4, 8, 6)
	sceneInstance.add(dirLight)
	const pmrem = new THREE.PMREMGenerator(rendererInstance)
	sceneInstance.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

	const gridInstance = new THREE.GridHelper(10, 20, 0xbbbbbb, 0xdddddd)
	gridInstance.position.y = 0
	gridInstance.visible = settings.grid
	sceneInstance.add(gridInstance)
	grid.value = gridInstance

	const animate = () => {
		frameId = requestAnimationFrame(animate)
		const now = performance.now()
		const delta = Math.min(0.1, (now - lastFrameTime) / 1000)
		lastFrameTime = now
		if (mixer.value && settings.playAnimation) mixer.value.update(delta)
		controlsInstance.update()
		rendererInstance.render(sceneInstance, cameraInstance)
	}
	animate()

	resizeObserver = new ResizeObserver(() => {
		const el = containerRef.value
		if (!el || !renderer.value || !camera.value) return
		const w = el.clientWidth || 640
		const h = el.clientHeight || 420
		renderer.value.setSize(w, h)
		camera.value.aspect = w / h
		camera.value.updateProjectionMatrix()
	})
	resizeObserver.observe(container)
}

const disposeModel = () => {
	const model = currentModel.value
	if (model) {
		model.traverse(child => {
			if (child.geometry) child.geometry.dispose()
			const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : []
			for (const material of materials) {
				for (const key of Object.keys(material)) {
					const value = material[key]
					if (value && value.isTexture) value.dispose()
				}
				material.dispose()
			}
		})
		scene.value?.remove(model)
	}
	currentModel.value = null
	mixer.value = null
	for (const url of blobUrls) URL.revokeObjectURL(url)
	blobUrls.length = 0
	animations.value = []
	modelLoaded.value = false
}

const applyWireframe = () => {
	currentModel.value?.traverse(child => {
		const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : []
		for (const material of materials) material.wireframe = settings.wireframe
	})
}

const applyGrid = () => {
	if (grid.value) grid.value.visible = settings.grid
}

const applyAutoRotate = () => {
	if (controls.value) controls.value.autoRotate = settings.autoRotate
}

const applyBackground = event => {
	settings.background = event.target.value
	if (scene.value) scene.value.background = new THREE.Color(settings.background)
}

// 明暗主题切换时，如果底色还是默认值就跟着换（自己挑过颜色则保留）
watch(
	() => uiState.theme,
	next => {
		const current = String(settings.background || '').toLowerCase()
		if (current && current !== DEFAULT_STAGE_BG.light && current !== DEFAULT_STAGE_BG.dark) return
		settings.background = DEFAULT_STAGE_BG[next] || DEFAULT_STAGE_BG.light
		if (scene.value) scene.value.background = new THREE.Color(settings.background)
	}
)

const frameModel = model => {
	const box = new THREE.Box3().setFromObject(model)
	if (box.isEmpty()) return
	const size = box.getSize(new THREE.Vector3())
	const center = box.getCenter(new THREE.Vector3())
	const maxSize = Math.max(size.x, size.y, size.z) || 1
	const distance = maxSize / (2 * Math.tan((Math.PI * camera.value.fov) / 360)) * 2.2

	// 让模型落在地面网格上并居中
	model.position.sub(center)
	model.position.y += size.y / 2
	grid.value.position.y = -size.y / 2

	camera.value.position.set(distance * 0.7, distance * 0.55, distance * 0.9)
	camera.value.near = maxSize / 500
	camera.value.far = maxSize * 500
	camera.value.updateProjectionMatrix()
	controls.value.target.set(0, 0, 0)
	controls.value.update()

	info.dimensions = `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`
}

const collectStats = model => {
	let meshes = 0
	let triangles = 0
	const materialSet = new Set()
	model.traverse(child => {
		if (child.isMesh) {
			meshes += 1
			const geometry = child.geometry
			if (geometry?.index) triangles += geometry.index.count / 3
			else if (geometry?.attributes?.position) triangles += geometry.attributes.position.count / 3
			const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : []
			for (const material of materials) materialSet.add(material.uuid)
		}
	})
	info.meshes = meshes
	info.materials = materialSet.size
	info.triangles = Math.round(triangles)
}

const onModelLoaded = (gltf, name, size) => {
	disposeModel()
	const model = gltf.scene || gltf.scenes?.[0]
	if (!model) throw new Error('文件里没有可见的模型')
	currentModel.value = model
	scene.value.add(model)
	frameModel(model)
	collectStats(model)
	applyWireframe()

	animations.value = gltf.animations || []
	info.animations = animations.value.length
	if (animations.value.length) {
		mixer.value = new THREE.AnimationMixer(model)
		playAnimation()
	}
	info.name = name
	info.size = size
	modelLoaded.value = true
	errorText.value = ''
	message.success(`已加载 ${name}`)
}

const playAnimation = () => {
	if (!mixer.value || !animations.value.length) return
	mixer.value.stopAllAction()
	const clip = animations.value[activeAnimation.value] || animations.value[0]
	mixer.value.clipAction(clip).reset().play()
	settings.playAnimation = true
}

/** 解析 GLB / 自包含 GLTF 的字节流 */
const loadFromBytes = async (bytes, name, size, manager) => {
	const loader = new GLTFLoader(manager)
	const isGlb = /\.glb$/i.test(name)
	const payload = isGlb
		? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
		: new TextDecoder('utf-8').decode(bytes)
	await new Promise((resolve, reject) => {
		loader.parse(payload, '', gltf => {
			try {
				onModelLoaded(gltf, name, size)
				resolve()
			} catch (err) {
				reject(err)
			}
		}, reject)
	})
}

const pickFile = async () => {
	try {
		const files = await openFiles({
			multiple: false,
			title: '选择 GLTF / GLB 模型',
			filters: [{ name: 'GLTF 模型', extensions: GLTF_EXTS }],
		})
		if (!files?.length) return
		await loadFromPath(files[0])
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const loadFromPath = async path => {
	loading.value = true
	errorText.value = ''
	hintText.value = ''
	try {
		const bytes = await readSourceBytes(path)
		const name = String(path).split(/[\\/]/).pop()
		await loadFromBytes(bytes, name, bytes.length)
		if (/\.gltf$/i.test(name) && !/data:/i.test(new TextDecoder().decode(bytes.subarray(0, 4096)))) {
			hintText.value = '如果这个 .gltf 引用了外部 .bin 或贴图而加载失败，请改用「选择文件夹」把资源一起载入。'
		}
	} catch (err) {
		errorText.value = `加载失败：${friendlyError(err)}`
		message.error(errorText.value)
	} finally {
		loading.value = false
	}
}

/** 选择文件夹：把 .gltf 引用的外部 .bin / 贴图读取成 blob 再交给加载器 */
const pickFolder = async () => {
	if (!isTauri()) {
		message.warning('浏览器环境无法读取文件夹，请用「选择 .glb / .gltf」')
		return
	}
	try {
		const dir = await pickDirectory({ title: '选择包含模型的文件夹', defaultPath: (await defaultOutputDir()) || undefined })
		if (!dir) return
		loading.value = true
		errorText.value = ''
		hintText.value = ''
		const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs')
		const entries = await readDir(dir)
		const gltfEntry = entries.find(entry => entry.isFile && /\.gltf$/i.test(entry.name))
		const glbEntry = entries.find(entry => entry.isFile && /\.glb$/i.test(entry.name))

		if (!gltfEntry && !glbEntry) throw new Error('该文件夹里没有 .gltf / .glb 文件')

		const join = (a, b) => `${String(a).replace(/[\\/]$/, '')}\\${b}`
		if (glbEntry && !gltfEntry) {
			const bytes = await readSourceBytes(join(dir, glbEntry.name))
			await loadFromBytes(bytes, glbEntry.name, bytes.length)
			return
		}

		const gltfPath = join(dir, gltfEntry.name)
		const json = await readTextFile(gltfPath)
		const parsed = JSON.parse(json)
		const wanted = new Set()
		for (const buffer of parsed.buffers || []) if (buffer.uri && !buffer.uri.startsWith('data:')) wanted.add(decodeURIComponent(buffer.uri))
		for (const image of parsed.images || []) if (image.uri && !image.uri.startsWith('data:')) wanted.add(decodeURIComponent(image.uri))

		const mapping = new Map()
		for (const uri of wanted) {
			const fileName = uri.split(/[\\/]/).pop()
			try {
				const bytes = await readSourceBytes(join(dir, fileName))
				const url = URL.createObjectURL(new Blob([bytes]))
				blobUrls.push(url)
				mapping.set(uri, url)
				mapping.set(fileName, url)
			} catch (err) {
				console.warn('外部资源读取失败', uri, err)
			}
		}

		const manager = new THREE.LoadingManager()
		manager.setURLModifier(url => {
			if (mapping.has(url)) return mapping.get(url)
			const fileName = String(url).split(/[\\/]/).pop()
			if (mapping.has(fileName)) return mapping.get(fileName)
			return url
		})
		const loader = new GLTFLoader(manager)
		await new Promise((resolve, reject) => {
			loader.parse(json, '', gltf => {
				try {
					onModelLoaded(gltf, gltfEntry.name, json.length)
					resolve()
				} catch (err) {
					reject(err)
				}
			}, reject)
		})
		if (wanted.size) message.success(`已连同 ${wanted.size} 个外部资源一起载入`)
	} catch (err) {
		errorText.value = `加载失败：${friendlyError(err)}`
		message.error(errorText.value)
	} finally {
		loading.value = false
	}
}

const resetCamera = () => {
	if (currentModel.value) frameModel(currentModel.value)
}

const saveScreenshot = async () => {
	try {
		const rendererInstance = renderer.value
		if (!rendererInstance) return
		rendererInstance.render(scene.value, camera.value)
		const dataUrl = rendererInstance.domElement.toDataURL('image/png')
		const base64 = dataUrl.split(',')[1]
		const binary = atob(base64)
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

onMounted(() => {
	try {
		initScene()
	} catch (err) {
		errorText.value = `WebGL 初始化失败：${err.message}`
	}
	// 开发期暴露加载函数，便于用真实模型做校验（生产构建不会包含）
	if (import.meta.env.DEV) {
		window.__gltfTest = {
			loadFromBytes,
			pickFolder,
			info: () => ({ ...info }),
			hasModel: () => modelLoaded.value,
			rendererInfo: () => {
				const rendererInstance = renderer.value
				if (!rendererInstance) return null
				const gl = rendererInstance.getContext()
				return { width: rendererInstance.domElement.width, height: rendererInstance.domElement.height, context: !!gl }
			},
		}
	}
})

onUnmounted(() => {
	if (frameId) cancelAnimationFrame(frameId)
	resizeObserver?.disconnect()
	disposeModel()
	controls.value?.dispose()
	renderer.value?.dispose()
	const container = containerRef.value
	if (container && renderer.value?.domElement?.parentNode === container) container.removeChild(renderer.value.domElement)
	void currentUrl
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.gltfViewer {
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
		// 底色由 settings.background 内联控制（跟随明暗主题，也可以自己挑颜色）
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
	}
	.loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.6);
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
