/**
 * 主线程同步 Draco 解码器（绕开 three DRACOLoader 的 Web Worker + fetch 机制）。
 *
 * 背景：three 的 DRACOLoader 依赖 fetch 加载 wasm/wrapper 并在 Web Worker 里解码。
 * 在 Tauri 的 WebView2 环境下，CSP 缺少 worker-src blob:（或 Worker 执行异常），
 * 会导致解码一直挂起，模型"一直显示正在加载"。
 *
 * 这里采用完全自包含的方案：
 *   - wrapper 源码（draco_wasm_wrapper.js）以字符串内联进 bundle
 *   - wasm 以 base64 内联进 bundle
 *   - 通过 new Function 执行 wrapper，拿到 DracoDecoderModule 工厂
 *   - 用 { wasmBinary } 提供 wasm 字节，避免任何 fetch / XHR
 *   - 全部在主线程同步解码，不创建 Web Worker
 *
 * 对外暴露与 GLTFLoader 期望的 DRACOLoader 兼容接口：
 *   - preload()
 *   - decodeDracoFile(buffer, onLoad, attributeIDs, attributeTypes, colorSpace, onError)
 */
import { BufferAttribute, BufferGeometry, InterleavedBuffer, InterleavedBufferAttribute } from 'three'
import wrapperSource from './draco_wrapper_raw.js'
import wasmBase64 from './draco_wasm_base64.js'

const DEFAULT_ATTRIBUTE_IDS = { position: 'POSITION', normal: 'NORMAL', color: 'COLOR', uv: 'TEX_COORD' }
const DEFAULT_ATTRIBUTE_TYPES = { position: 'Float32Array', normal: 'Float32Array', color: 'Float32Array', uv: 'Float32Array' }

let dracoModule = null
let initPromise = null

/** base64 -> ArrayBuffer（用于给 wasmBinary） */
function base64ToArrayBuffer(base64) {
	const binary = atob(base64)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	return bytes.buffer
}

/** 执行 wrapper 源码，返回 DracoDecoderModule 工厂函数 */
function loadFactory() {
	// wrapper 是 UMD：最后会 module.exports = DracoDecoderModule。
	// 用 new Function 模拟一个带 module 的环境，把工厂函数抓出来。
	const module = { exports: {} }
	const fn = new Function('module', 'exports', 'globalThis', wrapperSource)
	fn(module, module.exports, globalThis)
	return module.exports || globalThis.DracoDecoderModule
}

/** 初始化解码器（只做一次） */
function ensureDecoder() {
	if (dracoModule) return Promise.resolve(dracoModule)
	if (initPromise) return initPromise
	initPromise = new Promise((resolve, reject) => {
		try {
			const factory = loadFactory()
			if (!factory) throw new Error('Draco 解码器加载失败（DracoDecoderModule 未定义）')
			// 提供 wasmBinary，绕开 fetch/XHR 加载 wasm
			const config = {
				wasmBinary: base64ToArrayBuffer(wasmBase64),
				onModuleLoaded: mod => {
					dracoModule = mod
					resolve(mod)
				},
			}
			factory(config)
			setTimeout(() => {
				if (!dracoModule) reject(new Error('Draco 解码器初始化超时'))
			}, 15000)
		} catch (err) {
			reject(err)
		}
	})
	return initPromise
}

function getDracoDataType(draco, TypedArray) {
	switch (TypedArray) {
		case Float32Array:
			return draco.DT_FLOAT32
		case Int8Array:
			return draco.DT_INT8
		case Int16Array:
			return draco.DT_INT16
		case Int32Array:
			return draco.DT_INT32
		case Uint8Array:
			return draco.DT_UINT8
		case Uint16Array:
			return draco.DT_UINT16
		case Uint32Array:
			return draco.DT_UINT32
		default:
			return draco.DT_FLOAT32
	}
}

function decodeAttribute(draco, decoder, dracoGeometry, attributeName, TypedArray, attribute) {
	const count = dracoGeometry.num_points()
	const itemSize = attribute.num_components()
	const dracoDataType = getDracoDataType(draco, TypedArray)

	const srcByteStride = itemSize * TypedArray.BYTES_PER_ELEMENT
	const dstByteStride = Math.ceil(srcByteStride / 4) * 4
	const dstStride = dstByteStride / TypedArray.BYTES_PER_ELEMENT

	const srcByteLength = count * srcByteStride
	const dstByteLength = count * dstByteStride

	const ptr = draco._malloc(srcByteLength)
	decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, dracoDataType, srcByteLength, ptr)

	const srcArray = new TypedArray(draco.HEAPF32.buffer, ptr, srcByteLength / TypedArray.BYTES_PER_ELEMENT)
	let dstArray

	if (srcByteStride === dstByteStride) {
		dstArray = srcArray.slice()
	} else {
		dstArray = new TypedArray(dstByteLength / TypedArray.BYTES_PER_ELEMENT)
		let dstOffset = 0
		for (let i = 0, il = srcArray.length; i < il; i++) {
			for (let j = 0; j < itemSize; j++) {
				dstArray[dstOffset + j] = srcArray[i * itemSize + j]
			}
			dstOffset += dstStride
		}
	}

	draco._free(ptr)

	return { name: attributeName, count, itemSize, array: dstArray, stride: dstStride }
}

