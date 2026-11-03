<template>
	<div class="tool modelConvert">
		<h1 class="tool-title">
			3D 格式转换
			<span class="tip">读取任意受支持的 3D 文件，转换成 GLB / glTF / OBJ / STL / PLY / USDZ</span>
		</h1>

		<div class="tool-content">
			<Selector
				v-if="!source"
				title="点击选择 3D 模型文件，或拖拽到此处"
				:multiple="false"
				:filters="[MODEL_FILTER]"
				@selected="handleFiles"
				@drop="handleFiles"
			/>

			<div v-else class="layout">
				<div class="stage" :style="{ background: settings.background }">
					<div class="canvas-wrap" ref="containerRef"></div>
					<a-spin v-if="loading || busy" class="loading" size="large" :tip="busy ? '正在转换…' : '正在解析模型…'" />
					<div class="badge" v-if="result && result.verified">转换结果预览</div>
				</div>

				<div class="panel">
					<div class="tool-card block">
						<div class="block-title">源文件</div>
						<a-descriptions :column="1" size="small" bordered>
							<a-descriptions-item label="文件">{{ source.name }}</a-descriptions-item>
							<a-descriptions-item label="识别格式">
								{{ source.format.label }}（.{{ source.format.ext }}）
							</a-descriptions-item>
							<a-descriptions-item label="体积">{{ formatBytes(source.size) }}</a-descriptions-item>
							<a-descriptions-item label="网格 / 材质">{{ info.meshes }} / {{ info.materials }}</a-descriptions-item>
							<a-descriptions-item label="三角面">{{ info.triangles.toLocaleString() }}</a-descriptions-item>
							<a-descriptions-item label="尺寸">{{ info.dimensions }}</a-descriptions-item>
							<a-descriptions-item label="动画">{{ info.animations }} 个</a-descriptions-item>
						</a-descriptions>
					</div>

					<div class="tool-card block">
						<div class="block-title">目标格式</div>
						<a-select v-model:value="form.target" :options="exportOptions" style="width: 100%" @change="onTargetChange" />
						<div class="hint" style="margin-top: 8px; line-height: 1.7">
							{{ targetNote }}
						</div>
					</div>

					<div class="tool-card block" v-if="result">
						<div class="block-title">转换结果</div>
						<div class="result-row">
							<span class="hint">输出体积</span>
							<span class="strong">{{ formatBytes(result.bytes.length) }}</span>
						</div>
						<div class="result-row">
							<span class="hint">相比源文件</span>
							<span class="strong" :class="sizeClass">{{ sizeDiffText }}</span>
						</div>
						<div class="result-row">
							<span class="hint">结果校验</span>
							<span class="strong" :class="result.verified === true ? 'ok' : result.verified === false ? 'warn' : ''">
								{{
									result.verified === true
										? '已成功回读预览'
										: result.verified === false
											? `回读失败：${result.verifyError || '未知原因'}`
											: result.verifyNote
								}}
							</span>
						</div>
					</div>

					<a-alert v-if="errorText" type="error" show-icon :message="errorText" />
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">OBJ / STL 会丢掉材质贴图与动画；GLB 是最通用的单文件格式</span>
			<a-space>
				<a-button v-if="source" :disabled="busy" @click="reset">重新选择</a-button>
				<a-button type="primary" :disabled="!source || busy || loading" :loading="busy" @click="convert">
					开始转换
				</a-button>
				<a-button type="primary" ghost :disabled="!result || busy" @click="saveResult">保存文件</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import { basename, formatBytes, shrinkRate, stripExt } from '@/utils/image'
import {
	EXPORT_FORMATS,
	MODEL_FILTER,
	MODEL_FORMATS,
	detectModelFormat,
	disposeObject,
	exportModel,
	loadModel,
} from '@/utils/model3d'
import { createModelStage } from '@/utils/useModelStage'
import { uiState } from '@/utils/uiState'
import { friendlyError, saveBytesAs } from '@/utils/tauriIO'

