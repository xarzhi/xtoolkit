/**
 * three.js 舞台封装：渲染器 / 场景 / 相机 / 轨道控制 / 地面网格 / 渲染循环
 *
 * 「3D 模型查看」和「3D 格式转换」两个页面共用，页面只关心业务（选文件、导出），
 * 不用各写一份 WebGL 初始化代码。
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { disposeObject, modelStats } from './model3d'

/**
 * @param {HTMLElement} container 挂载容器（会往里塞 canvas）
 * @param {{
 *   settings?: { background?: string, wireframe?: boolean, grid?: boolean, autoRotate?: boolean, playing?: boolean },
 *   onStats?: (stats: { meshes: number, materials: number, triangles: number, dimensions: string }) => void,
 * }} options settings 传页面里的 reactive 对象，改动后调对应 apply* 方法生效
 */
export function createModelStage(container, { settings = {}, onStats } = {}) {
	const state = {
		scene: null,
		camera: null,
		renderer: null,
		controls: null,
		grid: null,
		model: null,
		mixer: null,
		clips: [],
		urls: [],
		frameId: 0,
		last: performance.now(),
		observer: null,
		ready: false,
	}

	const resize = () => {
		if (!state.renderer || !state.camera) return
		const width = container.clientWidth || 640
		const height = container.clientHeight || 420
		state.renderer.setSize(width, height)
		state.camera.aspect = width / height
		state.camera.updateProjectionMatrix()
	}

	const init = () => {
		if (!container || state.ready) return state.ready
		const width = container.clientWidth || 640
		const height = container.clientHeight || 420

		const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
		renderer.setSize(width, height)
		renderer.outputColorSpace = THREE.SRGBColorSpace
		renderer.toneMapping = THREE.ACESFilmicToneMapping
		container.appendChild(renderer.domElement)

		const scene = new THREE.Scene()
		scene.background = new THREE.Color(settings.background || '#f5f6f8')

		const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 5000)
		camera.position.set(3, 2.4, 4)

		const controls = new OrbitControls(camera, renderer.domElement)
		controls.enableDamping = true
		controls.dampingFactor = 0.08
		controls.autoRotateSpeed = 1.6

		// 灯光 + 环境贴图，让 PBR 材质有正常的明暗与反射
		scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.1))
		const dirLight = new THREE.DirectionalLight(0xffffff, 1.6)
		dirLight.position.set(4, 8, 6)
		scene.add(dirLight)
		const pmrem = new THREE.PMREMGenerator(renderer)
		scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
		pmrem.dispose()

		const grid = new THREE.GridHelper(10, 20, 0xbbbbbb, 0xdddddd)
		grid.visible = settings.grid !== false
		scene.add(grid)

		Object.assign(state, { scene, camera, renderer, controls, grid, ready: true })

		const animate = () => {
			state.frameId = requestAnimationFrame(animate)
			const now = performance.now()
			const delta = Math.min(0.1, (now - state.last) / 1000)
			state.last = now
			if (state.mixer && settings.playing !== false) state.mixer.update(delta)
			controls.update()
			renderer.render(scene, camera)
		}
		animate()

		state.observer = new ResizeObserver(resize)
		state.observer.observe(container)
		return true
	}

	/** 把模型摆到地面网格上并让相机框住它 */
	const frame = () => {
		const model = state.model
		if (!model || !state.camera) return null
		const box = new THREE.Box3().setFromObject(model)
		if (box.isEmpty()) return null
		const size = box.getSize(new THREE.Vector3())
		const center = box.getCenter(new THREE.Vector3())
		const maxSize = Math.max(size.x, size.y, size.z) || 1
		const distance = (maxSize / (2 * Math.tan((Math.PI * state.camera.fov) / 360))) * 2.2

		model.position.sub(center)
		model.position.y += size.y / 2
		state.grid.position.y = -size.y / 2

		state.camera.position.set(distance * 0.7, distance * 0.55, distance * 0.9)
		state.camera.near = maxSize / 500
		state.camera.far = maxSize * 500
		state.camera.updateProjectionMatrix()
		state.controls.target.set(0, 0, 0)
		state.controls.update()
		return size
	}

	const applyWireframe = () => {
		state.model?.traverse(child => {
			const list = Array.isArray(child.material) ? child.material : child.material ? [child.material] : []
			for (const material of list) material.wireframe = !!settings.wireframe
		})
	}

	const clear = () => {
		if (state.model) {
			state.scene?.remove(state.model)
			disposeObject(state.model, state.urls)
		}
		state.model = null
		state.mixer = null
		state.clips = []
		state.urls = []
	}

	/** 载入一个 Object3D（调用方负责先解析） */
	const setModel = (object, animations = [], urls = []) => {
		clear()
		state.model = object
		state.urls = urls
		state.clips = animations
		state.scene.add(object)
		const size = frame()
		applyWireframe()

		const stats = modelStats(object)
		onStats?.({
			...stats,
			dimensions: size ? `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}` : '-',
			animations: animations.length,
		})

		if (animations.length) {
			state.mixer = new THREE.AnimationMixer(object)
			state.mixer.clipAction(animations[0]).reset().play()
		}
		return stats
	}

	/** 切换播放第 index 个动画片段 */
	const playClip = index => {
		const clip = state.clips?.[index]
		if (!state.mixer || !clip) return
		state.mixer.stopAllAction()
		state.mixer.clipAction(clip).reset().play()
	}

	const applyGrid = () => {
		if (state.grid) state.grid.visible = !!settings.grid
	}
	const applyAutoRotate = () => {
		if (state.controls) state.controls.autoRotate = !!settings.autoRotate
	}
	const setBackground = color => {
		if (state.scene) state.scene.background = new THREE.Color(color)
	}

	/** 截图（当前画面 PNG dataURL） */
	const capture = () => {
		if (!state.renderer) return ''
		state.renderer.render(state.scene, state.camera)
		return state.renderer.domElement.toDataURL('image/png')
	}

	const dispose = () => {
		if (state.frameId) cancelAnimationFrame(state.frameId)
		state.frameId = 0
		state.observer?.disconnect()
		state.observer = null
		clear()
		state.controls?.dispose()
		state.renderer?.dispose()
		const canvas = state.renderer?.domElement
		if (canvas && canvas.parentNode === container) container.removeChild(canvas)
		state.renderer = null
		state.scene = null
		state.ready = false
	}

	return {
		init,
		frame,
		setModel,
		playClip,
		clear,
		capture,
		dispose,
		resize,
		applyWireframe,
		applyGrid,
		applyAutoRotate,
		setBackground,
		hasModel: () => !!state.model,
		rendererInfo: () => {
			if (!state.renderer) return null
			return {
				width: state.renderer.domElement.width,
				height: state.renderer.domElement.height,
				context: !!state.renderer.getContext(),
			}
		},
	}
}
