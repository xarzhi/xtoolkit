<template>
	<div class="tool imgCompress">
		<h1 class="tool-title">
			图片压缩
			<span class="tip">拖动滑块选择压缩强度，也可自定义质量 / 体积 / 比例</span>
		</h1>

		<div class="tool-content">
			<Selector
				title="点击选择图片，或把图片拖到这里"
				desc="支持多选；压缩全部在本地完成，不会上传"
				:filters="[IMAGE_FILTER]"
				@selected="handleFiles"
				@drop="handleFiles"
			/>

			<a-alert v-if="errors.length" type="warning" show-icon class="alert" @close="errors = []">
				<template #message>部分文件未能添加</template>
				<template #description>
					<div v-for="(err, index) in errors" :key="index">{{ err }}</div>
				</template>
			</a-alert>

			<a-spin :spinning="loading">
				<a-empty v-if="!items.length && !loading" description="还没有选择图片" style="margin-top: 40px" />

				<a-table v-else class="list" :data-source="items" row-key="id" size="small" :pagination="false">
					<a-table-column title="预览" width="84">
						<template #default="{ record }">
							<img class="thumb" :src="record.url" :alt="record.name" />
						</template>
					</a-table-column>
					<a-table-column title="文件名" data-index="name" ellipsis />
					<a-table-column title="尺寸" width="170">
						<template #default="{ record }">
							{{ record.width }} × {{ record.height }}
							<span v-if="record.out" class="hint">→ {{ record.out.width }} × {{ record.out.height }}</span>
							<a-tag v-if="record.ext === 'gif' && (record.gif?.frameCount || 1) > 1" color="blue">
								{{ record.gif.frameCount }} 帧
							</a-tag>
						</template>
					</a-table-column>
					<a-table-column title="原大小" width="96">
						<template #default="{ record }">{{ formatBytes(record.size) }}</template>
					</a-table-column>
					<a-table-column title="压缩后" width="210">
						<template #default="{ record }">
							<div v-if="record.out" class="result">
								<span>{{ formatBytes(record.out.bytes.length) }}</span>
								<a-tag :color="record.out.bytes.length <= record.size ? 'green' : 'orange'">{{ rateText(record) }}</a-tag>
							</div>
							<span v-else class="hint">待压缩</span>
						</template>
					</a-table-column>
					<a-table-column title="操作" width="150">
						<template #default="{ record }">
							<a-button type="link" size="small" :loading="record.status === 'working'" @click="compressOne(record)"
								>压缩</a-button
							>
							<a-button type="link" size="small" :disabled="!record.out" @click="saveOne(record)">保存</a-button>
							<a-button type="link" size="small" danger @click="remove(record.id)">移除</a-button>
						</template>
					</a-table-column>
				</a-table>
			</a-spin>
		</div>

		<div class="tool-footer">
			<div class="options">
				<div class="row strength-row">
					<span class="label">压缩强度</span>
					<a-slider
						v-model:value="form.levelIndex"
						class="strength-slider"
						:min="1"
						:max="5"
						:step="1"
						:marks="levelMarks"
						:tip-formatter="tipFormatter"
					/>
					<div class="level-desc">
						<span class="level-name">{{ currentLevel.label }}</span>
						<span class="hint">{{ currentLevel.desc }}</span>
						<span class="hint" v-if="currentLevel.scale && currentLevel.scale < 100">尺寸缩放到 {{ currentLevel.scale }}%</span>
					</div>
				</div>

				<div class="row">
					<span class="label">输出格式</span>
					<a-select v-model:value="form.format" style="width: 156px" :options="formatOptions" />

					<template v-if="isCustom">
						<a-radio-group v-model:value="form.mode">
							<a-radio-button value="quality">按质量</a-radio-button>
							<a-radio-button value="targetSize">按体积</a-radio-button>
							<a-radio-button value="scale">按比例</a-radio-button>
						</a-radio-group>

						<template v-if="form.mode === 'quality'">
							<span class="label">质量</span>
							<a-slider v-model:value="form.quality" :min="0.05" :max="1" :step="0.01" style="width: 130px" />
							<span class="hint">{{ Math.round(form.quality * 100) }}%</span>
						</template>

						<template v-else-if="form.mode === 'targetSize'">
							<span class="label">目标体积</span>
							<a-input-number v-model:value="form.targetKB" :min="5" :max="102400" :step="50" style="width: 110px" />
							<span class="hint">KB</span>
						</template>

						<template v-else>
							<span class="label">缩放比例</span>
							<a-slider v-model:value="form.scale" :min="5" :max="100" :step="5" style="width: 130px" />
							<span class="hint">{{ form.scale }}%</span>
						</template>
					</template>
				</div>

				<div class="row" v-if="!isCustom || form.mode !== 'scale'">
					<span class="label">限制最大边长</span>
					<a-input-number v-model:value="form.maxSize" :min="0" :max="10000" :step="100" style="width: 110px" />
					<span class="hint">0 = 不限制</span>
				</div>

				<div class="row gif-row" v-if="hasAnimatedGif">
					<span class="label">GIF 动图</span>
					<span class="hint">保留全部帧与帧延时，通过降低颜色数来压缩</span>
					<span class="label">颜色数</span>
					<a-select v-model:value="form.gifColors" :options="gifColorOptions" style="width: 130px" :disabled="!isCustom" />
					<span class="hint" v-if="!isCustom">当前强度：{{ gifPresetColors }} 色</span>
					<a-checkbox v-model:checked="form.dither">颜色抖动</a-checkbox>
				</div>

				<div class="hint warn" v-if="losslessHint">{{ losslessHint }}</div>
			</div>

			<a-space class="actions">
				<span v-if="busy" class="hint">{{ progress.done }} / {{ progress.total }}</span>
				<a-button :disabled="!items.length || busy" @click="clear">清空</a-button>
				<a-button type="primary" :loading="busy" :disabled="!items.length" @click="exportAll">
					压缩并导出{{ items.length ? `（${items.length}）` : '' }}
				</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import {
	IMAGE_FILTER,
	compressToTargetSize,
	convertImage,
	decodeImageBytes,
	dirname,
	formatBytes,
	getOutputFormat,
	joinPath,
	shrinkRate,
	stripExt,
	uniqueName,
} from '@/utils/image'
import { friendlyError, pickDirectory, saveBytesAs, writeBytes } from '@/utils/tauriIO'
import { useImageList } from '@/utils/useImageList'
import { decodeGif, probeGif } from '@/utils/gifDecode'
import { GifBuilder } from '@/utils/gif'

