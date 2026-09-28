<template>
	<div class="tool markdownConvert">
		<h1 class="tool-title">
			Markdown 与 HTML 互转
			<span class="tip">Markdown → HTML 用 marked，HTML → Markdown 用 turndown，全程本地处理</span>
		</h1>

		<div class="tool-content">
			<a-tabs v-model:activeKey="activeTab" class="tabs">
				<a-tab-pane key="md2html" tab="Markdown → HTML">
					<div class="pane">
						<div class="editor">
							<div class="col">
								<div class="pane-head"><span>Markdown</span><span class="hint">{{ mdStats }}</span></div>
								<a-textarea v-model:value="markdown" class="code-area" :spellcheck="false" placeholder="# 标题&#10;&#10;- 列表项" />
							</div>
							<div class="col">
								<div class="pane-head">
									<span>HTML</span>
									<a-space :size="8">
										<a-button size="small" @click="copyHtml">复制</a-button>
										<a-button size="small" @click="saveHtml">保存</a-button>
									</a-space>
								</div>
								<a-textarea :value="html" class="code-area" readonly :spellcheck="false" />
							</div>
						</div>
						<div class="tool-card options">
							<a-space :size="16" wrap align="center">
								<span class="switch-item">
									<a-switch v-model:checked="mdOptions.breaks" size="small" />
									<span class="hint">单个换行转 &lt;br&gt;</span>
								</span>
								<span class="switch-item">
									<a-switch v-model:checked="mdOptions.fullDocument" size="small" />
									<span class="hint">输出完整 HTML 文档（带基础样式）</span>
								</span>
								<a-select v-model:value="mdOptions.gfm" size="small" style="width: 170px" :options="gfmOptions" />
								<span class="switch-item">
									<a-checkbox v-model:checked="mdOptions.showPreview">预览</a-checkbox>
								</span>
							</a-space>
						</div>
						<div class="preview" v-if="mdOptions.showPreview">
							<iframe class="preview-frame" sandbox="" :srcdoc="previewDoc"></iframe>
						</div>
					</div>
				</a-tab-pane>

				<a-tab-pane key="html2md" tab="HTML → Markdown">
					<div class="pane">
						<div class="editor">
							<div class="col">
								<div class="pane-head"><span>HTML</span><span class="hint">{{ htmlStats }}</span></div>
								<a-textarea v-model:value="htmlInput" class="code-area" :spellcheck="false" placeholder="&lt;h1&gt;标题&lt;/h1&gt;" />
							</div>
							<div class="col">
								<div class="pane-head">
									<span>Markdown</span>
									<a-space :size="8">
										<a-button size="small" @click="copyMarkdown">复制</a-button>
										<a-button size="small" @click="saveMarkdown">保存</a-button>
									</a-space>
								</div>
								<a-textarea :value="markdownOutput" class="code-area" readonly :spellcheck="false" />
							</div>
						</div>
						<div class="tool-card options">
							<a-space :size="14" wrap align="center">
								<span class="switch-item">
									<span class="hint">标题风格</span>
									<a-select v-model:value="tdOptions.headingStyle" size="small" style="width: 110px" :options="headingOptions" />
								</span>
								<span class="switch-item">
									<span class="hint">列表符号</span>
									<a-select v-model:value="tdOptions.bulletListMarker" size="small" style="width: 90px" :options="bulletOptions" />
								</span>
								<span class="switch-item">
									<span class="hint">代码块</span>
									<a-select v-model:value="tdOptions.codeBlockStyle" size="small" style="width: 120px" :options="codeBlockOptions" />
								</span>
								<span class="switch-item">
									<a-switch v-model:checked="tdOptions.stripScripts" size="small" />
									<span class="hint">丢弃 script / style / noscript</span>
								</span>
							</a-space>
						</div>
					</div>
				</a-tab-pane>
			</a-tabs>
		</div>

		<div class="tool-footer">
			<span class="hint">预览用 sandbox iframe 渲染，不会执行 HTML 里的脚本</span>
			<a-space>
				<a-button @click="swap">对调内容</a-button>
				<a-button @click="clearAll">清空</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { copyText, friendlyError, saveTextAs } from '@/utils/tauriIO'

const activeTab = ref('md2html')
const markdown = ref('# 标题\n\n这是一段**加粗**文字，还有 `行内代码`。\n\n- 列表一\n- 列表二\n\n```js\nconsole.log(1)\n```\n')
const htmlInput = ref('<h1>标题</h1>\n<p>这是一段<strong>加粗</strong>文字。</p>\n<ul>\n  <li>列表一</li>\n  <li>列表二</li>\n</ul>\n')

