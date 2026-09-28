<template>
	<div class="tool nineGrid">
		<h1 class="tool-title">
			图片切割
			<span class="tip">把图片按 4 宫格 / 9 宫格切开，也可自定义行列；常用于朋友圈、小红书</span>
		</h1>

		<div class="tool-content">
			<Selector
				v-if="!source"
				title="点击选择一张图片，或拖拽到此处"
				:multiple="false"
				:filters="[IMAGE_FILTER]"
				@selected="handleFiles"
				@drop="handleFiles"
			/>

			<a-spin v-else :spinning="loading">
				<div class="editor">
					<div class="left">
						<div class="preview">
							<img :src="source.url" alt="" />
							<div class="grid-mask" :style="gridStyle"></div>
							<div class="gap-mask" v-if="sliceInset > 0">
								<span v-for="(rect, index) in gapStrips" :key="index" class="strip" :style="rect"></span>
							</div>
						</div>
						<div class="hint meta">
							{{ source.name }} · 原图 {{ source.width }} × {{ source.height }} · 每格约 {{ cellW }} × {{ cellH }}
							<span v-if="sliceInset > 0">
								→ 四边各裁掉 {{ sliceInset }} px，导出 {{ exportSize.width }} × {{ exportSize.height }}
							</span>
						</div>
						<div class="hint" v-if="notDivisible">提示：图片尺寸无法被行/列整除，最后一格会略大一些</div>
						<div class="hint" v-if="sliceInset > 0">白色区域就是被舍弃的边，用来在朋友圈里形成均匀间隙</div>
					</div>
					<div class="right">
						<div class="slices" :style="{ gridTemplateColumns: `repeat(${form.cols}, 1fr)` }">
							<div
								v-for="slice in slices"
								:key="slice.index"
								class="slice"
								:title="`第 ${slice.row + 1} 行第 ${slice.col + 1} 列 · 点击单独保存`"
								@click="saveSlice(slice)"
							>
								<img :src="slice.thumb" alt="" />
								<span class="label">{{ slice.row + 1 }}-{{ slice.col + 1 }}</span>
							</div>
						</div>
						<div class="hint">点击任意一格即可单独保存</div>
					</div>
				</div>
			</a-spin>
		</div>

		<div class="tool-footer">
			<a-form layout="inline" :model="form" class="options">
				<a-form-item label="切割方式">
					<a-radio-group v-model:value="form.preset" button-style="solid" @change="onPresetChange">
						<a-radio-button v-for="item in gridPresets" :key="item.value" :value="item.value">
							{{ item.label }}
						</a-radio-button>
					</a-radio-group>
				</a-form-item>
				<a-form-item label="行">
					<a-input-number v-model:value="form.rows" :min="1" :max="20" :disabled="form.preset !== 'custom'" style="width: 88px" />
				</a-form-item>
				<a-form-item label="列">
					<a-input-number v-model:value="form.cols" :min="1" :max="20" :disabled="form.preset !== 'custom'" style="width: 88px" />
				</a-form-item>
				<a-form-item label="间隙">
					<a-input-number v-model:value="form.gap" :min="0" :max="maxGap" :step="2" style="width: 100px" />
					<span class="hint" style="margin-left: 6px">px，每格四边各裁掉（0 = 不留间隙）</span>
				</a-form-item>
				<a-form-item label="导出格式">
					<a-select v-model:value="form.format" style="width: 120px" :options="formatOptions" />
				</a-form-item>
				<a-form-item label="命名方式">
					<a-select v-model:value="form.naming" style="width: 170px" :options="namingOptions" />
				</a-form-item>
			</a-form>
			<a-space>
				<a-button v-if="source" :disabled="busy" @click="reset">重新选择</a-button>
				<a-button type="primary" :loading="busy" :disabled="!source" @click="exportAll">
					导出全部（{{ slices.length }} 张）
				</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import {
	IMAGE_FILTER,
	canvasToBytes,
	createCanvas,
	decodeImageBytes,
	dirname,
	getOutputFormat,
	joinPath,
	sniffMime,
	splitImageGrid,
	stripExt,
	uniqueName,
} from '@/utils/image'
import { friendlyError, ensureDir, pathExists, pickDirectory, readSourceBytes, revealInExplorer, saveBytesAs, writeBytes } from '@/utils/tauriIO'

const source = ref(null)
const slices = ref([])
const loading = ref(false)
const busy = ref(false)
const form = ref({ preset: 'grid9', rows: 3, cols: 3, gap: 0, format: 'png', naming: 'rowcol' })