/** 五档压缩强度：前四档为预设，第五档为自定义 */
const LEVELS = [
	{ label: '轻度', quality: 0.9, scale: 100, desc: '画质几乎无损，体积小幅下降' },
	{ label: '普通', quality: 0.75, scale: 100, desc: '画质与体积平衡，日常推荐' },
	{ label: '强力', quality: 0.6, scale: 85, desc: '体积明显减小，画质有轻微损失' },
	{ label: '极强', quality: 0.45, scale: 65, desc: '体积最小，适合聊天分享 / 网页预览' },
	{ label: '自定义', quality: 0.75, scale: 100, desc: '自行指定质量、目标体积或缩放比例' },
]
const levelMarks = { 1: '轻度', 2: '普通', 3: '强力', 4: '极强', 5: '自定义' }

/** GIF 动图专用：按强度降低颜色数并缩放（不动帧，保留动画） */
const GIF_LEVELS = [
	{ colors: 256, scale: 100 },
	{ colors: 128, scale: 100 },
	{ colors: 96, scale: 85 },
	{ colors: 64, scale: 65 },
	{ colors: 128, scale: 100 },
]

const { items, loading, addSources, remove, clear } = useImageList()
const form = ref({
	levelIndex: 2,
	format: 'webp',
	mode: 'quality',
	quality: 0.75,
	targetKB: 300,
	scale: 70,
	maxSize: 0,
	gifColors: 128,
	dither: true,
})
const errors = ref([])
const busy = ref(false)
const progress = ref({ done: 0, total: 0 })

const formatOptions = [
	{ label: 'WEBP（推荐）', value: 'webp' },
	{ label: 'JPG', value: 'jpg' },
	{ label: 'PNG（无损）', value: 'png' },
	{ label: '保持原格式', value: 'keep' },
]
const gifColorOptions = [256, 128, 96, 64, 32].map(v => ({ label: `${v} 色`, value: v }))

