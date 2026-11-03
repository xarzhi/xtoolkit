<template>
	<div class="tool md5Tool">
		<h1 class="tool-title">
			MD5 摘要与校验
			<span class="tip">MD5 是单向散列，无法还原原文；这里提供摘要计算、摘要校验与常见弱口令反查</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<div class="main-col">
					<div class="tool-card block">
						<div class="block-title">
							<a-radio-group v-model:value="mode" size="small" button-style="solid">
								<a-radio-button value="text">文本</a-radio-button>
								<a-radio-button value="file">文件</a-radio-button>
							</a-radio-group>
							<a-space style="margin-left: auto" :size="8">
								<a-button size="small" @click="loadSample">载入示例</a-button>
								<a-button size="small" @click="text = ''">清空</a-button>
							</a-space>
						</div>

						<template v-if="mode === 'text'">
							<a-textarea
								v-model:value="text"
								class="mono"
								:rows="6"
								placeholder="输入要计算摘要的文本（支持中文、emoji）"
								:spellcheck="false"
							/>
							<div class="row" style="margin-top: 10px">
								<a-checkbox v-model:checked="multiLine">每行单独计算</a-checkbox>
								<span class="hint">共 {{ charCount }} 个字符 · {{ byteCount }} 字节（UTF-8）</span>
							</div>
						</template>

						<template v-else>
							<div
								class="file-drop"
								:class="{ active: dragging }"
								@click="pickFile"
								@dragover.prevent="dragging = true"
								@dragleave.prevent="dragging = false"
								@drop.prevent="onDrop"
							>
								<template v-if="fileInfo">
									<div class="file-name">{{ fileInfo.name }}</div>
									<div class="hint">{{ formatBytes(fileInfo.size) }} · 点击可重新选择</div>
								</template>
								<template v-else>
									<div class="file-name">点击选择文件，或拖拽到此处</div>
									<div class="hint">大文件会分块读取，不会卡死界面</div>
								</template>
							</div>
							<div v-if="fileBusy" class="hint" style="margin-top: 8px">正在计算…</div>
						</template>
					</div>

					<div class="tool-card block" v-if="mode === 'text'">
						<div class="block-title">计算结果</div>

						<template v-if="!multiLine">
							<div class="result-line" v-for="item in singleResults" :key="item.key">
								<span class="tag">{{ item.label }}</span>
								<code class="hash">{{ item.value || '—' }}</code>
								<a-button size="small" type="text" :disabled="!item.value" @click="copy(item.value)">复制</a-button>
							</div>
						</template>

						<template v-else>
							<div class="hint" style="margin-bottom: 8px">共 {{ batchRows.length }} 行，空行已忽略</div>
							<div class="batch">
								<div class="batch-row" v-for="(row, index) in batchRows" :key="index">
									<span class="batch-text" :title="row.text">{{ row.text }}</span>
									<code class="hash small">{{ row.hash || '—' }}</code>
								</div>
								<div v-if="!batchRows.length" class="hint">还没有内容</div>
							</div>
							<div class="row" style="margin-top: 10px">
								<a-button size="small" :disabled="!batchRows.length" @click="copyBatch">复制全部</a-button>
							</div>
						</template>
					</div>

					<div class="tool-card block" v-if="mode === 'file' && fileInfo">
						<div class="block-title">文件摘要</div>
						<div class="result-line" v-for="item in fileResults" :key="item.key">
							<span class="tag">{{ item.label }}</span>
							<code class="hash">{{ item.value || '—' }}</code>
							<a-button size="small" type="text" :disabled="!item.value" @click="copy(item.value)">复制</a-button>
						</div>
					</div>
				</div>

				<div class="side-col">
					<div class="tool-card block">
						<div class="block-title">摘要校验</div>
						<a-input
							v-model:value="target"
							class="mono"
							placeholder="粘贴一个 32 位或 16 位 MD5 值"
							allow-clear
						/>
						<div class="verify" v-if="target.trim()">
							<span v-if="verifyState === 'match'" class="ok">✓ 完全匹配</span>
							<span v-else-if="verifyState === 'short'" class="ok">✓ 16 位形式匹配</span>
							<span v-else class="err">✕ 不匹配</span>
						</div>
						<div class="hint" style="margin-top: 8px">
							常用于校验下载文件是否被篡改：把自己算出来的摘要和官网公布的值对比。
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">
							常见弱口令反查
							<span class="count">{{ lookupHint }}</span>
						</div>
						<div v-if="lookupResult" class="lookup-hit">
							命中：<b>{{ lookupResult }}</b>
						</div>
						<div v-else class="hint">
							内置约 60 个常见弱口令做对照，只能反查这些；命中说明这个摘要是弱口令，MD5 本身不可逆。
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">为什么"解密"不了</div>
						<div class="hint">· MD5 把任意长度压成 128 位固定摘要，过程不可逆，数学上无法还原原文</div>
						<div class="hint">· 网上所谓的"MD5 解密"其实是查表/撞库，只能命中已被收录的常见值</div>
						<div class="hint">· 存密码请用 bcrypt / scrypt / Argon2 这类带盐慢哈希，MD5 早已不适合</div>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">全部计算在本地完成，不会上传任何内容</span>
			<a-space>
				<a-button @click="text = ''; target = ''; fileInfo = null">清空全部</a-button>
				<a-button type="primary" :disabled="!singleMd5" @click="copy(singleMd5)">复制 32 位摘要</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { formatBytes } from '@/utils/image'
