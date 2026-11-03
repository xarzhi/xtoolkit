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

				<a-table v-else class="list" :data-source="items" row-key="id" size="small" :pagination="false" :scroll="{ x: 880 }">
					<a-table-column title="原图" width="92">
						<template #default="{ record }">
							<button type="button" class="thumb-btn" title="点击查看原图" @click="openPreview(record, 'origin')">
								<img class="thumb" :src="record.url" :alt="record.name" />
								<span class="thumb-mask">
									<ZoomInOutlined />
								</span>
							</button>
						</template>
					</a-table-column>
					<a-table-column title="文件名" data-index="name" ellipsis />
					<a-table-column title="尺寸" width="160">
						<template #default="{ record }">
							{{ record.width }} × {{ record.height }}
							<span v-if="record.out" class="hint">→ {{ record.out.width }} × {{ record.out.height }}</span>
							<a-tag v-if="record.ext === 'gif' && (record.gif?.frameCount || 1) > 1" color="blue">
								{{ record.gif.frameCount }} 帧
							</a-tag>
						</template>
					</a-table-column>
					<a-table-column title="原大小" width="90">
						<template #default="{ record }">{{ formatBytes(record.size) }}</template>
					</a-table-column>
					<a-table-column title="压缩后" width="284">
						<template #default="{ record }">
							<div v-if="record.out" class="out-cell">
								<button
									v-if="record.previewUrl"
									type="button"
									class="thumb-btn small"
									title="点击查看压缩后的图片"
									@click="openPreview(record, 'compressed')"
								>
									<img class="thumb" :src="record.previewUrl" :alt="record.name" />
									<span class="thumb-mask">
										<ZoomInOutlined />
									</span>
								</button>
								<div class="out-info">
									<div class="result">
										<span>{{ formatBytes(record.out.bytes.length) }}</span>
										<a-tag class="fmt" :bordered="false">{{ String(record.out.format || '').toUpperCase() }}</a-tag>
										<a-tooltip v-if="rateTitle(record)" :title="rateTitle(record)">
											<a-tag :color="record.out.keptOriginal ? 'blue' : record.out.bytes.length <= record.size ? 'green' : 'orange'">
												{{ rateText(record) }}
											</a-tag>
										</a-tooltip>
										<a-tag v-else :color="record.out.bytes.length <= record.size ? 'green' : 'orange'">
											{{ rateText(record) }}
										</a-tag>
									</div>
									<a class="zoom-link" @click="openPreview(record, 'compressed')">看效果</a>
								</div>
							</div>
							<span v-else class="hint">待压缩</span>
						</template>
					</a-table-column>
					<a-table-column title="操作" width="144">
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

		<!-- Viewer.js 的图源：不参与页面布局，只给全屏预览提供图片序列（滚轮缩放 / 拖动 / 旋转都由它接管） -->
		<div ref="viewerHostRef" class="viewer-host" aria-hidden="true">
			<img v-for="source in viewerSources" :key="source.key" :src="source.url" :alt="source.name" />
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

				<div class="hint warn" v-if="losslessHint">
					{{ losslessHint }}
					<a v-if="pngFromLossy" class="switch-link" @click="useWebp">改用 WEBP</a>
				</div>
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
import { ZoomInOutlined } from '@ant-design/icons-vue'
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
	quantizePng,
	shrinkRate,
	stripExt,
	uniqueName,
} from '@/utils/image'
import { friendlyError, pickDirectory, saveBytesAs, writeBytes } from '@/utils/tauriIO'
import { useImageList } from '@/utils/useImageList'
import { useImageViewer } from '@/utils/useImageViewer'
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
	format: 'png',
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
	{ label: 'PNG（无损）', value: 'png' },
	{ label: 'WEBP（推荐）', value: 'webp' },
	{ label: 'JPG', value: 'jpg' },
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

/** 选了 PNG，但图里混有 JPG / WEBP 等有损原图：转 PNG 体积必然暴涨 */
const pngFromLossy = computed(
	() =>
		form.value.format === 'png' &&
		items.value.some(item => ['jpg', 'jpeg', 'webp', 'avif'].includes(item.ext) && !isAnimatedGif(item))
)