/** 常用切割方式，自定义时才需要手动填行列 */
const gridPresets = [
	{ label: '4 宫格（2 × 2）', value: 'grid4', rows: 2, cols: 2 },
	{ label: '9 宫格（3 × 3）', value: 'grid9', rows: 3, cols: 3 },
	{ label: '自定义', value: 'custom', rows: 0, cols: 0 },
]

const onPresetChange = () => {
	const preset = gridPresets.find(item => item.value === form.value.preset)
	if (preset && preset.value !== 'custom') {
		form.value.rows = preset.rows
		form.value.cols = preset.cols
	}
}

const formatOptions = [
	{ label: 'PNG', value: 'png' },
	{ label: 'JPG', value: 'jpg' },
	{ label: 'WEBP', value: 'webp' },
]
const namingOptions = [
	{ label: '行列（1-1、1-2…）', value: 'rowcol' },
	{ label: '序号（01、02…）', value: 'index' },
]

const cellW = computed(() => (source.value ? Math.floor(source.value.width / form.value.cols) : 0))
const cellH = computed(() => (source.value ? Math.floor(source.value.height / form.value.rows) : 0))
const notDivisible = computed(() => {
	if (!source.value) return false
	return source.value.width % form.value.cols !== 0 || source.value.height % form.value.rows !== 0
})

/** 间隙允许的最大值：不能超过半格，否则整格会被裁没 */
const maxGap = computed(() => Math.max(0, Math.floor(Math.min(cellW.value, cellH.value) / 2) - 1))
/** 实际生效的内缩值（会自动夹到上限） */
const sliceInset = computed(() => Math.max(0, Math.min(maxGap.value, Math.round(form.value.gap || 0))))
const exportSize = computed(() => {
	const first = slices.value[0]
	return first ? { width: first.width, height: first.height } : { width: 0, height: 0 }
})

