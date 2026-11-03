<template>
	<div class="tool imgTransform">
		<h1 class="tool-title">
			图片格式转换
			<span class="tip">PNG / JPG / WEBP / BMP / ICO，支持批量转换</span>
		</h1>

		<div class="tool-content">
			<Selector
				title="点击选择图片，或把图片拖到这里"
				desc="支持多选，一次可以处理多张图片"
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

				<a-table
					v-else
					class="list"
					:data-source="items"
					row-key="id"
					size="small"
					:pagination="false"
					:scroll="{ x: 1000 }"
				>
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
					<a-table-column title="原格式" width="90">
						<template #default="{ record }">{{ (record.ext || '未知').toUpperCase() }}</template>
					</a-table-column>
					<a-table-column title="尺寸" width="140">
						<template #default="{ record }">
							<span>{{ record.width }} × {{ record.height }}</span>
							<a-tag v-if="icoBlocked(record)" color="red" class="tag-inline">非正方形</a-tag>
						</template>
					</a-table-column>
					<a-table-column title="原大小" width="96">
						<template #default="{ record }">{{ formatBytes(record.size) }}</template>
					</a-table-column>
					<a-table-column title="转换结果" width="260">
						<template #default="{ record }">
							<div v-if="icoBlocked(record)" class="result">
								<a-tag color="red">不能转 ICO</a-tag>
								<span class="hint">需要正方形图片</span>
							</div>
							<div v-else-if="record.out" class="out-cell">
								<button
									v-if="record.out.blobUrl"
									type="button"
									class="thumb-btn small"
									title="点击查看转换后的图片"
									@click="openPreview(record, 'converted')"
								>
									<img class="thumb" :src="record.out.blobUrl" :alt="record.name" />
									<span class="thumb-mask">
										<ZoomInOutlined />
									</span>
								</button>
								<div class="result">
									<span>{{ formatBytes(record.out.bytes.length) }}</span>
									<a-tag :color="record.out.bytes.length <= record.size ? 'green' : 'orange'">
										{{ rateText(record) }}
									</a-tag>
									<span class="hint">{{ record.out.width }} × {{ record.out.height }}</span>
								</div>
							</div>
							<span v-else class="hint">待转换</span>
						</template>
					</a-table-column>
					<a-table-column title="操作" width="200">
						<template #default="{ record }">
							<a-tooltip :title="icoBlocked(record) ? `ICO 只支持正方形图片，这张是 ${record.width} × ${record.height}` : ''">
								<a-button
									type="link"
									size="small"
									:disabled="icoBlocked(record)"
									:loading="record.status === 'converting'"
									@click="convertOne(record)"
									>转换</a-button
								>
							</a-tooltip>
							<a-button type="link" size="small" :disabled="!record.out" @click="saveOne(record)">保存</a-button>
							<a-button type="link" size="small" danger @click="remove(record.id)">移除</a-button>
						</template>
					</a-table-column>
				</a-table>
			</a-spin>
		</div>

		<div class="tool-footer">
			<a-form layout="inline" :model="form" class="options">
				<a-form-item label="目标格式">
					<a-select v-model:value="form.format" style="width: 190px" :options="formatOptions" />
				</a-form-item>
				<a-form-item v-if="isIco" label="ICO 尺寸">
					<a-select
						v-model:value="form.icoSizes"
						mode="multiple"
						style="width: 250px"
						:options="icoSizeOptions"
						:max-tag-count="3"
						placeholder="选择尺寸"
					/>
				</a-form-item>
				<a-form-item label="质量" v-if="currentFormat.lossy">
					<a-slider v-model:value="form.quality" :min="0.1" :max="1" :step="0.01" style="width: 120px" />
					<span class="hint">{{ Math.round(form.quality * 100) }}%</span>
				</a-form-item>
				<a-form-item label="最大边长" v-if="!isIco">
					<a-input-number v-model:value="form.maxSize" :min="0" :max="10000" :step="100" style="width: 110px" />
					<span class="hint" style="margin-left: 6px">0 = 原始</span>
				</a-form-item>
				<a-form-item label="文件名后缀">
					<a-input v-model:value="form.suffix" placeholder="可留空" style="width: 100px" />
				</a-form-item>
			</a-form>
			<a-space>
				<span v-if="busy" class="hint">{{ progress.done }} / {{ progress.total }}</span>
				<a-button :disabled="!items.length || busy" @click="clear">清空</a-button>
				<a-button type="primary" :loading="busy" :disabled="!items.length" @click="exportAll">
					转换并导出{{ items.length ? `（${items.length}）` : '' }}
				</a-button>
			</a-space>
		</div>

		<!-- Viewer.js 的图源：不参与页面布局，只给全屏预览提供图片序列 -->
		<div ref="viewerHostRef" class="viewer-host" aria-hidden="true">
			<img v-for="source in viewerSources" :key="source.key" :src="source.url" :alt="source.name" />
		</div>
	</div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import { ZoomInOutlined } from '@ant-design/icons-vue'
