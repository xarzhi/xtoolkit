<template>
	<div class="tool imgCrop">
		<h1 class="tool-title">
			图片裁剪
			<span class="tip">拖拽选择裁剪区域，或直接输入精确像素；支持常用比例与自定义输出尺寸</span>
		</h1>

		<div class="tool-content">
			<Selector
				v-if="!source"
				title="点击选择图片，或拖拽到此处"
				:multiple="false"
				:filters="[IMAGE_FILTER]"
				@selected="handleFiles"
				@drop="handleFiles"
			/>

			<a-spin v-else :spinning="loading">
				<div class="editor">
					<div class="stage-wrap" ref="containerRef">
						<div class="stage" ref="stageRef" :style="stageStyle">
							<img :src="source.url" alt="" draggable="false" />
							<div class="crop-box" :style="boxStyle" @mousedown.stop="startDrag($event, 'move')">
								<div
									v-for="handle in handles"
									:key="handle"
									:class="['handle', handle]"
									@mousedown.stop="startDrag($event, 'resize', handle)"
								></div>
								<div class="size-tag">{{ crop.width }} × {{ crop.height }}</div>
							</div>
						</div>
						<div class="hint stage-info">
							原图 {{ source.width }} × {{ source.height }} · {{ source.name }}
						</div>
					</div>

					<div class="panel">
						<div class="tool-card block">
							<div class="block-title">裁剪比例</div>
							<a-radio-group v-model:value="ratioKey" size="small" @change="applyRatio">
								<a-radio-button v-for="item in CROP_RATIOS" :key="item.value" :value="item.value">
									{{ item.label }}
								</a-radio-button>
							</a-radio-group>
						</div>

						<div class="tool-card block">
							<div class="block-title">裁剪区域（像素）</div>
							<div class="grid">
								<a-input-number
									v-model:value="crop.x"
									:min="0"
									:max="Math.max(0, source.width - crop.width)"
									addon-before="X"
									@change="normalizeCrop"
								/>
								<a-input-number
									v-model:value="crop.y"
									:min="0"
									:max="Math.max(0, source.height - crop.height)"
									addon-before="Y"
									@change="normalizeCrop"
								/>
								<a-input-number
									v-model:value="crop.width"
									:min="MIN_CROP"
									:max="source.width"
									addon-before="宽"
									@change="() => onCropSizeChange('width')"
								/>
								<a-input-number
									v-model:value="crop.height"
									:min="MIN_CROP"
									:max="source.height"
									addon-before="高"
									@change="() => onCropSizeChange('height')"
								/>
							</div>
							<a-space :size="8" class="row-actions">
								<a-button size="small" @click="centerCrop">居中</a-button>
								<a-button size="small" @click="maxCrop">占满</a-button>
								<a-button size="small" @click="resetCrop">重置</a-button>
							</a-space>
						</div>

						<div class="tool-card block">
							<div class="block-title">输出尺寸</div>
							<a-radio-group v-model:value="outMode" size="small" class="row-actions">
								<a-radio-button value="crop">跟随裁剪尺寸</a-radio-button>
								<a-radio-button value="custom">自定义尺寸</a-radio-button>
							</a-radio-group>
							<div class="grid" v-if="outMode === 'custom'">
								<a-input-number
									v-model:value="outSize.width"
									:min="1"
									:max="20000"
									addon-before="宽"
									@change="() => onOutSizeChange('width')"
								/>
								<a-input-number
									v-model:value="outSize.height"
									:min="1"
									:max="20000"
									addon-before="高"
									@change="() => onOutSizeChange('height')"
								/>
							</div>
							<div class="row-actions" v-if="outMode === 'custom'">
								<a-space :size="12" align="center">
									<a-checkbox v-model:checked="keepOutRatio">锁定宽高比</a-checkbox>
									<a-button size="small" @click="syncOutFromCrop">按裁剪尺寸填充</a-button>
								</a-space>
							</div>
							<div class="hint">最终输出 {{ outputSize.width }} × {{ outputSize.height }} 像素</div>
						</div>

						<div class="tool-card block">
							<div class="block-title">预览</div>
							<div class="preview">
								<canvas ref="previewRef"></canvas>
							</div>
						</div>
					</div>
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<a-space :size="12" align="center" wrap>
				<span class="label">导出格式</span>
				<a-select v-model:value="form.format" style="width: 150px" :options="formatOptions" />
				<template v-if="currentFormat.lossy">
					<span class="label">质量</span>
					<a-slider v-model:value="form.quality" :min="0.1" :max="1" :step="0.01" style="width: 130px" />
					<span class="hint">{{ Math.round(form.quality * 100) }}%</span>
				</template>
			</a-space>
			<a-space>
				<a-button v-if="source" :disabled="busy" @click="reset">重新选择</a-button>
				<a-button type="primary" :disabled="!source" :loading="busy" @click="saveCrop">裁剪并保存</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import {
	CROP_RATIOS,
	IMAGE_FILTER,
	MIN_CROP,
	canvasToBytes,
	clampRect,
	createCanvas,
	cropCanvas,
	decodeImageBytes,
	fitRectToRatio,
	getOutputFormat,
	moveRect,
	resizeRectFree,
	resizeRectLocked,
	sniffMime,
	stripExt,
} from '@/utils/image'
import { friendlyError, readSourceBytes, saveBytesAs } from '@/utils/tauriIO'
import { useFitBox } from '@/utils/useFitBox'

