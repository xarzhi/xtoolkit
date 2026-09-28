<template>
	<div class="tool jsonFormat">
		<h1 class="tool-title">
			JSON 格式化
			<span class="tip">格式化 / 压缩 / 校验 / 转义 / 树形查看</span>
		</h1>

		<div class="tool-content">
			<div class="editor">
				<div class="pane">
					<div class="pane-head">
						<span>输入</span>
						<span class="hint">{{ inputStats }}</span>
					</div>
					<a-textarea
						v-model:value="input"
						class="code-area"
						placeholder="在此粘贴 JSON 内容，或点击下方「打开文件」"
						:spellcheck="false"
					/>
				</div>

				<div class="pane">
					<div class="pane-head">
						<a-tabs v-model:activeKey="rightTab" size="small" class="right-tabs">
							<a-tab-pane key="result" tab="处理结果" />
							<a-tab-pane key="tree" tab="树形视图" />
						</a-tabs>
						<span class="hint">{{ outputStats }}</span>
					</div>

					<a-alert v-if="error" type="error" show-icon class="alert" :message="error" />

					<template v-if="rightTab === 'result'">
						<a-textarea v-model:value="output" class="code-area" placeholder="处理结果会显示在这里" :spellcheck="false" />
					</template>
					<template v-else>
						<div class="tree-wrap">
							<a-empty v-if="!parsed" description="JSON 合法后即可查看树形结构" />
							<a-alert
								v-else-if="treeTooLarge"
								type="info"
								show-icon
								message="JSON 过大，已省略树形视图，请使用格式化结果查看"
							/>
							<a-tree v-else :tree-data="treeData" :default-expand-all="true" :selectable="false" />
						</div>
					</template>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<a-space wrap>
				<a-button type="primary" @click="formatJson">格式化</a-button>
				<a-button @click="minifyJson">压缩</a-button>
				<a-button @click="validateJson">校验</a-button>
				<a-button @click="sortKeys">键名排序</a-button>
				<a-button @click="escapeJson">转义</a-button>
				<a-button @click="unescapeJson">去转义</a-button>
				<a-space :size="4">
					<span class="hint">缩进</span>
					<a-select v-model:value="indent" style="width: 96px" :options="indentOptions" />
				</a-space>
				<a-space :size="6">
					<a-switch v-model:checked="autoFormat" size="small" />
					<span class="hint">输入即自动格式化</span>
				</a-space>
			</a-space>

			<a-space>
				<a-button :disabled="!input" @click="clearAll">清空</a-button>
				<a-button @click="openFile">打开文件</a-button>
				<a-button :disabled="!output" @click="copyOutput">复制结果</a-button>
				<a-button type="primary" :disabled="!(output || input)" @click="saveFile">保存文件</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, ref, shallowRef, watch } from 'vue'
import { message } from 'ant-design-vue'
import { copyText, friendlyError, openFiles, readSourceText, saveTextAs } from '@/utils/tauriIO'

const input = ref('')
const output = ref('')
const error = ref('')
// 大 JSON 不需要深层响应式，用 shallowRef 避免代理开销
const parsed = shallowRef(null)
const indent = ref(2)
const rightTab = ref('result')
const autoFormat = ref(true)

const indentOptions = [
	{ label: '2 空格', value: 2 },
	{ label: '4 空格', value: 4 },
	{ label: 'Tab', value: '\t' },
]

const inputStats = computed(() => statsText(input.value))
const outputStats = computed(() => statsText(output.value))

function statsText(text) {
	if (!text) return '0 字符'
	const lines = text.split('\n').length
	return `${text.length.toLocaleString()} 字符 · ${lines} 行`
}

/** 解析并把错误定位到行列 */
const parse = text => {
	error.value = ''
	if (!text.trim()) {
		parsed.value = null
		error.value = '内容为空'
		return null
	}
	try {
		const value = JSON.parse(text)
		parsed.value = value
		return value
	} catch (err) {
		parsed.value = null
		error.value = describeError(err, text)
		return null
	}
}

function describeError(err, text) {
	const msg = err?.message || 'JSON 解析失败'
	if (/line \d+ column \d+/.test(msg)) return msg
	const match = msg.match(/position (\d+)/)
	if (match) {
		const pos = Number(match[1])
		const before = text.slice(0, pos)
		const line = before.split('\n').length
		const column = pos - before.lastIndexOf('\n')
		return `${msg}（第 ${line} 行，第 ${column} 列）`
	}
	return msg
}

const formatJson = () => {
	const value = parse(input.value)
	if (value === null && error.value) return
	output.value = JSON.stringify(value, null, indent.value)
	message.success('格式化完成')
}

const minifyJson = () => {
	const value = parse(input.value)
	if (value === null && error.value) return
	output.value = JSON.stringify(value)
	message.success(`压缩完成，体积 ${input.value.length} → ${output.value.length} 字符`)
}

const validateJson = () => {
	const value = parse(input.value)
	if (value === null && error.value) return
	const summary = Array.isArray(value) ? `数组，共 ${value.length} 项` : `对象，共 ${Object.keys(value || {}).length} 个键`
	message.success(`JSON 合法（${summary}）`)
}