const containerRef = ref(null)
const loading = ref(false)
const busy = ref(false)
const errorText = ref('')
const source = ref(null)
const result = ref(null)
let stage = null

const DEFAULT_STAGE_BG = { light: '#f5f6f8', dark: '#1a1a1a' }
const settings = reactive({ background: DEFAULT_STAGE_BG[uiState.theme] || DEFAULT_STAGE_BG.light, autoRotate: true })
const info = reactive({ meshes: 0, materials: 0, triangles: 0, dimensions: '-', animations: 0 })
const form = reactive({ target: 'glb' })

const exportOptions = EXPORT_FORMATS.map(item => ({ label: item.label, value: item.ext }))

/** 这些格式能再读回来做校验；USDZ 没有对应的读取器 */
const READABLE_OUTPUT = ['glb', 'gltf', 'obj', 'stl', 'ply']

const TARGET_NOTES = {
	glb: '把几何、材质贴图、动画打包进单个二进制文件，绝大多数软件与引擎都认这个格式。',
	gltf: '与 GLB 内容一致，但输出 JSON 文本，贴图以 base64 内嵌；文件更大、转换更慢，好处是能直接看结构。',
	obj: '最通用的几何交换格式，只保留三角面与材质名，贴图与动画会丢失。',
	stl: '只有三角面，没有材质与颜色，适合 3D 打印切片软件。',
	ply: '保留三角面与顶点颜色，点云/扫描模型转出来效果最好。',
	usdz: '苹果 AR Quick Look 使用的格式，会尝试把贴图一起打包。',
}
const targetNote = computed(() => TARGET_NOTES[form.target] || '')

const sizeDiffText = computed(() => {
	if (!result.value || !source.value?.size) return '-'
	const delta = shrinkRate(source.value.size, result.value.bytes.length)
	if (Math.abs(delta) < 0.5) return '基本持平'
	return delta > 0 ? `减小 ${delta.toFixed(1)}%` : `增大 ${Math.abs(delta).toFixed(1)}%`
})
const sizeClass = computed(() => {
	if (!result.value || !source.value?.size) return ''
	const delta = shrinkRate(source.value.size, result.value.bytes.length)
	if (Math.abs(delta) < 0.5) return ''
	return delta > 0 ? 'ok' : 'warn'
})

/* ---------------- 载入源文件 ---------------- */

/**
 * 舞台只在选了文件之后才渲染出来（选择器占了整块区域），
 * 所以不能在 onMounted 里建，要等到 DOM 出现后再初始化。
 */
const ensureStage = async () => {
	await nextTick()
	if (!stage || !containerRef.value?.isConnected) {
		stage?.dispose()
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
	}
	return stage
}

const handleFiles = async sources => {
	const list = (Array.isArray(sources) ? sources : [sources]).filter(Boolean).slice(0, 1)
	if (!list.length) return
	const fileLike = list[0]
	const isPath = typeof fileLike === 'string'
	const name = isPath ? basename(fileLike) : fileLike.name || 'model'
	const format = detectModelFormat(name)
	if (!format) {
		message.error(`暂不支持 .${name.split('.').pop()} 格式`)
		return
	}
	loading.value = true
	errorText.value = ''
	result.value = null
	try {
		const bytes = isPath ? null : new Uint8Array(await fileLike.arrayBuffer())
		const loaded = await loadModel(isPath ? { path: fileLike, name } : { bytes, name })
		source.value = {
			name,
			path: isPath ? String(fileLike) : '',
			bytes,
			size: loaded.size,
			format: loaded.format,
		}
		info.animations = loaded.animations.length
		const target = await ensureStage()
		target.setModel(loaded.object, loaded.animations, loaded.urls)
		form.target = loaded.format.ext === 'glb' ? 'gltf' : 'glb'
		if (loaded.warnings?.length) message.info(loaded.warnings.join('；'))
	} catch (err) {
		errorText.value = friendlyError(err)
		message.error(errorText.value)
	} finally {
		loading.value = false
	}
}

const reset = () => {
	source.value = null
	result.value = null
	errorText.value = ''
	stage?.dispose()
	stage = null
}

