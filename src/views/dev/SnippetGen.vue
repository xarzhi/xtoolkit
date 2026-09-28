<template>
	<div class="tool snippetGen">
		<h1 class="tool-title">
			VS Code 代码片段
			<span class="tip">粘贴一段代码，填好触发词，直接得到可用的 .code-snippets 内容</span>
		</h1>

		<div class="tool-content">
			<div class="editor">
				<div class="pane">
					<div class="pane-head">
						<span>代码内容</span>
						<span class="hint">{{ bodyLines.length }} 行</span>
					</div>
					<a-textarea
						v-model:value="form.body"
						class="code-area"
						placeholder="把要变成片段的代码粘贴到这里，例如：&#10;console.log($1)&#10;&#10;${2:注释}"
						:spellcheck="false"
					/>
					<div class="tool-card options">
						<div class="grid">
							<a-input v-model:value="form.name" addon-before="片段名称" placeholder="my-snippet" />
							<a-input v-model:value="form.prefix" addon-before="触发词" placeholder="log" />
							<a-input v-model:value="form.description" addon-before="描述" placeholder="可留空" />
							<a-select
								v-model:value="scopeList"
								mode="tags"
								:options="scopeOptions"
								placeholder="适用范围（可多选，也可直接输入语言 id）"
								style="width: 100%"
							/>
						</div>
						<div class="switches">
							<a-space :size="16" wrap align="center">
								<span class="switch-item">
									<a-switch v-model:checked="form.keepPlaceholders" size="small" />
									<span class="hint">保留 ${1} / $TM_FILENAME 等占位符语法</span>
								</span>
								<span class="switch-item">
									<a-switch v-model:checked="form.asArray" size="small" />
									<span class="hint">body 用数组（VS Code 推荐）</span>
								</span>
								<span class="switch-item">
									<a-select v-model:value="form.indent" size="small" style="width: 110px" :options="indentOptions" />
								</span>
							</a-space>
						</div>
					</div>
				</div>

				<div class="pane">
					<div class="pane-head">
						<span>片段 JSON</span>
						<span class="hint" :class="{ ok: valid.ok, bad: !valid.ok }">
							{{ valid.ok ? `格式正常（${valid.count} 个片段）` : `格式异常：${valid.error}` }}
						</span>
					</div>
					<a-textarea :value="json" class="code-area" readonly :spellcheck="false" />
					<div class="hint">放到 VS Code 的「用户片段」里即可使用（命令面板 → Preferences: Configure User Snippets）</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<a-space :size="12" wrap align="center">
				<span class="hint">生成方式与 snippet-generator 一致：body 按行拆分并转义 $ 与 }</span>
			</a-space>
			<a-space>
				<a-button :disabled="!json" @click="copyJson">复制 JSON</a-button>
				<a-button :disabled="!json" @click="saveJson">导出 .code-snippets</a-button>
				<a-button type="primary" :disabled="!json || !valid.ok" :loading="busy" @click="writeToVscode">
					写入 VS Code 片段目录
				</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { COMMON_SCOPES, generateSnippet, validateSnippetJson } from '@/utils/snippet'
import { joinPath } from '@/utils/image'
import { copyText, friendlyError, isTauri, pathExists, readSourceText, saveTextAs, writeText } from '@/utils/tauriIO'

const form = reactive({
	name: 'my-snippet',
	prefix: 'log',
	description: '',
	body: 'console.log($1)',
	keepPlaceholders: true,
	asArray: true,
	indent: 2,
})
const scopeList = ref([])
const busy = ref(false)
const vscodeDir = ref('')

const scopeOptions = COMMON_SCOPES
const indentOptions = [
	{ label: '2 空格缩进', value: 2 },
	{ label: '4 空格缩进', value: 4 },
	{ label: 'Tab 缩进', value: '\t' },
]

const generated = computed(() =>
	generateSnippet({
		...form,
		scope: scopeList.value.join(','),
	})
)
const json = computed(() => generated.value.json)
const bodyLines = computed(() => generated.value.bodyLines)
const valid = computed(() => validateSnippetJson(json.value))