const currentLevel = computed(() => LEVELS[form.value.levelIndex - 1] || LEVELS[1])
const isCustom = computed(() => form.value.levelIndex === 5)
const tipFormatter = value => LEVELS[value - 1]?.label || ''
/** 列表里是否存在 GIF 动图 */
const hasAnimatedGif = computed(() =>
	items.value.some(item => item.ext === 'gif' && (item.gif?.frameCount || 1) > 1)
)
const isAnimatedGif = item => item.ext === 'gif' && (item.gif?.frameCount || 1) > 1
const gifPresetColors = computed(() => (GIF_LEVELS[form.value.levelIndex - 1] || GIF_LEVELS[1]).colors)

const losslessHint = computed(() => {
	if (form.value.format === 'png') {
		return 'PNG 是无损格式，压缩强度中的“质量”不生效，仅缩放比例会减小体积；想要更小的体积请选择 WEBP 或 JPG。'
	}
	if (form.value.format === 'keep' && items.value.some(i => ['png', 'bmp', 'gif'].includes(i.ext))) {
		return '选择「保持原格式」时，PNG / BMP / GIF 属于无损格式，只会按缩放比例压缩体积。'
	}
	return ''
})

/** 决定某个文件实际使用的输出格式 */
const resolveFormat = item => {
	if (form.value.format !== 'keep') return getOutputFormat(form.value.format)
	const ext = item.ext === 'jpeg' ? 'jpg' : item.ext
	return getOutputFormat(ext) || getOutputFormat('png')
}

const handleFiles = async sources => {
	errors.value = await addSources(sources)
}

const rateText = item => {
	const rate = shrinkRate(item.size, item.out.bytes.length)
	return `${rate >= 0 ? '减小' : '增大'} ${Math.abs(rate).toFixed(1)}%`
}

/** 当前设置下该图片的缩放上限（0 表示不缩放） */
const maxSizeFor = item => {
	const longest = Math.max(item.width, item.height)
	if (!isCustom.value) {
		const { scale } = currentLevel.value
		const byScale = scale < 100 ? Math.max(1, Math.round((longest * scale) / 100)) : 0
		const limit = form.value.maxSize || 0
		if (byScale && limit) return Math.min(byScale, limit)
		return byScale || limit
	}
	if (form.value.mode === 'scale') return Math.max(1, Math.round((longest * form.value.scale) / 100))
	return form.value.maxSize || 0
}

/** 把一帧 RGBA 缩放到目标尺寸（借助 canvas 做高质量缩放） */
function scaleFrame(rgba, srcW, srcH, dstW, dstH, fromCanvas, toCanvas) {
	fromCanvas.width = srcW
	fromCanvas.height = srcH
	fromCanvas.getContext('2d').putImageData(new ImageData(rgba, srcW, srcH), 0, 0)
	toCanvas.width = dstW
	toCanvas.height = dstH
	const ctx = toCanvas.getContext('2d')
	ctx.imageSmoothingEnabled = true
	ctx.imageSmoothingQuality = 'high'
	ctx.drawImage(fromCanvas, 0, 0, dstW, dstH)
	return ctx.getImageData(0, 0, dstW, dstH).data
}

/**
 * GIF 动图压缩：保留全部帧与帧延时，降低颜色数（并按强度缩放），再重新编码
 * 这是动图唯一能真正减小体积的方式（转成别的格式会丢掉动画）
 */
async function compressAnimatedGif(item) {
	const preset = GIF_LEVELS[form.value.levelIndex - 1] || GIF_LEVELS[1]
	const scale = isCustom.value ? form.value.scale / 100 : preset.scale / 100
	const colors = isCustom.value ? form.value.gifColors : preset.colors
	const info = probeGif(item.bytes)
	const width = Math.max(8, Math.round(info.width * scale))
	const height = Math.max(8, Math.round(info.height * scale))
	const background = [255, 255, 255, 255]

	const builder = new GifBuilder({
		width,
		height,
		maxColors: colors,
		dither: form.value.dither,
		loop: info.loop,
		delay: 10,
	})

	// 第一遍：在整个动画范围内均匀采样，建立全局调色板
	const stride = Math.max(1, Math.floor((info.frameCount || 1) / 10))
	decodeGif(item.bytes, {
		frameStride: stride,
		background,
		onFrame: frame => builder.addSample(frame.data, 23),
	})
	builder.buildPalette()

	// 第二遍：逐帧缩放后映射为索引（不保留原始像素，内存占用可控）
	const needsScale = width !== info.width || height !== info.height
	const fromCanvas = needsScale ? document.createElement('canvas') : null
	const toCanvas = needsScale ? document.createElement('canvas') : null
	decodeGif(item.bytes, {
		background,
		onFrame: frame => {
			const rgba = needsScale
				? scaleFrame(frame.data, info.width, info.height, width, height, fromCanvas, toCanvas)
				: frame.data
			builder.addFrame(rgba, frame.delay)
		},
	})

	return { bytes: builder.build(), width, height, format: 'gif', frames: info.frameCount }
}