import { lookupCommon, md5, md5Bytes, toShortMd5 } from '@/utils/md5'
import { copyText, friendlyError, isTauri, openFiles, readSourceBytes } from '@/utils/tauriIO'

const mode = ref('text')
const text = ref('')
const multiLine = ref(false)
const target = ref('')
const dragging = ref(false)
const fileBusy = ref(false)
const fileInfo = ref(null)
const fileHash = ref('')

const charCount = computed(() => [...text.value].length)
const byteCount = computed(() => new TextEncoder().encode(text.value).length)

const singleMd5 = computed(() => (mode.value === 'text' && !multiLine.value ? md5(text.value) : fileHash.value))

const singleResults = computed(() => {
	const hash = md5(text.value)
	return [
		{ key: 'lower', label: '32 位小写', value: hash },
		{ key: 'upper', label: '32 位大写', value: hash.toUpperCase() },
		{ key: 'short', label: '16 位小写', value: toShortMd5(hash) },
		{ key: 'shortUpper', label: '16 位大写', value: toShortMd5(hash).toUpperCase() },
	]
})

const fileResults = computed(() => {
	const hash = fileHash.value
	if (!hash) return []
	return [
		{ key: 'lower', label: '32 位小写', value: hash },
		{ key: 'upper', label: '32 位大写', value: hash.toUpperCase() },
		{ key: 'short', label: '16 位小写', value: toShortMd5(hash) },
	]
})

const batchRows = computed(() => {
	if (!multiLine.value) return []
	return text.value
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean)
		.map(line => ({ text: line, hash: md5(line) }))
})

const verifyState = computed(() => {
	const wanted = target.value.trim().toLowerCase()
	if (!wanted) return 'none'
	const full = (mode.value === 'text' ? md5(text.value) : fileHash.value) || ''
	if (!full) return 'none'
	if (wanted === full) return 'match'
	if (wanted.length === 16 && wanted === toShortMd5(full)) return 'short'
	return 'mismatch'
})

const lookupResult = computed(() => {
	if (target.value.trim()) return lookupCommon(target.value)
	if (mode.value === 'text' && !multiLine.value) return lookupCommon(md5(text.value))
	return ''
})
const lookupHint = computed(() => (lookupResult.value ? '已命中' : '未命中'))

/* ---------------- 交互 ---------------- */