const mdOptions = reactive({ breaks: false, fullDocument: false, gfm: 'gfm', showPreview: true })
const tdOptions = reactive({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', stripScripts: true })

const gfmOptions = [
	{ label: 'GFM（表格/任务列表）', value: 'gfm' },
	{ label: 'CommonMark（严格）', value: 'commonmark' },
]
const headingOptions = [
	{ label: 'ATX（#）', value: 'atx' },
	{ label: 'Setext（===）', value: 'setext' },
]
const bulletOptions = [
	{ label: '-', value: '-' },
	{ label: '*', value: '*' },
	{ label: '+', value: '+' },
]
const codeBlockOptions = [
	{ label: '围栏 ```', value: 'fenced' },
	{ label: '缩进 4 空格', value: 'indented' },
]

const DOC_STYLE = `body{font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.7;padding:16px;color:#24292f;}
h1,h2,h3{line-height:1.3;margin:1.2em 0 .6em;}h1{border-bottom:1px solid #eaecef;padding-bottom:.3em;}
code{background:rgba(27,31,35,.06);padding:.2em .4em;border-radius:4px;font-family:Consolas,Monaco,monospace;font-size:.9em;}
pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto;}pre code{background:none;padding:0;}
blockquote{margin:0;padding:0 1em;color:#6a737d;border-left:.25em solid #dfe2e5;}
table{border-collapse:collapse;}th,td{border:1px solid #dfe2e5;padding:6px 12px;}
img{max-width:100%;}`

const html = computed(() => {
	const body = marked.parse(markdown.value || '', {
		gfm: mdOptions.gfm === 'gfm',
		breaks: mdOptions.breaks,
	})
	if (!mdOptions.fullDocument) return body
	return `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<title>Markdown 导出</title>\n<style>\n${DOC_STYLE}\n</style>\n</head>\n<body>\n${body}</body>\n</html>\n`
})

const previewDoc = computed(() => {
	const body = marked.parse(markdown.value || '', { gfm: mdOptions.gfm === 'gfm', breaks: mdOptions.breaks })
	return `<!doctype html><html><head><meta charset="utf-8"><style>${DOC_STYLE}</style></head><body>${body}</body></html>`
})

const markdownOutput = computed(() => {
	const service = new TurndownService({
		headingStyle: tdOptions.headingStyle,
		bulletListMarker: tdOptions.bulletListMarker,
		codeBlockStyle: tdOptions.codeBlockStyle,
		emDelimiter: '*',
		strongDelimiter: '**',
		linkStyle: 'inlined',
	})
	if (tdOptions.stripScripts) service.remove(['script', 'style', 'noscript', 'iframe'])
	try {
		return service.turndown(htmlInput.value || '')
	} catch (err) {
		return `转换失败：${err.message}`
	}
})

const stats = text => {
	if (!text) return '0 字符'
	return `${text.length.toLocaleString()} 字符 · ${text.split('\n').length} 行`
}
const mdStats = computed(() => stats(markdown.value))
const htmlStats = computed(() => stats(htmlInput.value))

const copyHtml = async () => {
	const ok = await copyText(html.value)
	message[ok ? 'success' : 'error'](ok ? '已复制 HTML' : '复制失败')
}
const saveHtml = async () => {
	try {
		const path = await saveTextAs(html.value, {
			defaultPath: 'converted.html',
			filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}
const copyMarkdown = async () => {
	const ok = await copyText(markdownOutput.value)
	message[ok ? 'success' : 'error'](ok ? '已复制 Markdown' : '复制失败')
}
const saveMarkdown = async () => {
	try {
		const path = await saveTextAs(markdownOutput.value, {
			defaultPath: 'converted.md',
			filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

/** 把当前结果丢到另一边，方便来回校对 */
const swap = () => {
	if (activeTab.value === 'md2html') {
		htmlInput.value = html.value
		activeTab.value = 'html2md'
	} else {
		markdown.value = markdownOutput.value
		activeTab.value = 'md2html'
	}
}

const clearAll = () => {
	markdown.value = ''
	htmlInput.value = ''
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.markdownConvert {
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
		gap: 10px;
		height: 100%;
		min-height: 0;
	}
	.editor {
		display: flex;
		gap: 16px;
		flex: 1;
		min-height: 0;
	}
	.col {
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
		height: 30px;
		font-weight: 600;
		color: #262626;
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
		.switch-item {
			display: inline-flex;
			align-items: center;
			gap: 6px;
		}
	}
	.preview {
		flex: 0 1 38%;
		min-height: 120px;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		overflow: hidden;
		background: #fff;
		.preview-frame {
			width: 100%;
			height: 100%;
			border: 0;
			display: block;
		}
	}
}
</style>