function decodeIndex(draco, decoder, dracoGeometry) {
	const numFaces = dracoGeometry.num_faces()
	const numIndices = numFaces * 3
	const byteLength = numIndices * 4

	const ptr = draco._malloc(byteLength)
	decoder.GetTrianglesUInt32Array(dracoGeometry, byteLength, ptr)
	const index = new Uint32Array(draco.HEAPF32.buffer, ptr, numIndices).slice()
	draco._free(ptr)

	return { array: index, itemSize: 1 }
}

function decodeGeometry(draco, decoder, array, taskConfig) {
	const attributeIDs = taskConfig.attributeIDs
	const attributeTypes = taskConfig.attributeTypes

	let dracoGeometry
	let decodingStatus

	const geometryType = decoder.GetEncodedGeometryType(array)

	if (geometryType === draco.TRIANGULAR_MESH) {
		dracoGeometry = new draco.Mesh()
		decodingStatus = decoder.DecodeArrayToMesh(array, array.byteLength, dracoGeometry)
	} else if (geometryType === draco.POINT_CLOUD) {
		dracoGeometry = new draco.PointCloud()
		decodingStatus = decoder.DecodeArrayToPointCloud(array, array.byteLength, dracoGeometry)
	} else {
		throw new Error('THREE.DRACOLoader: Unexpected geometry type.')
	}

	if (!decodingStatus.ok() || dracoGeometry.ptr === 0) {
		throw new Error('THREE.DRACOLoader: Decoding failed: ' + decodingStatus.error_msg())
	}

	const geometry = { index: null, attributes: [] }

	for (const attributeName in attributeIDs) {
		const attributeType = globalThis[attributeTypes[attributeName]]
		let attribute
		let attributeID

		if (taskConfig.useUniqueIDs) {
			attributeID = attributeIDs[attributeName]
			attribute = decoder.GetAttributeByUniqueId(dracoGeometry, attributeID)
		} else {
			attributeID = decoder.GetAttributeId(dracoGeometry, draco[attributeIDs[attributeName]])
			if (attributeID === -1) continue
			attribute = decoder.GetAttribute(dracoGeometry, attributeID)
		}

		geometry.attributes.push(decodeAttribute(draco, decoder, dracoGeometry, attributeName, attributeType, attribute))
	}

	if (geometryType === draco.TRIANGULAR_MESH) {
		geometry.index = decodeIndex(draco, decoder, dracoGeometry)
	}

	draco.destroy(dracoGeometry)

	return geometry
}

function createGeometry(geometryData) {
	const geometry = new BufferGeometry()

	if (geometryData.index) {
		geometry.setIndex(new BufferAttribute(geometryData.index.array, 1))
	}

	for (let i = 0; i < geometryData.attributes.length; i++) {
		const { name, array, itemSize, stride } = geometryData.attributes[i]
		let attribute
		if (itemSize === stride) {
			attribute = new BufferAttribute(array, itemSize)
		} else {
			const buffer = new InterleavedBuffer(array, stride)
			attribute = new InterleavedBufferAttribute(buffer, itemSize, 0)
		}
		geometry.setAttribute(name, attribute)
	}

	return geometry
}

function decodeBufferView(bufferView, attributeIDs, attributeTypes) {
	const draco = dracoModule
	if (!draco) throw new Error('Draco 解码器尚未初始化')
	const decoder = new draco.Decoder()
	try {
		const taskConfig = {
			attributeIDs: attributeIDs || DEFAULT_ATTRIBUTE_IDS,
			attributeTypes: attributeTypes || DEFAULT_ATTRIBUTE_TYPES,
			useUniqueIDs: !!attributeIDs,
		}
		const array = bufferView instanceof Uint8Array ? new Int8Array(bufferView.buffer, bufferView.byteOffset, bufferView.byteLength) : new Int8Array(bufferView)
		const geometryData = decodeGeometry(draco, decoder, array, taskConfig)
		return createGeometry(geometryData)
	} finally {
		draco.destroy(decoder)
	}
}

/** 返回与 GLTFLoader 期望的 DRACOLoader 接口兼容的对象 */
export function createSyncDracoLoader() {
	return {
		preload() {
			ensureDecoder().catch(err => {
				console.error('[Draco] 解码器预加载失败：', err)
			})
		},
		decodeDracoFile(bufferView, onLoad, attributeIDs, attributeTypes, _colorSpace, onError = () => {}) {
			ensureDecoder()
				.then(() => decodeBufferView(bufferView, attributeIDs, attributeTypes))
				.then(geometry => onLoad(geometry))
				.catch(err => onError(err))
		},
	}
}

export { ensureDecoder }