const losslessHint = computed(() => {
	if (form.value.format === 'png') {
		return pngFromLossy.value
			? 'PNG 是无损格式：质量参数不生效，体积靠缩放与自动减色（仍是 PNG）降低。这批图原本是 JPG / WEBP，转成 PNG 后体积会明显变大，只想要小体积建议'
			: 'PNG 是无损格式：质量参数不生效，体积靠缩放与自动减色（仍是 PNG）降低。'
	}
	if (form.value.format === 'keep' && items.value.some(i => ['png', 'bmp', 'gif'].includes(i.ext))) {
		return '选择「保持原格式」时，PNG / BMP / GIF 属于无损格式，只会按缩放比例（必要时减色）压缩体积。'
	}
	return ''
})

const useWebp = () => {
	form.value.format = 'webp'
}

/** 决定某个文件实际使用的输出格式 */
const resolveFormat = item => {
	if (form.value.format !== 'keep') return getOutputFormat(form.value.format)
	const ext = item.ext === 'jpeg' ? 'jpg' : item.ext
	return getOutputFormat(ext) || getOutputFormat('png')
}

/** 原文件真实的格式值（用来判断能否直接输出原文件） */
const sourceFormat = item => (item.ext === 'jpeg' ? 'jpg' : item.ext || 'png')

const handleFiles = async sources => {
	errors.value = await addSources(sources)
}

const rateText = item => {
	if (item.out?.keptOriginal) return '已是最优'
	const rate = shrinkRate(item.size, item.out.bytes.length)
	return `${rate >= 0 ? '减小' : '增大'} ${Math.abs(rate).toFixed(1)}%`
}

/* ---------------- 预览：交给 Viewer.js 全屏看图 ---------------- */

const MIME_BY_FORMAT = {
	png: 'image/png',
	jpg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	bmp: 'image/bmp',
	avif: 'image/avif',
}

/** 为压缩结果生成一张可显示的预览 URL（原图那份在 useImageList 里已经建好） */
const refreshPreviewUrl = item => {
	if (item.previewUrl) {
		URL.revokeObjectURL(item.previewUrl)
		item.previewUrl = ''
	}
	const bytes = item.out?.bytes
	if (!bytes?.length) return
	const mime = MIME_BY_FORMAT[item.out.format] || 'application/octet-stream'
	item.previewUrl = URL.createObjectURL(new Blob([bytes], { type: mime }))
}

/** 当前浏览的是「原图」还是「压缩后」这一组 */
const viewerSide = ref('origin')

/** 点哪一列就浏览哪一组：原图序列 / 压缩后序列，组内可以直接上一张下一张 */
const viewerSources = computed(() => {
	if (viewerSide.value === 'compressed') {
		return items.value
			.filter(item => item.out && item.previewUrl)
			.map(item => ({ key: `${item.id}-out`, url: item.previewUrl, name: `${item.name}（压缩后）` }))
	}
	return items.value.map(item => ({ key: `${item.id}-src`, url: item.url, name: item.name }))
})

const { hostRef: viewerHostRef, open: openViewer, getViewer } = useImageViewer(() => viewerSources.value)

const openPreview = async (item, side = 'origin') => {
	const useCompressed = side === 'compressed' && !!item.out && !!item.previewUrl
	viewerSide.value = useCompressed ? 'compressed' : 'origin'
	// 先切组，再打开对应的那张（宿主里的图要等一次渲染才会更新）
	await openViewer(`${item.id}-${useCompressed ? 'out' : 'src'}`)
}


/** 结果标签的悬浮说明：解释"为什么是这个体积 / 这个格式" */
const rateTitle = item => {
	const out = item.out
	if (!out) return ''
	if (out.keptOriginal) return '原文件已是最优编码，直接输出原文件：体积与画质都不变'
	if (out.colors) return `PNG 已减色到 ${out.colors} 色，靠减少颜色数缩小体积，肉眼基本看不出差别`
	return ''
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
		// 压缩后反而更大时，自动改用体积更小的结果，保证"压缩"始终有意义
		out = await ensureSmaller(item, out)
		item.out = out
		refreshPreviewUrl(item)
		item.status = 'done'
		return out
	} catch (err) {
		item.status = 'error'
		message.error(`${item.name}：${friendlyError(err)}`)
		return null
	}
}

const outputName = item => `${stripExt(item.name)}_compressed.${item.out?.format || resolveFormat(item).value}`