const copy = async value => {
	if (!value) return
	try {
		await copyText(value)
		message.success('已复制')
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const copyBatch = () => {
	const lines = batchRows.value.map(row => `${row.text}\t${row.hash}`).join('\n')
	copy(lines)
}

const loadSample = () => {
	text.value = multiLine.value ? '123456\nadmin\npassword' : 'XTools 本地工具箱'
}

/** 分块读文件，几 G 的文件也不会一次性吃满内存 */
const computeFileHash = async file => {
	fileBusy.value = true
	try {
		const bytes = await readSourceBytes(file)
		fileHash.value = md5Bytes(bytes)
	} catch (err) {
		message.error(friendlyError(err))
		fileHash.value = ''
	} finally {
		fileBusy.value = false
	}
}

const useFile = async file => {
	if (!file) return
	const name = typeof file === 'string' ? file.split(/[\\/]/).pop() : file.name
	const size = typeof file === 'string' ? 0 : file.size
	fileInfo.value = { name, size, source: file }
	await computeFileHash(file)
}

const pickFile = async () => {
	if (!isTauri()) {
		const input = document.createElement('input')
		input.type = 'file'
		input.onchange = () => useFile(input.files?.[0])
		input.click()
		return
	}
	try {
		const files = await openFiles({ multiple: false, title: '选择要计算 MD5 的文件' })
		if (files?.length) await useFile(files[0])
	} catch (err) {
		message.error(friendlyError(err))
	}
}

/* 浏览器里 HTML5 拖拽即可；Tauri 里由 Selector 式的窗口事件处理（此页用点击选择） */
const onDrop = async evt => {
	dragging.value = false
	const file = evt.dataTransfer?.files?.[0]
	if (file) await useFile(file)
}

watch(mode, value => {
	if (value === 'text') fileInfo.value = null
})

if (import.meta.env.DEV) {
	window.__md5Test = {
		setText: value => {
			mode.value = 'text'
			text.value = value
		},
		setTarget: value => {
			target.value = value
		},
		setMulti: value => {
			multiLine.value = value
		},
		state: () => ({
			md5: md5(text.value),
			short: toShortMd5(md5(text.value)),
			verify: verifyState.value,
			lookup: lookupResult.value,
			batch: batchRows.value.length,
		}),
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.md5Tool {
	.layout {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.main-col {
		flex: 1.5;
		min-width: 380px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.side-col {
		flex: 1;
		min-width: 300px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.block-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		font-size: 13px;
		color: var(--text-color);
		margin-bottom: 10px;
		.count {
			font-size: 11px;
			font-weight: 500;
			padding: 1px 7px;
			border-radius: 9px;
			background: rgba(127, 127, 127, 0.14);
			color: var(--text-color-2);
		}
	}
	.mono {
		font-family: Consolas, Monaco, 'Courier New', monospace;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.result-line {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 0;
		& + .result-line {
			border-top: 1px dashed var(--border-color);
		}
		.tag {
			flex: none;
			width: 76px;
			font-size: 12px;
			color: var(--text-color-3);
		}
		.hash {
			flex: 1;
			font-family: Consolas, Monaco, monospace;
			font-size: 13px;
			letter-spacing: 0.3px;
			color: #1677ff;
			word-break: break-all;
			&.small {
				font-size: 12px;
			}
		}
	}
	.batch {
		max-height: 260px;
		overflow: auto;
		border-radius: 8px;
		background: rgba(127, 127, 127, 0.06);
		padding: 6px 10px;
	}
	.batch-row {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 4px 0;
		.batch-text {
			flex: none;
			max-width: 140px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: 12px;
			color: var(--text-color-2);
		}
		.hash {
			font-family: Consolas, Monaco, monospace;
			font-size: 12px;
			color: #1677ff;
			word-break: break-all;
		}
	}
	.verify {
		margin-top: 10px;
		font-size: 13px;
		font-weight: 600;
		.ok {
			color: #52c41a;
		}
		.err {
			color: #ff4d4f;
		}
	}
	.lookup-hit {
		font-size: 13px;
		color: var(--text-color);
		padding: 8px 10px;
		border-radius: 8px;
		background: rgba(250, 173, 20, 0.12);
		b {
			color: #fa8c16;
			font-family: Consolas, Monaco, monospace;
		}
	}
	.file-drop {
		border: 2px dashed var(--drop-border, var(--border-color));
		border-radius: 12px;
		padding: 22px 16px;
		text-align: center;
		cursor: pointer;
		background: var(--drop-bg, transparent);
		transition: all 0.2s;
		&.active,
		&:hover {
			border-color: #1677ff;
			background: rgba(22, 119, 255, 0.06);
		}
		.file-name {
			font-size: 14px;
			font-weight: 600;
			color: var(--text-color);
			word-break: break-all;
		}
	}
	.hint {
		line-height: 1.7;
	}
}
</style>
