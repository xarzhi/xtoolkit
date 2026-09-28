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

				<a-table v-else class="list" :data-source="items" row-key="id" size="small" :pagination="false">
					<a-table-column title="预览" width="84">
						<template #default="{ record }">
							<img class="thumb" :src="record.url" :alt="record.name" />
						</template>
					</a-table-column>
					<a-table-column title="文件名" data-index="name" ellipsis />
					<a-table-column title="原格式" width="90">
						<template #default="{ record }">{{ (record.ext || '未知').toUpperCase() }}</template>
					</a-table-column>
					<a-table-column title="尺寸" width="118">
						<template #default="{ record }">{{ record.width }} × {{ record.height }}</template>
					</a-table-column>
					<a-table-column title="原大小" width="96">
						<template #default="{ record }">{{ formatBytes(record.size) }}</template>
					</a-table-column>
					<a-table-column title="转换结果" width="190">
						<template #default="{ record }">
							<div v-if="record.out" class="result">
								<span>{{ formatBytes(record.out.bytes.length) }}</span>
								<a-tag :color="record.out.bytes.length <= record.size ? 'green' : 'orange'">
									{{ rateText(record) }}
								</a-tag>
								<span class="hint">{{ record.out.width }} × {{ record.out.height }}</span>
							</div>
							<span v-else class="hint">待转换</span>
						</template>
					</a-table-column>
					<a-table-column title="操作" width="200">
						<template #default="{ record }">
							<a-button
								type="link"
								size="small"
								:loading="record.status === 'converting'"
								@click="convertOne(record)"
								>转换</a-button
							>
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
				<a-form-item label="质量" v-if="currentFormat.lossy">
					<a-slider v-model:value="form.quality" :min="0.1" :max="1" :step="0.01" style="width: 120px" />
					<span class="hint">{{ Math.round(form.quality * 100) }}%</span>
				</a-form-item>
				<a-form-item label="最大边长">
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
	</div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import {
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

const { items, loading, addSources, remove, clear } = useImageList()
const form = ref({ format: 'png', quality: 0.92, maxSize: 0, suffix: '' })
const errors = ref([])
const busy = ref(false)
const progress = ref({ done: 0, total: 0 })

const formatOptions = OUTPUT_FORMATS.map(i => ({ label: i.label, value: i.value }))
const currentFormat = computed(() => getOutputFormat(form.value.format))

const handleFiles = async sources => {
	errors.value = await addSources(sources)
}

const outputName = item => `${stripExt(item.name)}${form.value.suffix || ''}.${currentFormat.value.ext}`

const rateText = item => {
	const rate = shrinkRate(item.size, item.out.bytes.length)
	return `${rate >= 0 ? '减小' : '增大'} ${Math.abs(rate).toFixed(1)}%`
}

const convertOne = async item => {
	item.status = 'converting'
	try {
		const out = await convertImage(item.bytes, {
			format: form.value.format,
			quality: form.value.quality,
			maxSize: form.value.maxSize || 0,
			sourceMime: item.mime,
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
	const out = item.out || (await convertOne(item))
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
	const firstPath = items.value.find(i => i.path)?.path
	const dir = await pickDirectory({ title: '选择输出文件夹', defaultPath: firstPath ? dirname(firstPath) : undefined })
	if (!dir) return

	busy.value = true
	progress.value = { done: 0, total: items.value.length }
	const used = new Set()
	let ok = 0
	try {
		for (const item of items.value) {
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
	if (ok) message.success(`已导出 ${ok} 个文件到 ${dir}`)
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
	.result {
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
</style>