/** 猜测 VS Code 用户片段目录（装了多个编辑器时列出所有存在的） */
const detectVscodeDirs = async () => {
	const list = []
	if (!isTauri()) return list
	try {
		const { appDataDir } = await import('@tauri-apps/api/path')
		const roaming = await appDataDir()
		// appDataDir 是 %APPDATA%\com.tauri-app.xtools，取它的上级得到 %APPDATA%
		const appData = roaming.replace(/[\\/][^\\/]+[\\/]?$/, '')
		for (const editor of ['Code', 'Code - Insiders', 'VSCodium', 'Cursor', 'Windsurf']) {
			const dir = joinPath(joinPath(appData, editor), joinPath('User', 'snippets'))
			try {
				if (await pathExists(dir)) list.push({ editor, dir })
			} catch {
				/* 忽略 */
			}
		}
	} catch {
		/* 忽略 */
	}
	// 兜底：用 Rust 展开 %APPDATA% 拼一个默认路径给用户参考
	if (!list.length) {
		try {
			const { invoke } = await import('@tauri-apps/api/core')
			const expanded = await invoke('expand_env_path', { path: '%APPDATA%\\Code\\User\\snippets' })
			if (expanded && !expanded.includes('%')) list.push({ editor: 'Code（未确认存在）', dir: expanded })
		} catch {
			/* 忽略 */
		}
	}
	return list
}

onMounted(async () => {
	const dirs = await detectVscodeDirs()
	vscodeDir.value = dirs[0]?.dir || ''
})

const copyJson = async () => {
	const ok = await copyText(json.value)
	message[ok ? 'success' : 'error'](ok ? '已复制到剪贴板' : '复制失败')
}

const saveJson = async () => {
	try {
		const path = await saveTextAs(json.value, {
			defaultPath: `${form.name || 'my-snippets'}.code-snippets`,
			filters: [{ name: 'VS Code 片段', extensions: ['code-snippets'] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

/** 写入 VS Code 片段目录：已存在同名文件时按片段名合并 */
const writeToVscode = async () => {
	if (!isTauri()) {
		message.warning('浏览器环境无法写入 VS Code 目录，请用「导出 .code-snippets」')
		return
	}
	busy.value = true
	try {
		let dir = vscodeDir.value
		if (!dir) {
			const { open } = await import('@tauri-apps/plugin-dialog')
			const picked = await open({ directory: true, multiple: false, recursive: true, title: '选择 VS Code 的 snippets 目录' })
			if (typeof picked !== 'string') return
			dir = picked
			vscodeDir.value = dir
		}
		// 默认文件名用第一个 scope，方便 VS Code 只在对应语言里提示
		const firstScope = (scopeList.value[0] || 'plaintext').split(',')[0].trim()
		const fileName = `${firstScope || 'plaintext'}.code-snippets`
		const filePath = joinPath(dir, fileName)
		const incoming = generated.value.object

		if (await pathExists(filePath)) {
			let merged = null
			try {
				const existingText = await readSourceText(filePath)
				const existing = JSON.parse(existingText.replace(/^\uFEFF/, ''))
				if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
					merged = { ...existing, ...incoming }
				}
			} catch {
				merged = null
			}
			if (!merged) {
				const confirmed = await new Promise(resolve => {
					Modal.confirm({
						title: `${fileName} 已存在且不是标准 JSON`,
						content: '可能包含注释。继续写入会覆盖该文件内容，确定吗？',
						okText: '覆盖',
						okType: 'danger',
						cancelText: '取消',
						onOk: () => resolve(true),
						onCancel: () => resolve(false),
					})
				})
				if (!confirmed) return
				merged = incoming
			}
			await writeText(filePath, JSON.stringify(merged, null, form.indent))
			message.success(`已写入：${filePath}`)
		} else {
			await writeText(filePath, json.value)
			message.success(`已创建：${filePath}`)
		}
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		busy.value = false
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.snippetGen {
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
		gap: 8px;
	}
	.pane-head {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 28px;
		font-weight: 600;
		color: #262626;
		.ok {
			color: #52c41a;
		}
		.bad {
			color: #f5222d;
		}
	}
	.code-area {
		flex: 1;
		min-height: 0;
		font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
		font-size: 13px;
		line-height: 1.6;
		resize: none;
		:deep(textarea) {
			height: 100%;
		}
	}
	.options {
		flex: none;
		.grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 8px;
		}
		.switches {
			margin-top: 10px;
			.switch-item {
				display: inline-flex;
				align-items: center;
				gap: 6px;
			}
		}
	}
}
</style>
