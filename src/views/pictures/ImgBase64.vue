<template>
	<div class="tool imgBase64">
		<h1 class="tool-title">
			图片与 Base64 互转
			<span class="tip">本地转换，不上传任何数据</span>
		</h1>

		<a-tabs v-model:activeKey="activeTab" class="tabs">
			<!-- 图片 -> Base64 -->
			<a-tab-pane key="toBase64" tab="图片 → Base64">
				<div class="pane">
					<div class="pane-content">
						<Selector
							title="点击选择图片，或把图片拖到这里"
							desc="支持多选；编码前可先压缩体积"
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

						<div class="tool-card options-card">
							<a-form layout="inline" :model="form" class="options">
								<a-form-item label="输出类型">
									<a-select v-model:value="form.mode" style="width: 190px" :options="modeOptions" />
								</a-form-item>
								<a-form-item label="每行字符数">
									<a-select v-model:value="form.wrap" style="width: 140px" :options="wrapOptions" />
								</a-form-item>
								<a-form-item label="编码前转换">
									<a-select v-model:value="form.format" style="width: 150px" :options="encodeFormats" />
								</a-form-item>
								<a-form-item label="质量" v-if="currentFormat.lossy">
									<a-slider v-model:value="form.quality" :min="0.1" :max="1" :step="0.01" style="width: 110px" />
									<span class="hint">{{ Math.round(form.quality * 100) }}%</span>
								</a-form-item>
								<a-form-item label="最大边长">
									<a-input-number v-model:value="form.maxSize" :min="0" :max="10000" :step="100" style="width: 110px" />
									<span class="hint" style="margin-left: 6px">0 = 原始</span>
								</a-form-item>
							</a-form>
						</div>

						<a-spin :spinning="loading">
							<a-empty v-if="!items.length && !loading" description="还没有选择图片" style="margin-top: 30px" />

							<a-table v-else class="list" :data-source="items" row-key="id" size="small" :pagination="false">
								<a-table-column title="预览" width="80">
									<template #default="{ record }">
										<img class="thumb" :src="record.url" :alt="record.name" />
									</template>
								</a-table-column>
								<a-table-column title="文件名" data-index="name" ellipsis />
								<a-table-column title="原大小" width="96">
									<template #default="{ record }">{{ formatBytes(record.size) }}</template>
								</a-table-column>
								<a-table-column title="Base64 体积" width="150">
									<template #default="{ record }">
										<span v-if="record.b64">
											{{ formatBytes(record.b64.size) }}
											<span class="hint">({{ record.b64.chars.toLocaleString() }} 字符)</span>
										</span>
										<span v-else class="hint">点击按钮后计算</span>
									</template>
								</a-table-column>
								<a-table-column title="操作" width="290">
									<template #default="{ record }">
										<a-button type="link" size="small" @click="generateItem(record)">生成</a-button>
										<a-button type="link" size="small" @click="copyItem(record)">复制</a-button>
										<a-button type="link" size="small" @click="saveItem(record)">存为 TXT</a-button>
										<a-button type="link" size="small" danger @click="remove(record.id)">移除</a-button>
									</template>
								</a-table-column>
							</a-table>
						</a-spin>

						<div class="output-card tool-card" v-if="generated">
							<div class="output-head">
								<span class="output-title">Base64 输出 · {{ generated.name }}</span>
								<span class="hint">
									{{ generated.chars.toLocaleString() }} 字符 · 编码后 {{ formatBytes(generated.size) }}
								</span>
								<a-space :size="8">
									<a-button size="small" @click="copyGenerated">复制</a-button>
									<a-button size="small" @click="saveGenerated">存为 TXT</a-button>
									<a-button size="small" type="text" @click="generated = null">收起</a-button>
								</a-space>
							</div>
							<a-textarea :value="generated.text" readonly :rows="8" class="output-text" />
						</div>
					</div>

					<div class="tool-footer">
						<span class="hint">大图转 Base64 后体积约为原图的 1.33 倍，建议先压缩再编码</span>
						<a-space>
							<a-button :disabled="!items.length || busy" @click="clear">清空</a-button>
							<a-button :disabled="!items.length || busy" :loading="busy" @click="exportAllFiles">导出全部为 TXT</a-button>
							<a-button type="primary" :disabled="!items.length || busy" :loading="busy" @click="exportJson">
								导出为 JSON
							</a-button>
						</a-space>
					</div>
				</div>
			</a-tab-pane>

			<!-- Base64 -> 图片 -->
			<a-tab-pane key="toImage" tab="Base64 → 图片">
				<div class="pane">
					<div class="pane-content decode">
						<div class="decode-input">
							<a-textarea
								v-model:value="rawText"
								:rows="12"
								placeholder="粘贴 Base64 或 Data URI，例如：data:image/png;base64,iVBORw0KGgo..."
								allow-clear
							/>
							<div class="decode-actions">
								<a-button size="small" @click="pasteFromClipboard">从剪贴板粘贴</a-button>
								<a-button size="small" @click="rawText = ''; parseError = ''">清空</a-button>
							</div>
							<a-alert v-if="parseError" type="error" show-icon :message="parseError" class="alert" />
						</div>

						<div class="decode-result">
							<a-empty v-if="!parsed" description="等待解析" />
							<template v-else>
								<div class="preview">
									<img :src="parsed.url" alt="preview" />
								</div>
								<a-descriptions :column="1" size="small" bordered class="desc">
									<a-descriptions-item label="类型">{{ parsed.mime || '未知' }}</a-descriptions-item>
									<a-descriptions-item label="尺寸">{{ parsed.width }} × {{ parsed.height }}</a-descriptions-item>
									<a-descriptions-item label="数据大小">{{ formatBytes(parsed.bytes.length) }}</a-descriptions-item>
									<a-descriptions-item label="来源格式">
										{{ parsed.isDataUrl ? 'Data URI' : '纯 Base64' }}
										<a-tag v-if="parsed.mime.startsWith('image/')" color="green" style="margin-left: 6px">识别为图片</a-tag>
										<a-tag v-else color="orange" style="margin-left: 6px">非图片类型</a-tag>
									</a-descriptions-item>
								</a-descriptions>
							</template>
						</div>
					</div>

					<div class="tool-footer">
						<a-form layout="inline" :model="decodeForm">
							<a-form-item label="保存格式">
								<a-select v-model:value="decodeForm.format" style="width: 180px" :options="decodeFormats" />
							</a-form-item>
						</a-form>
						<a-space>
							<a-button :disabled="!parsed" @click="copyParsed">复制原 Base64</a-button>
							<a-button type="primary" :disabled="!parsed" :loading="busy" @click="saveParsed">保存为图片</a-button>
						</a-space>
					</div>
				</div>
			</a-tab-pane>
		</a-tabs>
	</div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import Selector from '@/components/Selector.vue'