/**
 * 保证压缩结果不比原图大，并且**严格保持用户选择的输出格式**（不再偷偷换成 WEBP）。
 * 依次尝试：
 * 1) 目标是无损 PNG → 减色重编码（256 / 128 / 64 色），仍然是 PNG
 * 2) 目标是有损格式 → 逐级降低质量，格式不变
 * 3) 体积实在降不下来：原图本身就是目标格式时直接输出原文件（体积与清晰度都不变）
 *    原图是别的格式时，仍按所选格式输出，宁可体积略增也不改变格式
 */
const ensureSmaller = async (item, out) => {
	if (!out?.bytes || out.bytes.length <= item.size) return out
	if (isAnimatedGif(item)) return out

	const fmt = resolveFormat(item)
	let best = null

	if (fmt.value === 'png') {
		// 减色收益不够明显时不值得丢颜色，宁可直接用原文件
		const threshold = Math.floor(item.size * 0.95)
		for (const colors of [256, 128, 64]) {
			try {
				const quantized = await quantizePng(item.bytes, {
					maxColors: colors,
					maxSize: maxSizeFor(item),
					sourceMime: item.mime,
				})
				if (quantized.bytes.length < threshold) {
					best = { ...quantized, format: 'png' }
					break
				}
			} catch {
				/* 量化失败就继续降级 */
			}
		}
	} else if (fmt.lossy) {
		for (const quality of [0.85, 0.7, 0.55, 0.4, 0.25]) {
			try {
				const retried = await convertImage(item.bytes, {
					format: fmt.value,
					quality,
					maxSize: maxSizeFor(item),
					sourceMime: item.mime,
				})
				if (retried.blobUrl) {
					URL.revokeObjectURL(retried.blobUrl)
					delete retried.blobUrl
				}
				if (retried.bytes.length < item.size) {
					best = retried
					break
				}
			} catch {
				/* 忽略，继续降级 */
			}
		}
	}

	if (best) {
		if (out.blobUrl) URL.revokeObjectURL(out.blobUrl)
		return best
	}

	// 只有原图格式与所选格式一致时，才能直接输出原文件而不改变格式
	if (sourceFormat(item) === fmt.value) {
		if (out.blobUrl) URL.revokeObjectURL(out.blobUrl)
		return {
			bytes: item.bytes,
			width: item.width,
			height: item.height,
			format: fmt.value,
			keptOriginal: true,
		}
	}

	return out
}

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