import Selector from '@/components/Selector.vue'
import {
	ICO_SIZES,
	IMAGE_FILTER,
	OUTPUT_FORMATS,
	convertImage,
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
import { useImageViewer } from '@/utils/useImageViewer'

const { items, loading, addSources, remove, clear } = useImageList()
const form = ref({ format: 'png', quality: 0.92, maxSize: 0, suffix: '', icoSizes: [16, 32, 48, 256] })
const errors = ref([])
const busy = ref(false)
const progress = ref({ done: 0, total: 0 })

const formatOptions = OUTPUT_FORMATS.map(i => ({ label: i.label, value: i.value }))
const icoSizeOptions = ICO_SIZES.map(size => ({ label: `${size} × ${size}`, value: size }))
const currentFormat = computed(() => getOutputFormat(form.value.format))
const isIco = computed(() => form.value.format === 'ico')

/** ICO 的每个尺寸都是正方形画布，非正方形源图没法忠实转换 */
const isSquare = item => item.width === item.height
const icoBlocked = item => isIco.value && !isSquare(item)

const handleFiles = async sources => {
	errors.value = await addSources(sources)
}

const outputName = item => `${stripExt(item.name)}${form.value.suffix || ''}.${currentFormat.value.ext}`

const rateText = item => {
	const rate = shrinkRate(item.size, item.out.bytes.length)
	return `${rate >= 0 ? '减小' : '增大'} ${Math.abs(rate).toFixed(1)}%`
}

/* ---------------- 全屏预览（Viewer.js） ---------------- */
const viewerSide = ref('origin')

const viewerSources = computed(() => {
	if (viewerSide.value === 'converted') {
		return items.value
			.filter(item => item.out?.blobUrl)
			.map(item => ({
				key: `${item.id}-out`,
				url: item.out.blobUrl,
				name: `${stripExt(item.name)}.${(item.out.format || currentFormat.value.ext).toUpperCase()}`,
			}))
	}
	return items.value.map(item => ({ key: `${item.id}-src`, url: item.url, name: item.name }))
})

const { hostRef: viewerHostRef, open: openViewer, getViewer } = useImageViewer(() => viewerSources.value)

const openPreview = async (item, side = 'origin') => {
	const useConverted = side === 'converted' && !!item.out?.blobUrl
	viewerSide.value = useConverted ? 'converted' : 'origin'
	await openViewer(`${item.id}-${useConverted ? 'out' : 'src'}`)
}

/* ---------------- 转换 ---------------- */
const convertOne = async item => {
	if (icoBlocked(item)) {
		message.warning(`${item.name}：ICO 只支持正方形图片，这张是 ${item.width} × ${item.height}`)
		return null
	}
	if (isIco.value && !form.value.icoSizes?.length) {
		message.warning('请先选择至少一个 ICO 尺寸')
		return null
	}
	item.status = 'converting'
	try {
		const out = await convertImage(item.bytes, {
			format: form.value.format,
			quality: form.value.quality,
			maxSize: form.value.maxSize || 0,
			sourceMime: item.mime,
			icoSizes: isIco.value ? form.value.icoSizes : null,
		})
		if (item.out?.blobUrl) URL.revokeObjectURL(item.out.blobUrl)
		item.out = {
			bytes: out.bytes,
			blobUrl: out.blobUrl,
			width: out.width,
			height: out.height,
			format: out.format,
		}
		item.status = 'done'
		return out
	} catch (err) {
		item.status = 'error'
		message.error(`${item.name}：${friendlyError(err)}`)
		return null
	}
}

const saveOne = async item => {
	// 目标格式改过之后旧结果是别的格式，得按当前设置重新转一遍
	const fresh = item.out && item.out.format === form.value.format
	const out = fresh ? item.out : await convertOne(item)
	if (!out) return
	try {
		const path = await saveBytesAs(out.bytes, {
			defaultPath: outputName(item),
			filters: [{ name: currentFormat.value.label, extensions: [currentFormat.value.ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const exportAll = async () => {
	if (isIco.value && !form.value.icoSizes?.length) {
		message.warning('请先选择至少一个 ICO 尺寸')
		return
	}
	if (isIco.value && items.value.every(icoBlocked)) {
		message.warning('当前没有可转 ICO 的正方形图片')
		return
	}
	const firstPath = items.value.find(i => i.path)?.path
	const dir = await pickDirectory({ title: '选择输出文件夹', defaultPath: firstPath ? dirname(firstPath) : undefined })
	if (!dir) return

	busy.value = true
	progress.value = { done: 0, total: items.value.length }
	const used = new Set()
	let ok = 0
	let skipped = 0
	try {
		for (const item of items.value) {
			if (icoBlocked(item)) {
				skipped += 1
				progress.value.done += 1
				continue
			}
			const out = await convertOne(item)
			if (out) {
				try {
					const name = uniqueName(used, outputName(item))
					await writeBytes(joinPath(dir, name), out.bytes)
					ok += 1
				} catch (err) {
					message.error(`${item.name} 写入失败：${friendlyError(err)}`)
				}
			}
			progress.value.done += 1
		}
	} finally {
		busy.value = false
	}
	if (skipped) message.warning(`已跳过 ${skipped} 张非正方形图片（ICO 只支持正方形）`)
	if (ok) message.success(`已导出 ${ok} 个文件到 ${dir}`)
}

if (import.meta.env.DEV) {
	const T_previewState = () => {
		const viewer = getViewer()
		return {
			ready: !!viewer,
			active: !!viewer?.viewed,
			side: viewerSide.value,
			index: viewer?.index ?? -1,
			length: viewer?.length ?? 0,
			title: viewer?.title?.textContent || '',
			ratio: +(viewer?.imageData?.ratio ?? 0).toFixed(3),
			sources: viewerSources.value.map(source => source.name),
		}
	}
	window.__imgTransformTest = {
		/** 造测试图：square=true 出正方形，false 出长方形 */
		addTestImages: async (count = 2, { square = true, size = 512 } = {}) => {
			const files = []
			for (let i = 0; i < count; i += 1) {
				const canvas = document.createElement('canvas')
				canvas.width = size + i * 40
				canvas.height = square ? size + i * 40 : Math.round((size + i * 40) * 0.625)
				const ctx = canvas.getContext('2d')
				const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
				gradient.addColorStop(0, i ? '#2563eb' : '#f97316')
				gradient.addColorStop(1, i ? '#a855f7' : '#facc15')
				ctx.fillStyle = gradient
				ctx.fillRect(0, 0, canvas.width, canvas.height)
				ctx.fillStyle = 'rgba(255,255,255,.9)'
				ctx.font = 'bold 64px sans-serif'
				ctx.fillText(`TEST ${i + 1}`, 40, 110)
				for (let n = 0; n < 3000; n += 1) {
					ctx.fillStyle = `rgba(${(Math.random() * 255) | 0},${(Math.random() * 255) | 0},${(Math.random() * 255) | 0},.5)`
					ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 3, 3)
				}
				const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
				files.push(new File([blob], `test-${i + 1}.png`, { type: 'image/png' }))
			}
			const errs = await addSources(files)
			return { errs, count: items.value.length }
		},
		setForm: patch => Object.assign(form.value, patch),
		state: () => ({
			format: form.value.format,
			isIco: isIco.value,
			icoSizes: [...(form.value.icoSizes || [])],
			items: items.value.map(item => ({
				name: item.name,
				width: item.width,
				height: item.height,
				size: item.size,
				square: isSquare(item),
				blocked: icoBlocked(item),
				hasOut: !!item.out,
				outBytes: item.out?.bytes?.length || 0,
				outW: item.out?.width || 0,
				outH: item.out?.height || 0,
				hasBlobUrl: !!item.out?.blobUrl,
				status: item.status,
			})),
		}),
		convertAt: async index => {
			const item = items.value[index]
			if (!item) return null
			const out = await convertOne(item)
			// ICO 就把目录里的尺寸读出来，方便验证
			let entries = null
			if (out?.format === 'ico') {
				const bytes = out.bytes
				const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
				const count = dv.getUint16(4, true)
				entries = []
				for (let i = 0; i < count; i += 1) {
					const p = 6 + i * 16
					entries.push({ w: bytes[p] || 256, h: bytes[p + 1] || 256, bytes: dv.getUint32(p + 8, true) })
				}
			}
			return {
				ok: !!out,
				bytes: out?.bytes?.length || 0,
				width: out?.width || 0,
				height: out?.height || 0,
				format: out?.format || '',
				entries,
			}
		},
		convertAll: async () => {
			const out = []
			for (let i = 0; i < items.value.length; i += 1) out.push(await window.__imgTransformTest.convertAt(i))
			return out
		},
		open: async (index, side) => {
			const item = items.value[index]
			if (item) await openPreview(item, side)
			return T_previewState()
		},
		previewState: () => T_previewState(),
		viewer: {
			next: () => (getViewer()?.next(), T_previewState()),
			prev: () => (getViewer()?.prev(), T_previewState()),
			close: () => (getViewer()?.hide(), T_previewState()),
			dom: () => ({
				container: !!document.querySelector('.viewer-container'),
				buttons: [...(getViewer()?.toolbar?.querySelectorAll('li') || [])].map(li => li.className.replace(/^viewer-/, '')),
			}),
		},
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.imgTransform {
	.alert {
		margin-top: 12px;
	}
	.list {
		margin-top: 16px;
	}
	.tag-inline {
		margin-left: 6px;
		padding: 0 4px;
		font-size: 11px;
		line-height: 16px;
	}
	.result {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
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
	.options {
		flex: 1;
		row-gap: 4px;
		:deep(.ant-form-item) {
			margin-bottom: 4px;
		}
	}
}

/* Viewer.js 的图源容器：留在文档里让库能读到图片，但不参与布局、也看不见 */
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