import {
	IMAGE_FILTER,
	OUTPUT_FORMATS,
	bytesToBase64,
	convertImage,
	decodeImageBytes,
	formatBase64Output,
	formatBytes,
	getOutputFormat,
	joinPath,
	parseBase64Input,
	stripExt,
	uniqueName,
} from '@/utils/image'
import { copyText, friendlyError, pickDirectory, saveBytesAs, saveTextAs, writeText } from '@/utils/tauriIO'
import { useImageList } from '@/utils/useImageList'

const activeTab = ref('toBase64')
const { items, loading, addSources, remove, clear } = useImageList()
const errors = ref([])
const busy = ref(false)
/** 下方展示的 Base64 结果 */
const generated = ref(null)

const form = ref({
	mode: 'dataurl',
	wrap: 0,
	format: 'keep',
	quality: 0.85,
	maxSize: 0,
})
const modeOptions = [
	{ label: 'Data URI（可直接用）', value: 'dataurl' },
	{ label: '纯 Base64', value: 'raw' },
	{ label: 'CSS 背景图', value: 'css' },
	{ label: 'HTML img 标签', value: 'html' },
	{ label: 'JS 变量', value: 'js' },
	{ label: 'JSON 对象', value: 'json' },
	{ label: 'Markdown 图片', value: 'markdown' },
]
const wrapOptions = [
	{ label: '不换行', value: 0 },
	{ label: '每行 76 字符', value: 76 },
	{ label: '每行 100 字符', value: 100 },
]
const encodeFormats = [
	{ label: '保持原格式', value: 'keep' },
	...OUTPUT_FORMATS.filter(i => i.value !== 'ico').map(i => ({ label: i.label, value: i.value })),
]
const currentFormat = computed(() => getOutputFormat(form.value.format === 'keep' ? 'png' : form.value.format))