/** 被舍弃的边（预览里盖白色），按百分比定位 */
const gapStrips = computed(() => {
	const current = source.value
	if (!current || sliceInset.value <= 0) return []
	const rects = []
	for (const slice of slices.value) {
		if (!slice.inset) continue
		const left = (slice.cellX / current.width) * 100
		const top = (slice.cellY / current.height) * 100
		const width = (slice.cellWidth / current.width) * 100
		const height = (slice.cellHeight / current.height) * 100
		const insetX = (slice.inset / current.width) * 100
		const insetY = (slice.inset / current.height) * 100
		rects.push({ left: `${left}%`, top: `${top}%`, width: `${insetX}%`, height: `${height}%` })
		rects.push({ left: `${left + width - insetX}%`, top: `${top}%`, width: `${insetX}%`, height: `${height}%` })
		rects.push({ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${insetY}%` })
		rects.push({ left: `${left}%`, top: `${top + height - insetY}%`, width: `${width}%`, height: `${insetY}%` })
	}
	return rects
})

const gridStyle = computed(() => ({
	backgroundImage:
		'linear-gradient(to right, rgba(22, 119, 255, 0.85) 1px, transparent 1px), linear-gradient(to bottom, rgba(22, 119, 255, 0.85) 1px, transparent 1px)',
	backgroundSize: `${100 / form.value.cols}% ${100 / form.value.rows}%`,
}))

const thumbnailOf = (canvas, max = 110) => {
	const ratio = Math.min(1, max / Math.max(canvas.width, canvas.height))
	const small = createCanvas(canvas.width * ratio, canvas.height * ratio)
	small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height)
	return small.toDataURL('image/png')
}

const rebuildSlices = () => {
	if (!source.value) {
		slices.value = []
		return
	}
	slices.value = splitImageGrid(source.value.img, form.value.rows, form.value.cols, { inset: sliceInset.value }).map(slice => ({
		...slice,
		thumb: thumbnailOf(slice.canvas),
	}))
}

watch(
	() => [form.value.rows, form.value.cols, sliceInset.value],
	() => rebuildSlices()
)

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
		source.value = {
			name,
			path: typeof list[0] === 'string' ? list[0] : '',
			bytes,
			mime,
			url: decoded.url,
			width: decoded.width,
			height: decoded.height,
			img: decoded.img,
		}
		rebuildSlices()
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		loading.value = false
	}
}

/** JPG / BMP 不支持透明，需要先铺白底 */
const sliceBytes = async slice => {
	const fmt = getOutputFormat(form.value.format)
	if (fmt.alpha) return await canvasToBytes(slice.canvas, fmt.value)
	const canvas = createCanvas(slice.width, slice.height)
	const ctx = canvas.getContext('2d')
	ctx.fillStyle = '#ffffff'
	ctx.fillRect(0, 0, canvas.width, canvas.height)
	ctx.drawImage(slice.canvas, 0, 0)
	return await canvasToBytes(canvas, fmt.value)
}

const fileName = slice => {
	const ext = getOutputFormat(form.value.format).ext
	const base = stripExt(source.value?.name || 'image')
	const suffix = form.value.naming === 'index' ? String(slice.index).padStart(2, '0') : `${slice.row + 1}-${slice.col + 1}`
	return `${base}_${suffix}.${ext}`
}

const saveSlice = async slice => {
	try {
		const bytes = await sliceBytes(slice)
		const path = await saveBytesAs(bytes, { defaultPath: fileName(slice) })
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const exportAll = async () => {
	if (!source.value) return
	const parent = await pickDirectory({
		title: '选择保存位置（会在其中新建一个文件夹）',
		defaultPath: source.value.path ? dirname(source.value.path) : undefined,
	})
	if (!parent) return
	busy.value = true
	const used = new Set()
	let ok = 0
	let outDir = ''
	try {
		// 先新建一个以「图片名_行x列」命名的文件夹，重名自动加序号
		const base = stripExt(source.value.name || 'image')
		const folderBase = `${base}_${form.value.rows}x${form.value.cols}`
		let folderName = folderBase
		let index = 1
		outDir = joinPath(parent, folderName)
		while (await pathExists(outDir)) {
			folderName = `${folderBase}(${index})`
			outDir = joinPath(parent, folderName)
			index += 1
			if (index > 500) break
		}
		await ensureDir(outDir)

		for (const slice of slices.value) {
			try {
				const bytes = await sliceBytes(slice)
				const name = uniqueName(used, fileName(slice))
				await writeBytes(joinPath(outDir, name), bytes)
				ok += 1
			} catch (err) {
				message.error(`第 ${slice.row + 1} 行第 ${slice.col + 1} 列导出失败：${friendlyError(err)}`)
			}
		}
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		busy.value = false
	}
	if (!ok) return
	Modal.confirm({
		title: `已导出 ${ok} 张图片到新建的文件夹`,
		content: outDir,
		okText: '打开文件夹',
		cancelText: '关闭',
		onOk: () => revealInExplorer(outDir),
	})
}

const reset = () => {
	if (source.value?.url) URL.revokeObjectURL(source.value.url)
	source.value = null
	slices.value = []
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.nineGrid {
	.editor {
		display: flex;
		gap: 20px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.left {
		flex: 1;
		min-width: 280px;
	}
	.preview {
		position: relative;
		display: inline-block;
		max-width: 100%;
		line-height: 0;
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
		img {
			max-width: 100%;
			max-height: 52vh;
			display: block;
		}
		.grid-mask {
			position: absolute;
			inset: 0;
			pointer-events: none;
		}
		.gap-mask {
			position: absolute;
			inset: 0;
			pointer-events: none;
			.strip {
				position: absolute;
				background: rgba(255, 255, 255, 0.92);
				outline: 1px dashed rgba(22, 119, 255, 0.5);
				box-sizing: border-box;
			}
		}
	}
	.meta {
		margin-top: 10px;
	}
	.right {
		width: 380px;
		max-width: 100%;
	}
	.slices {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		.slice {
			position: relative;
			padding: 4px;
			border: 1px solid rgba(0, 0, 0, 0.08);
			border-radius: 8px;
			background: #fff;
			cursor: pointer;
			transition: all 0.2s ease;
			line-height: 0;
			&:hover {
				border-color: #1677ff;
				box-shadow: 0 2px 8px rgba(22, 119, 255, 0.25);
				transform: translateY(-1px);
			}
			img {
				width: 100%;
				display: block;
				border-radius: 5px;
			}
			.label {
				position: absolute;
				right: 8px;
				bottom: 8px;
				padding: 0 5px;
				font-size: 11px;
				line-height: 16px;
				color: #fff;
				background: rgba(0, 0, 0, 0.45);
				border-radius: 4px;
			}
		}
	}
	.options {
		flex: 1;
		:deep(.ant-form-item) {
			margin-bottom: 4px;
		}
	}
}
</style>