const source = ref(null)
const loading = ref(false)
const busy = ref(false)
const stageRef = ref(null)
const previewRef = ref(null)

const crop = reactive({ x: 0, y: 0, width: 0, height: 0 })
const outSize = reactive({ width: 0, height: 0 })
const ratioKey = ref('free')
const outMode = ref('crop')
const keepOutRatio = ref(true)
const form = ref({ format: 'png', quality: 0.92 })

const formatOptions = [
	{ label: 'PNG（支持透明）', value: 'png' },
	{ label: 'JPG', value: 'jpg' },
	{ label: 'WEBP', value: 'webp' },
]
const currentFormat = computed(() => getOutputFormat(form.value.format))
const currentRatio = computed(() => CROP_RATIOS.find(i => i.value === ratioKey.value)?.ratio ?? null)

/** 显示尺寸由 JS 按真实宽高比计算，避免 CSS 压扁导致裁剪框与画面错位 */
const { containerRef, fit } = useFitBox({ maxWidth: 760, maxHeight: 520 })
const stageStyle = computed(() => {
	if (!source.value) return {}
	return fit(source.value.width, source.value.height)
})
const boxStyle = computed(() => {
	if (!source.value) return {}
	return {
		left: `${(crop.x / source.value.width) * 100}%`,
		top: `${(crop.y / source.value.height) * 100}%`,
		width: `${(crop.width / source.value.width) * 100}%`,
		height: `${(crop.height / source.value.height) * 100}%`,
	}
})
/** 锁定比例时只保留四角手柄，自由比例时八个方向都可拉伸 */
const handles = computed(() => (currentRatio.value ? ['nw', 'ne', 'se', 'sw'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']))

const outputSize = computed(() => {
	if (outMode.value === 'crop') return { width: crop.width, height: crop.height }
	return { width: Math.max(1, Math.round(outSize.width)), height: Math.max(1, Math.round(outSize.height)) }
})

/* ---------------- 载入 ---------------- */

const handleFiles = async sources => {
	const list = (Array.isArray(sources) ? sources : [sources]).filter(Boolean).slice(0, 1)
	if (!list.length) return
	loading.value = true
	try {
		const bytes = await readSourceBytes(list[0])
		const name = typeof list[0] === 'string' ? list[0].split(/[\\/]/).pop() : list[0].name
		const mime = sniffMime(bytes)
		const decoded = await decodeImageBytes(bytes, mime)
		if (source.value?.url) URL.revokeObjectURL(source.value.url)
		source.value = { name, bytes, mime, url: decoded.url, width: decoded.width, height: decoded.height, img: decoded.img }
		ratioKey.value = 'free'
		outMode.value = 'crop'
		resetCrop()
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		loading.value = false
	}
}

/* ---------------- 裁剪区操作 ---------------- */

const bounds = () => ({ width: source.value?.width || 0, height: source.value?.height || 0 })

const normalizeCrop = () => {
	Object.assign(crop, clampRect(crop, bounds().width, bounds().height))
}

const onCropSizeChange = changed => {
	const ratio = currentRatio.value
	if (ratio) {
		// 锁定比例时，按被修改的一边推算另一边
		if (changed === 'width') crop.height = Math.round(crop.width / ratio)
		else crop.width = Math.round(crop.height * ratio)
	}
	normalizeCrop()
}

const resetCrop = () => {
	if (!source.value) return
	Object.assign(crop, fitRectToRatio(source.value.width, source.value.height, currentRatio.value))
	syncOutFromCrop()
}

const maxCrop = () => {
	if (!source.value) return
	Object.assign(crop, fitRectToRatio(source.value.width, source.value.height, currentRatio.value))
	syncOutFromCrop()
}

const centerCrop = () => {
	if (!source.value) return
	Object.assign(
		crop,
		clampRect(
			{ x: (source.value.width - crop.width) / 2, y: (source.value.height - crop.height) / 2, width: crop.width, height: crop.height },
			source.value.width,
			source.value.height
		)
	)
}

const applyRatio = () => {
	if (!source.value) return
	Object.assign(crop, fitRectToRatio(source.value.width, source.value.height, currentRatio.value, { ...crop }))
	syncOutFromCrop()
}

/* ---------------- 输出尺寸 ---------------- */

const syncOutFromCrop = () => {
	outSize.width = crop.width
	outSize.height = crop.height
}
const onOutSizeChange = changed => {
	if (!keepOutRatio.value) return
	const ratio = crop.width / crop.height
	if (changed === 'width') outSize.height = Math.max(1, Math.round(outSize.width / ratio))
	else outSize.width = Math.max(1, Math.round(outSize.height * ratio))
}

/* ---------------- 拖拽 ---------------- */

const drag = ref(null)

const toImagePoint = event => {
	const rect = stageRef.value.getBoundingClientRect()
	const scale = source.value.width / rect.width
	return { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale }
}

const startDrag = (event, mode, handle) => {
	if (!source.value || event.button !== 0) return
	event.preventDefault()
	drag.value = { mode, handle, startCrop: { ...crop }, startPoint: toImagePoint(event) }
	window.addEventListener('mousemove', onDragMove)
	window.addEventListener('mouseup', endDrag)
}

const onDragMove = event => {
	const d = drag.value
	if (!d || !source.value) return
	const point = toImagePoint(event)
	if (d.mode === 'move') {
		Object.assign(crop, moveRect(d.startCrop, point.x - d.startPoint.x, point.y - d.startPoint.y, bounds()))
	} else if (currentRatio.value) {
		Object.assign(crop, resizeRectLocked(d.handle, point, d.startCrop, currentRatio.value, bounds()))
	} else {
		Object.assign(
			crop,
			resizeRectFree(d.handle, point.x - d.startPoint.x, point.y - d.startPoint.y, d.startCrop, bounds())
		)
	}
	if (outMode.value === 'crop') syncOutFromCrop()
}

const endDrag = () => {
	drag.value = null
	window.removeEventListener('mousemove', onDragMove)
	window.removeEventListener('mouseup', endDrag)
}

onUnmounted(endDrag)

/* ---------------- 预览与导出 ---------------- */

const buildOutputCanvas = () => {
	const target = outputSize.value
	const cropped = cropCanvas(source.value.img, crop)
	const canvas = createCanvas(target.width, target.height)
	const ctx = canvas.getContext('2d')
	if (!currentFormat.value.alpha) {
		ctx.fillStyle = '#ffffff'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
	}
	ctx.imageSmoothingEnabled = true
	ctx.imageSmoothingQuality = 'high'
	ctx.drawImage(cropped, 0, 0, canvas.width, canvas.height)
	return canvas
}

let previewRaf = 0
const renderPreview = () => {
	const canvas = previewRef.value
	if (!canvas || !source.value || !crop.width || !crop.height) return
	const out = buildOutputCanvas()
	const max = 240
	const ratio = Math.min(1, max / Math.max(out.width, out.height))
	canvas.width = Math.max(1, Math.round(out.width * ratio))
	canvas.height = Math.max(1, Math.round(out.height * ratio))
	const ctx = canvas.getContext('2d')
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	ctx.imageSmoothingQuality = 'high'
	ctx.drawImage(out, 0, 0, canvas.width, canvas.height)
}

const schedulePreview = () => {
	if (previewRaf) return
	previewRaf = requestAnimationFrame(() => {
		previewRaf = 0
		renderPreview()
	})
}

watch([() => ({ ...crop }), outputSize, () => form.value.format], schedulePreview, { deep: true, immediate: true })

const saveCrop = async () => {
	if (!source.value) return
	busy.value = true
	try {
		const canvas = buildOutputCanvas()
		const bytes = await canvasToBytes(canvas, form.value.format)
		const ext = currentFormat.value.ext
		const path = await saveBytesAs(bytes, {
			defaultPath: `${stripExt(source.value.name)}_crop.${ext}`,
			filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		busy.value = false
	}
}

const reset = () => {
	if (source.value?.url) URL.revokeObjectURL(source.value.url)
	source.value = null
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.imgCrop {
	.editor {
		display: flex;
		gap: 20px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.stage-wrap {
		flex: 1;
		min-width: 300px;
		display: flex;
		flex-flow: column;
	}
	.stage {
		position: relative;
		overflow: hidden;
		background: #2b2b2b;
		border-radius: 8px;
		user-select: none;
		line-height: 0;
		margin: 0 auto;
		img {
			display: block;
			width: 100%;
			height: 100%;
			pointer-events: none;
		}
		.crop-box {
			position: absolute;
			border: 1px solid #fff;
			box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
			cursor: move;
			box-sizing: border-box;
			.size-tag {
				position: absolute;
				left: 0;
				top: -24px;
				padding: 0 6px;
				font-size: 12px;
				line-height: 20px;
				color: #fff;
				background: rgba(0, 0, 0, 0.55);
				border-radius: 4px;
				white-space: nowrap;
			}
			.handle {
				position: absolute;
				width: 10px;
				height: 10px;
				background: #fff;
				border: 1px solid #1677ff;
				border-radius: 2px;
				box-sizing: border-box;
			}
			.handle.nw {
				left: -5px;
				top: -5px;
				cursor: nwse-resize;
			}
			.handle.n {
				left: 50%;
				margin-left: -5px;
				top: -5px;
				cursor: ns-resize;
			}
			.handle.ne {
				right: -5px;
				top: -5px;
				cursor: nesw-resize;
			}
			.handle.e {
				right: -5px;
				top: 50%;
				margin-top: -5px;
				cursor: ew-resize;
			}
			.handle.se {
				right: -5px;
				bottom: -5px;
				cursor: nwse-resize;
			}
			.handle.s {
				left: 50%;
				margin-left: -5px;
				bottom: -5px;
				cursor: ns-resize;
			}
			.handle.sw {
				left: -5px;
				bottom: -5px;
				cursor: nesw-resize;
			}
			.handle.w {
				left: -5px;
				top: 50%;
				margin-top: -5px;
				cursor: ew-resize;
			}
		}
	}
	.stage-info {
		margin-top: 10px;
	}
	.panel {
		width: 380px;
		max-width: 100%;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.block {
		.block-title {
			font-weight: 600;
			color: #262626;
			margin-bottom: 10px;
		}
		.grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 8px;
		}
		.row-actions {
			margin-top: 10px;
		}
		:deep(.ant-input-number) {
			width: 100%;
		}
	}
	.preview {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 120px;
		padding: 8px;
		border-radius: 8px;
		background:
			linear-gradient(45deg, #f2f2f2 25%, transparent 25%, transparent 75%, #f2f2f2 75%) 0 0 / 12px 12px,
			linear-gradient(45deg, #f2f2f2 25%, transparent 25%, transparent 75%, #f2f2f2 75%) 6px 6px / 12px 12px,
			#fff;
		canvas {
			max-width: 100%;
			box-shadow: 0 1px 6px rgba(0, 0, 0, 0.15);
		}
	}
	.label {
		font-size: 13px;
		color: rgba(0, 0, 0, 0.65);
	}
}
</style>
