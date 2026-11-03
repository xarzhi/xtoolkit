/**
 * 3D 模型文件读写工具
 *
 * 读取：按扩展名自动选择 three 的 Loader，并把 .gltf / .obj / .dae 引用的
 *       外部 .bin、贴图从同一目录读成 blob URL 自动挂上，不需要用户去点「选择文件夹」。
 * 导出：交给 three 的 Exporter，统一产出 Uint8Array，方便直接保存到本地。
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'
import { basename, dirname, extname, joinPath, stripExt } from './image'
import { createSyncDracoLoader } from './dracoSync'
import { isTauri, readSourceBytes, readSourceText } from './tauriIO'

/** 可读取的模型格式（顺序即「选择文件」对话框里的排列） */
export const MODEL_FORMATS = [
	{ ext: 'glb', label: 'glTF 二进制', loader: 'gltf', note: '单文件，含贴图与动画' },
	{ ext: 'gltf', label: 'glTF', loader: 'gltf', note: '自动带上同目录的 .bin / 贴图' },
	{ ext: 'obj', label: 'Wavefront OBJ', loader: 'obj', note: '自动带上同名 .mtl' },
	{ ext: 'fbx', label: 'Autodesk FBX', loader: 'fbx', note: '含骨骼动画' },
	{ ext: 'stl', label: 'STL', loader: 'stl', note: '纯三角面，3D 打印常用' },
	{ ext: 'ply', label: 'PLY', loader: 'ply', note: '支持顶点色与点云' },
	{ ext: 'dae', label: 'COLLADA', loader: 'dae', note: '自动带上同目录贴图' },
	{ ext: '3ds', label: '3DS', loader: '3ds', note: '老版本 3ds Max 模型' },
	{ ext: '3mf', label: '3MF', loader: '3mf', note: '3D 打印格式' },
]

export const MODEL_EXTS = MODEL_FORMATS.map(item => item.ext)
export const MODEL_FILTER = { name: '3D 模型', extensions: MODEL_EXTS }

/** 可导出的目标格式 */
export const EXPORT_FORMATS = [
	{ ext: 'glb', label: 'GLB · 单文件（含贴图，推荐）', binary: true },
	{ ext: 'gltf', label: 'glTF · JSON（贴图内嵌 base64）', binary: false },
	{ ext: 'obj', label: 'OBJ · 几何 + 材质名', binary: false },
	{ ext: 'stl', label: 'STL · 只有三角面（3D 打印）', binary: true },
	{ ext: 'ply', label: 'PLY · 含顶点色', binary: true },
	{ ext: 'usdz', label: 'USDZ · 苹果 AR', binary: true },
]

/** 按文件名判断格式，识别不了返回 null */
export function detectModelFormat(name) {
	const ext = extname(name)
	return MODEL_FORMATS.find(item => item.ext === ext) || null
}

export function isModelFile(name) {
	return MODEL_EXTS.includes(extname(name))
}

/* ------------------------------------------------------------------ *
 * 外部资源（同目录的 .bin / 贴图）
 * ------------------------------------------------------------------ */