const compressOne = async item => {
	item.status = 'working'
	try {
		const fmt = resolveFormat(item)
		let out

		if (isAnimatedGif(item)) {
			out = await compressAnimatedGif(item)
		} else if (isCustom.value && form.value.mode === 'targetSize') {
			if (!fmt.lossy) throw new Error(`${fmt.value.toUpperCase()} 不支持按体积压缩，请改用 JPG / WEBP 或其它强度`)
			const { img, url } = await decodeImageBytes(item.bytes, item.mime)
			try {
				const result = await compressToTargetSize(img, form.value.targetKB * 1024, {
					format: fmt.value,
					maxSize: form.value.maxSize || 0,
				})
				out = { bytes: result.bytes, width: result.canvas.width, height: result.canvas.height, format: fmt.value }
			} finally {
				URL.revokeObjectURL(url)
			}
		} else {
			const quality = isCustom.value ? (form.value.mode === 'scale' ? 0.92 : form.value.quality) : currentLevel.value.quality
			out = await convertImage(item.bytes, {
				format: fmt.value,
				quality,
				maxSize: maxSizeFor(item),
				sourceMime: item.mime,
			})
		}

		if (item.out?.blobUrl) URL.revokeObjectURL(item.out.blobUrl)
		item.out = out
		item.status = 'done'
		return out
	} catch (err) {
		item.status = 'error'
		message.error(`${item.name}：${friendlyError(err)}`)
		return null
	}
}

const outputName = item => `${stripExt(item.name)}_compressed.${item.out?.format || resolveFormat(item).value}`

const saveOne = async item => {
	const out = item.out || (await compressOne(item))
	if (!out) return
	try {
		const path = await saveBytesAs(out.bytes, { defaultPath: outputName(item) })
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const exportAll = async () => {
	const firstPath = items.value.find(i => i.path)?.path
	const dir = await pickDirectory({ title: '选择输出文件夹', defaultPath: firstPath ? dirname(firstPath) : undefined })
	if (!dir) return

	busy.value = true
	progress.value = { done: 0, total: items.value.length }
	const used = new Set()
	let ok = 0
	let before = 0
	let after = 0
	try {
		for (const item of items.value) {
			const out = await compressOne(item)
			if (out) {
				try {
					const name = uniqueName(used, outputName(item))
					await writeBytes(joinPath(dir, name), out.bytes)
					ok += 1
					before += item.size
					after += out.bytes.length
				} catch (err) {
					message.error(`${item.name} 写入失败：${friendlyError(err)}`)
				}
			}
			progress.value.done += 1
		}
	} finally {
		busy.value = false
	}
	if (ok) {
		const rate = shrinkRate(before, after)
		message.success(`已导出 ${ok} 个文件到 ${dir}，总体积${rate >= 0 ? '减小' : '增大'} ${Math.abs(rate).toFixed(1)}%`)
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.imgCompress {
	.alert {
		margin-top: 12px;
	}
	.list {
		margin-top: 16px;
	}
	.result {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.tool-footer {
		align-items: flex-start;
		padding-top: 12px;
	}
	.options {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-flow: column;
		gap: 10px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.label {
		font-size: 13px;
		color: rgba(0, 0, 0, 0.65);
		white-space: nowrap;
	}
	// 滑块的刻度标签会占一行，留出空间避免和下一行挤压
	.strength-row {
		align-items: flex-start;
		padding-top: 4px;
		.label {
			line-height: 22px;
		}
		.strength-slider {
			flex: 1;
			min-width: 260px;
			max-width: 460px;
			margin: 0 8px;
		}
		.level-desc {
			display: flex;
			flex-flow: column;
			line-height: 20px;
			padding-top: 2px;
			min-width: 260px;
			.level-name {
				font-size: 13px;
				font-weight: 600;
				color: #1677ff;
			}
		}
	}
	.actions {
		margin-left: 16px;
		padding-top: 4px;
	}
	.warn {
		color: #d48806;
	}
}
</style>