/** 递归按 key 排序 */
function sortDeep(value) {
	if (Array.isArray(value)) return value.map(sortDeep)
	if (value && typeof value === 'object') {
		return Object.keys(value)
			.sort((a, b) => a.localeCompare(b))
			.reduce((acc, key) => {
				acc[key] = sortDeep(value[key])
				return acc
			}, {})
	}
	return value
}

const sortKeys = () => {
	const value = parse(input.value)
	if (value === null && error.value) return
	output.value = JSON.stringify(sortDeep(value), null, indent.value)
	message.success('已按 key 名称排序')
}

const escapeJson = () => {
	if (!input.value) return
	output.value = JSON.stringify(input.value)
	message.success('已转义为 JSON 字符串')
}

const unescapeJson = () => {
	const text = input.value.trim()
	if (!text) return
	try {
		// 兼容被整体包在引号里的情况
		const literal = /^["']/.test(text) ? text : JSON.stringify(text)
		const value = JSON.parse(literal)
		output.value = typeof value === 'string' ? value : JSON.stringify(value, null, indent.value)
		error.value = ''
		message.success('已去转义')
	} catch (err) {
		error.value = describeError(err, text)
	}
}

/* 树形视图 */
const treeTooLarge = computed(() => (input.value?.length || 0) > 1_500_000)

const treeData = computed(() => {
	if (!parsed.value) return []
	let count = 0
	const build = (value, key, path) => {
		count += 1
		if (count > 5000) return { title: '…', key: `${path}-more`, isLeaf: true }

		let entries = null
		if (Array.isArray(value)) {
			entries = value.map((item, index) => [`[${index}]`, item, `${path}-${index}`])
		} else if (value && typeof value === 'object') {
			entries = Object.entries(value).map(([k, v]) => [k, v, `${path}-${k}`])
		}
		if (!entries) return { title: `${key} : ${JSON.stringify(value)}`, key: path, isLeaf: true }

		const label = Array.isArray(value) ? `Array(${value.length})` : `Object(${entries.length})`
		const shown = entries.slice(0, 200)
		const children = shown.map(([k, v, p]) => build(v, k, p))
		if (entries.length > shown.length) {
			children.push({ title: `… 其余 ${entries.length - shown.length} 项已省略`, key: `${path}-rest`, isLeaf: true })
		}
		return { title: `${key} : ${label}`, key: path, children }
	}
	return [build(parsed.value, 'root', 'root')]
})

/* 文件操作 */
const openFile = async () => {
	try {
		const files = await openFiles({
			multiple: false,
			title: '选择 JSON 文件',
			filters: [{ name: 'JSON / 文本', extensions: ['json', 'txt', 'json5', 'geojson'] }],
		})
		if (!files?.length) return
		input.value = await readSourceText(files[0])
		error.value = ''
		const value = parse(input.value)
		if (value !== null || !error.value) output.value = JSON.stringify(value, null, indent.value)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const saveFile = async () => {
	try {
		const text = output.value || input.value
		const path = await saveTextAs(text, {
			defaultPath: 'formatted.json',
			filters: [{ name: 'JSON', extensions: ['json'] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const copyOutput = async () => {
	const ok = await copyText(output.value)
	message[ok ? 'success' : 'error'](ok ? '已复制到剪贴板' : '复制失败')
}

const clearAll = () => {
	input.value = ''
	output.value = ''
	error.value = ''
	parsed.value = null
}

/* 输入即自动格式化（防抖，静默不弹提示） */
let autoTimer = null
const autoFormatNow = () => {
	const text = input.value
	if (!text.trim()) {
		parsed.value = null
		error.value = ''
		output.value = ''
		return
	}
	const value = parse(text)
	if (value === null && error.value) return
	output.value = JSON.stringify(value, null, indent.value)
}

watch([input, indent, autoFormat], () => {
	if (!autoFormat.value) return
	if (autoTimer) clearTimeout(autoTimer)
	autoTimer = setTimeout(autoFormatNow, 350)
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.jsonFormat {
	.editor {
		display: flex;
		gap: 16px;
		height: 100%;
		min-height: 0;
	}
	.pane {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-flow: column;
		min-height: 0;
	}
	.pane-head {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 34px;
		font-weight: 500;
		color: #262626;
	}
	.right-tabs {
		flex: 1;
		:deep(.ant-tabs-nav) {
			margin-bottom: 0;
		}
	}
	.alert {
		margin-bottom: 8px;
	}
	.code-area {
		flex: 1;
		min-height: 0;
		height: 100%;
		font-family: 'JetBrains Mono', Consolas, Monaco, 'Courier New', monospace;
		font-size: 13px;
		line-height: 1.6;
		resize: none;
		:deep(textarea) {
			height: 100%;
		}
	}
	.tree-wrap {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 8px 12px 12px;
		background: #fff;
		border: 1px solid #d9d9d9;
		border-radius: 8px;
	}
}
</style>