/** 把一批相对路径从 dir 里读成 blob URL，返回 url→blob 的映射 */
async function resolveSiblings(dir, uris) {
	const mapping = new Map()
	const urls = []
	for (const raw of uris) {
		const clean = decodeURIComponent(String(raw).split(/[?#]/)[0])
		const fileName = basename(clean)
		if (!fileName) continue
		try {
			const bytes = await readSourceBytes(joinPath(dir, fileName))
			const url = URL.createObjectURL(new Blob([bytes]))
			urls.push(url)
			mapping.set(clean, url)
			mapping.set(fileName, url)
		} catch {
			/* 缺资源不算致命：模型照样能显示，只是没贴图 */
		}
	}
	return { mapping, urls }
}

/** 带重定向能力的 LoadingManager：把 loader 请求的相对路径换成 blob URL */
function makeManager(mapping) {
	const manager = new THREE.LoadingManager()
	if (mapping && mapping.size) {
		manager.setURLModifier(url => {
			if (!url) return url
			if (/^(blob:|data:|https?:)/i.test(url)) return url
			const clean = decodeURIComponent(String(url).split(/[?#]/)[0])
			const fileName = basename(clean)
			return mapping.get(clean) || mapping.get(fileName) || url
		})
	}
	return manager
}

/** Uint8Array → 独立 ArrayBuffer（Loader 只认 ArrayBuffer，且不能是分离缓冲） */
function toArrayBuffer(bytes) {
	const copy = bytes.slice()
	return copy.buffer
}

function decodeText(bytes) {
	// BOM 会让 JSON.parse / OBJ 首行解析出错，去掉
	return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '')
}

/* ------------------------------------------------------------------ *
 * 读取
 * ------------------------------------------------------------------ */

/**
 * 读取模型文件
 * @param {{ path?: string, bytes?: Uint8Array, name: string }} input
 *        path 传本地路径时，会顺带把同目录的外部资源一起读进来
 * @returns {Promise<{ object: THREE.Object3D, animations: any[], format: object, urls: string[], warnings: string[] }>}
 */
export async function loadModel({ path, bytes, name }) {
	const fileName = name || basename(path) || ''
	const format = detectModelFormat(fileName)
	if (!format) throw new Error(`暂不支持 .${extname(fileName) || '未知'} 格式`)

	const data = bytes || (path ? await readSourceBytes(path) : null)
	if (!data?.length) throw new Error('文件是空的')
	if (!path && !isTauri()) {
		/* 浏览器里只能拿到单文件，这里不做额外处理，交给各 Loader */
	}
	const dir = path && isTauri() ? dirname(path) : ''
	const urls = []
	const warnings = []
	let object = null
	let animations = []

	switch (format.loader) {
		case 'gltf': {
			const isGlb = format.ext === 'glb'
			const payload = isGlb ? toArrayBuffer(data) : decodeText(data)
			let manager = new THREE.LoadingManager()
			if (!isGlb && dir) {
				try {
					const json = JSON.parse(payload)
					const wanted = new Set()
					for (const buffer of json.buffers || []) {
						if (buffer.uri && !buffer.uri.startsWith('data:')) wanted.add(buffer.uri)
					}
					for (const image of json.images || []) {
						if (image.uri && !image.uri.startsWith('data:')) wanted.add(image.uri)
					}
					if (wanted.size) {
						const resolved = await resolveSiblings(dir, wanted)
						urls.push(...resolved.urls)
						manager = makeManager(resolved.mapping)
						const missing = wanted.size - resolved.urls.length
						if (missing > 0) warnings.push(`有 ${missing} 个外部资源没找到，贴图可能缺失`)
					}
				} catch {
					/* JSON 异常交给 GLTFLoader 报错，信息更准确 */
				}
			}
			const loader = new GLTFLoader(manager)
			// 很多模型用了 KHR_draco_mesh_compression，没有解码器会直接报错
			loader.setDRACOLoader(createSyncDracoLoader())
			const gltf = await new Promise((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error('模型解析超时（文件过大或数据异常）')), 90000)
				loader.parse(
					payload,
					'',
					value => {
						clearTimeout(timer)
						resolve(value)
					},
					err => {
						clearTimeout(timer)
						reject(err)
					}
				)
			})
			object = gltf.scene || gltf.scenes?.[0]
			animations = gltf.animations || []
			break
		}
		case 'obj': {
			const text = decodeText(data)
			let manager = new THREE.LoadingManager()
			let withMtl = false
			if (dir) {
				const mtlName = `${stripExt(fileName)}.mtl`
				try {
					const mtlText = await readSourceText(joinPath(dir, mtlName))
					const textureNames = []
					for (const line of mtlText.split(/\r?\n/)) {
						const trimmed = line.trim()
						if (!/^map_\w+/i.test(trimmed)) continue
						const token = trimmed.split(/\s+/).filter(Boolean).pop()
						if (token && !token.startsWith('-')) textureNames.push(token)
					}
					if (textureNames.length) {
						const resolved = await resolveSiblings(dir, textureNames)
						urls.push(...resolved.urls)
						manager = makeManager(resolved.mapping)
					}
					const creator = new MTLLoader(manager).parse(mtlText, '')
					creator.preload()
					const objLoader = new OBJLoader(manager)
					objLoader.setMaterials(creator)
					object = objLoader.parse(text)
					withMtl = true
				} catch {
					/* 没有 mtl 就用默认材质 */
				}
			}
			if (!object) {
				object = new OBJLoader(manager).parse(text)
				if (dir) warnings.push('没有找到同名 .mtl，按默认灰度材质显示')
			} else if (withMtl) {
				/* 使用 mtl 成功 */
			}
			break
		}
		case 'fbx': {
			const fbx = new FBXLoader(new THREE.LoadingManager()).parse(toArrayBuffer(data), '')
			object = fbx
			animations = fbx.animations || []
			break
		}
		case 'stl': {
			const geometry = new STLLoader().parse(toArrayBuffer(data))
			if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
			const mesh = new THREE.Mesh(
				geometry,
				new THREE.MeshStandardMaterial({ color: 0xc8d2de, metalness: 0.15, roughness: 0.55 })
			)
			object = new THREE.Group()
			object.add(mesh)
			break
		}
		case 'ply': {
			const geometry = new PLYLoader().parse(toArrayBuffer(data))
			const hasColor = !!geometry.getAttribute('color')
			if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
			const material = new THREE.MeshStandardMaterial({
				color: hasColor ? 0xffffff : 0xc8d2de,
				vertexColors: hasColor,
				metalness: 0.15,
				roughness: 0.6,
			})
			object = new THREE.Group()
			object.add(new THREE.Mesh(geometry, material))
			break
		}
		case 'dae': {
			const text = decodeText(data)
			let manager = new THREE.LoadingManager()
			if (dir) {
				const imageNames = [...text.matchAll(/<init_from>\s*([^<]+?)\s*<\/init_from>/gi)].map(m => m[1])
				if (imageNames.length) {
					const resolved = await resolveSiblings(dir, imageNames)
					urls.push(...resolved.urls)
					manager = makeManager(resolved.mapping)
				}
			}
			const result = new ColladaLoader(manager).parse(text, '')
			object = result.scene
			animations = result.animations || []
			break
		}
		case '3ds': {
			object = new TDSLoader(new THREE.LoadingManager()).parse(toArrayBuffer(data), '')
			break
		}
		case '3mf': {
			object = new ThreeMFLoader().parse(toArrayBuffer(data))
			break
		}
		default:
			throw new Error(`没有可用的 .${format.ext} 解析器`)
	}

	if (!object) throw new Error('文件里没有可见的模型')
	return { object, animations, format, urls, warnings, size: data.length }
}

/* ------------------------------------------------------------------ *
 * 统计 / 释放
 * ------------------------------------------------------------------ */

/** 网格数、材质数、三角面数 */
export function modelStats(object) {
	let meshes = 0
	let triangles = 0
	let points = 0
	const materials = new Set()
	object.traverse(child => {
		if (child.isPoints) points += child.geometry?.attributes?.position?.count || 0
		if (!child.isMesh) return
		meshes += 1
		const geometry = child.geometry
		if (geometry?.index) triangles += geometry.index.count / 3
		else if (geometry?.attributes?.position) triangles += geometry.attributes.position.count / 3
		const list = Array.isArray(child.material) ? child.material : child.material ? [child.material] : []
		for (const material of list) materials.add(material.uuid)
	})
	return { meshes, materials: materials.size, triangles: Math.round(triangles), points }
}

/** 释放模型占用的几何 / 材质 / 贴图，并回收外部资源的 blob URL */
export function disposeObject(object, urls = []) {
	object?.traverse(child => {
		child.geometry?.dispose()
		const list = Array.isArray(child.material) ? child.material : child.material ? [child.material] : []
		for (const material of list) {
			for (const key of Object.keys(material)) {
				const value = material[key]
				if (value && value.isTexture) value.dispose()
			}
			material.dispose()
		}
	})
	for (const url of urls) {
		try {
			URL.revokeObjectURL(url)
		} catch {
			/* 忽略 */
		}
	}
}

/* ------------------------------------------------------------------ *
 * 导出
 * ------------------------------------------------------------------ */

const textBytes = text => new TextEncoder().encode(text)

/**
 * 把模型转换成目标格式
 * @param {THREE.Object3D} object
 * @param {string} ext 见 EXPORT_FORMATS
 * @param {{ animations?: any[] }} extra
 * @returns {Promise<Uint8Array>}
 */
export async function exportModel(object, ext, { animations = [] } = {}) {
	switch (ext) {
		case 'glb':
		case 'gltf': {
			const exporter = new GLTFExporter()
			const options = {
				binary: ext === 'glb',
				onlyVisible: false,
				truncateDrawRange: false,
				includeCustomExtensions: true,
			}
			if (animations.length) options.animations = animations
			const result = await exporter.parseAsync(object, options)
			if (ext === 'glb') return new Uint8Array(result)
			return textBytes(JSON.stringify(result, null, 2))
		}
		case 'obj': {
			const text = new OBJExporter().parse(object)
			return textBytes(text)
		}
		case 'stl': {
			const data = new STLExporter().parse(object, { binary: true })
			if (typeof data === 'string') return textBytes(data)
			return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
		}
		case 'ply': {
			const data = new PLYExporter().parse(object, null, { binary: true })
			if (typeof data === 'string') return textBytes(data)
			return new Uint8Array(data)
		}
		case 'usdz': {
			const data = await new USDZExporter().parseAsync(object)
			return data instanceof Uint8Array ? data : new Uint8Array(data)
		}
		default:
			throw new Error(`不支持导出 .${ext}`)
	}
}