const handleFiles = async sources => {
	errors.value = await addSources(sources)
}

/** 按当前设置把一张图片编码为文本 */
const encodeItem = async item => {
	const opts = form.value
	let bytes = item.bytes
	let mime = item.mime
	let format = item.ext
	if (opts.format !== 'keep') {
		const out = await convertImage(item.bytes, {
			format: opts.format,
			quality: opts.quality,
			maxSize: opts.maxSize || 0,
			sourceMime: item.mime,
		})
		bytes = out.bytes
		mime = out.mime
		format = out.format
	}
	const base64 = bytesToBase64(bytes)
	const text = formatBase64Output(base64, mime, opts.mode, opts.wrap)
	item.b64 = { base64, text, mime, format, size: bytes.length, chars: text.length }
	return item.b64
}

const copyItem = async item => {
	try {
		const b64 = await encodeItem(item)
		showGenerated(item, b64)
		const ok = await copyText(b64.text)
		message[ok ? 'success' : 'error'](ok ? `${item.name} 已复制到剪贴板` : '复制失败，请手动复制')
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const saveItem = async item => {
	try {
		const b64 = await encodeItem(item)
		showGenerated(item, b64)
		const path = await saveTextAs(b64.text, { defaultPath: `${stripExt(item.name)}.base64.txt` })
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

/** 编码并在下方展示 Base64 代码 */
const showGenerated = (item, b64) => {
	generated.value = { name: item.name, text: b64.text, chars: b64.chars, size: b64.size }
}

const generateItem = async item => {
	try {
		const b64 = await encodeItem(item)
		showGenerated(item, b64)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const copyGenerated = async () => {
	if (!generated.value) return
	const ok = await copyText(generated.value.text)
	message[ok ? 'success' : 'error'](ok ? '已复制到剪贴板' : '复制失败')
}

const saveGenerated = async () => {
	if (!generated.value) return
	try {
		const path = await saveTextAs(generated.value.text, {
			defaultPath: `${stripExt(generated.value.name)}.base64.txt`,
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const exportAllFiles = async () => {
	const dir = await pickDirectory({ title: '选择导出文件夹' })
	if (!dir) return
	busy.value = true
	const used = new Set()
	let ok = 0
	try {
		for (const item of items.value) {
			try {
				const b64 = await encodeItem(item)
				const name = uniqueName(used, `${stripExt(item.name)}.base64.txt`)
				await writeText(joinPath(dir, name), b64.text)
				ok += 1
			} catch (err) {
				message.error(`${item.name} 导出失败：${friendlyError(err)}`)
			}
		}
	} finally {
		busy.value = false
	}
	if (ok) message.success(`已导出 ${ok} 个文件到 ${dir}`)
}

const exportJson = async () => {
	busy.value = true
	try {
		const list = []
		for (const item of items.value) {
			const b64 = await encodeItem(item)
			list.push({
				name: item.name,
				width: item.width,
				height: item.height,
				mime: b64.mime,
				originSize: item.size,
				encodedSize: b64.size,
				base64: b64.base64,
				dataUrl: `data:${b64.mime};base64,${b64.base64}`,
			})
		}
		const text = JSON.stringify({ count: list.length, generatedAt: new Date().toISOString(), images: list }, null, 2)
		const path = await saveTextAs(text, { defaultPath: 'images-base64.json' })
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		busy.value = false
	}
}

/* ---------------- Base64 -> 图片 ---------------- */

const rawText = ref('')
const parsed = ref(null)
const parseError = ref('')
const decodeForm = ref({ format: 'keep' })
const decodeFormats = [
	{ label: '原始格式', value: 'keep' },
	...OUTPUT_FORMATS.filter(i => i.value !== 'ico').map(i => ({ label: i.label, value: i.value })),
]

let parseTimer = null
const parseText = async () => {
	if (parsed.value?.url) URL.revokeObjectURL(parsed.value.url)
	parsed.value = null
	parseError.value = ''
	const text = rawText.value.trim()
	if (!text) return
	try {
		const result = parseBase64Input(text)
		const decoded = await decodeImageBytes(result.bytes, result.mime)
		parsed.value = { ...result, width: decoded.width, height: decoded.height, url: decoded.url }
	} catch (err) {
		parseError.value = friendlyError(err)
	}
}

watch(rawText, () => {
	if (parseTimer) clearTimeout(parseTimer)
	parseTimer = setTimeout(parseText, 350)
})

const pasteFromClipboard = async () => {
	try {
		const text = await navigator.clipboard.readText()
		if (!text) {
			message.warning('剪贴板中没有文本内容')
			return
		}
		rawText.value = text
	} catch {
		message.error('无法读取剪贴板，请手动粘贴（Ctrl + V）')
	}
}

const copyParsed = async () => {
	if (!parsed.value) return
	const ok = await copyText(parsed.value.base64)
	message[ok ? 'success' : 'error'](ok ? '已复制 Base64 数据' : '复制失败')
}

const saveParsed = async () => {
	if (!parsed.value) return
	busy.value = true
	try {
		let bytes = parsed.value.bytes
		let ext = parsed.value.ext
		if (decodeForm.value.format !== 'keep') {
			const out = await convertImage(parsed.value.bytes, {
				format: decodeForm.value.format,
				quality: 0.95,
				sourceMime: parsed.value.mime,
			})
			bytes = out.bytes
			ext = out.format
		}
		const name = `base64_image_${Date.now()}.${ext}`
		const path = await saveBytesAs(bytes, { defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		busy.value = false
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.imgBase64 {
	// tool-content 本身是 block，tabs 的 flex:1 不生效，这里补上 flex 链
	.tool-content {
		display: flex;
		flex-flow: column;
		overflow: hidden;
	}
	.tabs {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-flow: column;
		:deep(.ant-tabs-content-holder) {
			flex: 1;
			min-height: 0;
		}
		:deep(.ant-tabs-content) {
			height: 100%;
		}
		:deep(.ant-tabs-tabpane) {
			height: 100%;
			min-height: 0;
		}
	}
	.pane {
		display: flex;
		flex-flow: column;
		height: 100%;
		overflow: hidden;
	}
	.pane-content {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding-right: 4px;
	}
	.alert {
		margin-top: 12px;
	}
	.options-card {
		margin-top: 12px;
	}
	.options {
		row-gap: 4px;
		:deep(.ant-form-item) {
			margin-bottom: 4px;
		}
	}
	.list {
		margin-top: 16px;
	}
	.output-card {
		margin-top: 16px;
		.output-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			flex-wrap: wrap;
			margin-bottom: 8px;
			.output-title {
				font-weight: 600;
				color: var(--text-color);
			}
		}
		.output-text {
			font-family: 'JetBrains Mono', Consolas, Monaco, 'Courier New', monospace;
			font-size: 12px;
			line-height: 1.5;
		}
	}
	.decode {
		display: flex;
		gap: 20px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.decode-input {
		flex: 1;
		min-width: 300px;
		.decode-actions {
			margin-top: 8px;
			display: flex;
			gap: 8px;
		}
	}
	.decode-result {
		width: 360px;
		max-width: 100%;
		.preview {
			display: flex;
			justify-content: center;
			align-items: center;
			min-height: 140px;
			padding: 8px;
			border-radius: 10px;
			background:
				linear-gradient(45deg, #f2f2f2 25%, transparent 25%, transparent 75%, #f2f2f2 75%) 0 0 / 12px 12px,
				linear-gradient(45deg, #f2f2f2 25%, transparent 25%, transparent 75%, #f2f2f2 75%) 6px 6px / 12px 12px,
				#fff;
			img {
				max-width: 100%;
				max-height: 240px;
			}
		}
		.desc {
			margin-top: 12px;
		}
	}
}
</style>