const onTargetChange = () => {
	result.value = null
	errorText.value = ''
}

/* ---------------- 转换 ---------------- */

/** 每次转换都重新读一遍源文件，避免上一次转换把源对象占用/释放掉 */
const readSource = async () => {
	const current = source.value
	if (!current) throw new Error('还没有选择源文件')
	return await loadModel(
		current.path ? { path: current.path, name: current.name } : { bytes: current.bytes, name: current.name }
	)
}

const convert = async () => {
	if (!source.value) return
	busy.value = true
	errorText.value = ''
	result.value = null
	let loaded = null
	try {
		loaded = await readSource()
		const bytes = await exportModel(loaded.object, form.target, { animations: loaded.animations })
		if (!bytes?.length) throw new Error('转换结果为空')
		result.value = { bytes, ext: form.target, verified: null, verifyError: '', verifyNote: '' }

		// 把转换结果读回舞台，等于替用户做一次可用性校验
		if (!READABLE_OUTPUT.includes(form.target)) {
			result.value.verifyNote = '该格式本工具无法回读，已按标准写出'
		} else if (bytes.length > 24 * 1024 * 1024) {
			result.value.verifyNote = '结果较大，已跳过回读校验'
		} else {
			try {
				const back = await loadModel({ bytes, name: `converted.${form.target}` })
				stage.setModel(back.object, back.animations, back.urls)
				result.value.verified = true
			} catch (err) {
				result.value.verified = false
				result.value.verifyError = friendlyError(err)
			}
		}
		message.success(`已转换为 ${form.target.toUpperCase()}（${formatBytes(bytes.length)}）`)
	} catch (err) {
		errorText.value = `转换失败：${friendlyError(err)}`
		message.error(errorText.value)
	} finally {
		disposeObject(loaded?.object || null, loaded?.urls || [])
		busy.value = false
	}
}

const saveResult = async () => {
	if (!result.value) return
	const { bytes, ext } = result.value
	const item = EXPORT_FORMATS.find(format => format.ext === ext)
	try {
		const path = await saveBytesAs(bytes, {
			defaultPath: `${stripExt(source.value?.name || 'model')}.${ext}`,
			filters: [{ name: (item?.label || ext).split(' ')[0], extensions: [ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

/* ---------------- 生命周期 ---------------- */

if (import.meta.env.DEV) {
	window.__modelConvertTest = {
		handleFiles,
		convert,
		set: patch => Object.assign(form, patch),
		state: () => ({
			source: source.value?.name || '',
			format: source.value?.format?.ext || '',
			target: form.target,
			resultSize: result.value?.bytes.length || 0,
			verified: result.value?.verified ?? null,
			verifyNote: result.value?.verifyNote || '',
			error: errorText.value,
		}),
		formats: () => MODEL_FORMATS.map(item => item.ext),
	}
}

onUnmounted(() => {
	stage?.dispose()
	stage = null
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.modelConvert {
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
	.loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.6);
	}
	.badge {
		position: absolute;
		top: 12px;
		left: 12px;
		padding: 3px 10px;
		border-radius: 20px;
		font-size: 12px;
		color: #fff;
		background: rgba(22, 119, 255, 0.85);
	}
	.panel {
		width: 380px;
		max-width: 100%;
		display: flex;
		flex-flow: column;
		gap: 10px;
		overflow: auto;
		/* 三张卡片要塞进一屏，行高收一收 */
		:deep(.ant-descriptions-item-label),
		:deep(.ant-descriptions-item-content) {
			padding: 5px 8px !important;
			font-size: 12px;
		}
		.block {
			padding: 10px 14px;
		}
	}
	.block-title {
		font-weight: 600;
		color: var(--text-color);
		margin-bottom: 10px;
	}
	.result-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		& + .result-row {
			margin-top: 8px;
		}
		.strong {
			font-size: 13px;
			font-weight: 600;
			color: var(--text-color);
			text-align: right;
			&.ok {
				color: #52c41a;
			}
			&.warn {
				color: #fa8c16;
			}
		}
	}
}
</style>