if (import.meta.env.DEV) {
	const T_previewState = () => {
		// 预览实例挂在组合式函数里，每次现取
		const viewer = getViewer()
		return {
			ready: !!viewer,
			active: !!viewer?.viewed,
			side: viewerSide.value,
			index: viewer?.index ?? -1,
			length: viewer?.length ?? 0,
			title: viewer?.title?.textContent || '',
			ratio: +(viewer?.imageData?.ratio ?? 0).toFixed(3),
			shownSrc: viewer?.image?.currentSrc || viewer?.image?.src || '',
			sources: viewerSources.value.map(source => source.name),
			domImages: viewerHostRef.value ? viewerHostRef.value.querySelectorAll('img').length : 0,
			flags: viewer
				? {
						hiding: !!viewer.hiding,
						showing: !!viewer.showing,
						isShown: !!viewer.isShown,
						viewed: !!viewer.viewed,
						ready: !!viewer.ready,
					}
				: null,
		}
	}
	window.__imgCompressTest = {
		addTestImages: async (count = 2) => {
			const files = []
			for (let i = 0; i < count; i += 1) {
				const canvas = document.createElement('canvas')
				canvas.width = 900 + i * 120
				canvas.height = 600 + i * 80
				const ctx = canvas.getContext('2d')
				const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
				gradient.addColorStop(0, i ? '#2563eb' : '#f97316')
				gradient.addColorStop(1, i ? '#a855f7' : '#facc15')
				ctx.fillStyle = gradient
				ctx.fillRect(0, 0, canvas.width, canvas.height)
				ctx.fillStyle = 'rgba(255,255,255,.9)'
				ctx.font = 'bold 72px sans-serif'
				ctx.fillText(`TEST ${i + 1}`, 64, 130)
				// 撒点噪点，避免纯色图压缩后体积小得不真实
				for (let n = 0; n < 5000; n += 1) {
					ctx.fillStyle = `rgba(${(Math.random() * 255) | 0},${(Math.random() * 255) | 0},${(Math.random() * 255) | 0},.55)`
					ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 3, 3)
				}
				const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
				files.push(new File([blob], `test-${i + 1}.png`, { type: 'image/png' }))
			}
			const errs = await addSources(files)
			return { errs, count: items.value.length }
		},
		setForm: patch => Object.assign(form.value, patch),
		compressAll: async () => {
			const out = []
			for (const item of items.value) {
				const result = await compressOne(item)
				out.push({
					name: item.name,
					hasOut: !!item.out,
					hasPreviewUrl: !!item.previewUrl,
					outBytes: result?.bytes?.length || 0,
					format: item.out?.format || '',
				})
			}
			return out
		},
		state: () => ({
			count: items.value.length,
			items: items.value.map(item => ({
				name: item.name,
				status: item.status,
				size: item.size,
				hasOut: !!item.out,
				outBytes: item.out?.bytes?.length || 0,
				hasPreviewUrl: !!item.previewUrl,
			})),
		}),
		open: async (index, side) => {
			const item = items.value[index]
			if (item) await openPreview(item, side)
			return T_previewState()
		},
		removeAt: index => {
			const item = items.value[index]
			if (item) remove(item.id)
			return { count: items.value.length, viewerActive: !!getViewer()?.viewed }
		},
		/** Viewer.js 的运行状态 */
		viewerState: () => T_previewState(),
		/** 直接操控 Viewer：缩放 / 旋转 / 上一张下一张 / 关闭 */
		viewer: {
			zoomin: () => (getViewer()?.zoom(0.15), T_previewState()),
			zoomout: () => (getViewer()?.zoom(-0.15), T_previewState()),
			to: ratio => (getViewer()?.zoomTo(ratio), T_previewState()),
			rotate: degree => (getViewer()?.rotate(degree), T_previewState()),
			next: () => (getViewer()?.next(), T_previewState()),
			prev: () => (getViewer()?.prev(), T_previewState()),
			close: () => (getViewer()?.hide(), T_previewState()),
			dom: () => ({
				container: !!document.querySelector('.viewer-container'),
				buttons: [...(getViewer()?.toolbar?.querySelectorAll('li') || [])].map(li => li.className.replace(/^viewer-/, '')),
				shown: getComputedStyle(document.querySelector('.viewer-container') || document.body).visibility,
			}),
		},
		previewState: () => T_previewState(),
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
	/* 缩略图按钮：默认显示图片，鼠标移上去浮出放大镜 */
	.thumb-btn {
		position: relative;
		display: inline-flex;
		flex: none;
		padding: 0;
		border: none;
		background: none;
		border-radius: 6px;
		overflow: hidden;
		cursor: zoom-in;
		line-height: 0;
		.thumb {
			transition: transform 0.16s;
		}
		.thumb-mask {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 16px;
			color: #fff;
			background: rgba(0, 0, 0, 0.42);
			opacity: 0;
			transition: opacity 0.16s;
		}
		&:hover {
			.thumb-mask {
				opacity: 1;
			}
			.thumb {
				transform: scale(1.06);
			}
		}
		&.small .thumb {
			width: 44px;
			height: 44px;
		}
	}
	.out-cell {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.out-info {
		display: flex;
		flex-flow: column;
		gap: 1px;
		min-width: 0;
	}
	.zoom-link {
		font-size: 11px;
		line-height: 16px;
		color: #1677ff;
		cursor: pointer;
		align-self: flex-start;
		&:hover {
			text-decoration: underline;
		}
	}
	.result {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		.fmt {
			margin: 0;
			padding: 0 5px;
			font-size: 11px;
			line-height: 16px;
			color: var(--text-color-3);
			background: rgba(127, 127, 127, 0.12);
		}
		:deep(.ant-tag) {
			margin: 0;
		}
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
		color: var(--text-color-3);
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
			/* 独占一行：滑块的刻度文字（最右侧“自定义”）会和它挤在一起 */
			flex: 1 1 100%;
			padding-left: 4px;
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
		.switch-link {
			margin-left: 4px;
			color: #1677ff;
			cursor: pointer;
			text-decoration: underline;
		}
	}
}

/* Viewer.js 的图源容器：留在文档里好让库能读到这一组图片，但不参与布局、也看不见 */
.viewer-host {
	position: fixed;
	top: 0;
	left: -10000px;
	width: 1px;
	height: 1px;
	overflow: hidden;
	opacity: 0;
	pointer-events: none;
}
</style>

