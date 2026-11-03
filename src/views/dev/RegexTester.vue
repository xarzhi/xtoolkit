<template>
	<div class="tool regexTester">
		<h1 class="tool-title">
			正则表达式验证
			<span class="tip">实时高亮匹配结果、查看捕获组，并预览替换后的文本</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<!-- 左：正则 + 文本 + 高亮 -->
				<div class="main-col">
					<div class="tool-card block">
						<div class="regex-bar">
							<span class="slash">/</span>
							<a-input
								v-model:value="pattern"
								class="pattern-input mono"
								placeholder="输入正则表达式，例如 \d+"
								allow-clear
							/>
							<span class="slash">/</span>
							<span class="flags-text">{{ flagText || '—' }}</span>
						</div>

						<div class="flag-row">
							<a-checkbox-group v-model:value="flags" :options="FLAG_OPTIONS" />
						</div>

						<div class="status">
							<span v-if="error" class="err">✕ {{ error }}</span>
							<span v-else class="ok">
								✓ 语法正常 · 共匹配
								<b>{{ matches.length }}</b>
								处
							</span>
							<a-button size="small" type="text" style="margin-left: auto" :disabled="!matches.length" @click="copyMatches">
								复制匹配结果
							</a-button>
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">
							测试文本
							<a-space style="margin-left: auto" :size="8">
								<a-button size="small" @click="loadSample">载入示例</a-button>
								<a-button size="small" @click="text = ''">清空</a-button>
							</a-space>
						</div>
						<a-textarea
							v-model:value="text"
							class="mono text-input"
							:rows="7"
							placeholder="在这里粘贴要匹配的文本…"
							:spellcheck="false"
						/>
					</div>

					<div class="tool-card block">
						<div class="block-title">匹配高亮</div>
						<div class="highlight mono">
							<template v-for="(seg, i) in segments" :key="i">
								<mark v-if="seg.hit" :class="`hit hit-${seg.group % 4}`">{{ seg.text }}</mark>
								<span v-else>{{ seg.text }}</span>
							</template>
							<span v-if="!text" class="hint">上方输入文本后，这里会实时高亮所有匹配</span>
						</div>
					</div>
				</div>

				<!-- 右：预设 / 匹配列表 / 替换 -->
				<div class="side-col">
					<div class="tool-card block">
						<div class="block-title">常用正则</div>
						<div class="presets">
							<button v-for="p in PRESETS" :key="p.name" class="preset" @click="applyPreset(p)">
								<span class="pname">{{ p.name }}</span>
								<span class="pval mono">/{{ p.pattern }}/{{ p.flags }}</span>
							</button>
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">
							匹配结果
							<span class="count">{{ matches.length }}</span>
						</div>

						<div v-if="!matches.length" class="hint">暂无匹配</div>

						<div v-else class="match-list">
							<div v-for="(m, i) in matches.slice(0, 200)" :key="i" class="match-row">
								<span class="idx">{{ i + 1 }}</span>
								<div class="match-main">
									<div class="mtext mono">{{ m.value === '' ? '(空字符串)' : m.value }}</div>
									<div class="mmeta">
										<span class="pos">位置 {{ m.index }}–{{ m.index + m.value.length }}</span>
										<span v-for="g in m.groups" :key="g.key" class="group">${{ g.key }} = {{ g.value === undefined ? 'undefined' : g.value }}</span>
									</div>
								</div>
							</div>
							<div v-if="matches.length > 200" class="hint">仅显示前 200 条（共 {{ matches.length }} 条）</div>
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">
							替换预览
							<a-button size="small" type="text" style="margin-left: auto" :disabled="!text" @click="copyResult(replaced)">复制</a-button>
						</div>
						<a-input v-model:value="replacement" class="mono" placeholder="替换为…（可用 $1 $2 $& 等）" allow-clear />
						<pre class="code">{{ replaced || '（无变化）' }}</pre>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">提示：勾选 g 才会找出全部匹配；未勾选 g 时本页仍会列出所有位置，方便查看效果</span>
			<a-space>
				<a-button @click="reset">恢复默认</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import { copyText } from '@/utils/tauriIO'

const FLAG_OPTIONS = [
	{ label: 'g 全局', value: 'g' },
	{ label: 'i 忽略大小写', value: 'i' },
	{ label: 'm 多行', value: 'm' },
	{ label: 's . 匹配换行', value: 's' },
	{ label: 'u Unicode', value: 'u' },
]

const SAMPLE = `联系方式：手机 13812345678，备用 15900001111。
邮箱 zhangsan@example.com、li_si+work@corp.com.cn
官网 https://www.example.com/docs?id=42 ，内网 http://192.168.1.100:8080
下单日期 2024-03-18，金额 12,345.60 元，编号 A20240318001。
IP 地址 10.0.0.1 与 255.255.255.0，中文测试：正则表达式很好用。`

const PRESETS = [
	{
		name: '中国大陆手机号',
		pattern: '1[3-9]\\d{9}',
		flags: 'g',
		text: '客服 13812345678，另一个 18900001234，还有 12345678901（非手机号）。',
	},
	{
		name: '邮箱地址',
		pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.]+',
		flags: 'g',
		text: '联系 zhangsan@example.com 或 li_si+work@corp.com.cn ，无效：a@b。',
	},
	{
		name: 'URL 链接',
		pattern: 'https?://[^\\s，。；]+',
		flags: 'g',
		text: '打开 https://www.example.com/docs?id=42 和 http://192.168.1.100:8080/admin 即可。',
	},
	{
		name: '日期 YYYY-MM-DD',
		pattern: '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})',
		flags: 'g',
		text: '开始 2024-03-18，结束 2024-12-31，格式错误 2024/3/8。',
	},
	{
		name: 'IPv4 地址',
		pattern: '(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)',
		flags: 'g',
		text: '网关 192.168.1.1，掩码 255.255.255.0，错误 256.1.1.1。',
	},
	{
		name: '中文汉字',
		pattern: '[\\u4e00-\\u9fa5]+',
		flags: 'g',
		text: 'Hello 世界，这是一段中英混合 text 内容。',
	},
	{
		name: 'HTML 标签',
		pattern: '<(?<tag>[a-zA-Z][\\w-]*)\\b[^>]*>',
		flags: 'g',
		text: '<div class="box"><span>hi</span><img src="a.png" /></div>',
	},
	{
		name: '强密码（8位+大小写数字）',
		pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[\\w!@#$%^&*]{8,}$',
		flags: 'gm',
		text: 'Abc12345\nabcdefgh\nAbcdefg1\n12345678',
	},
]

const pattern = ref('\\d{3,}')
const flags = ref(['g'])
const text = ref(SAMPLE)
const replacement = ref('[$&]')

const flagText = computed(() => flags.value.join(''))

/* ---------------- 编译 ---------------- */
const compiled = computed(() => {
	if (!pattern.value) return { error: '', re: null }
	try {
		return { error: '', re: new RegExp(pattern.value, flagText.value) }
	} catch (err) {
		return { error: err.message, re: null }
	}
})

const error = computed(() => compiled.value.error)

/** 始终以全局模式收集所有匹配（未勾 g 也能看到全部位置） */
const scanRe = computed(() => {
	if (!pattern.value) return null
	const f = flagText.value.includes('g') ? flagText.value : `${flagText.value}g`
	try {
		return new RegExp(pattern.value, f)
	} catch {
		return null
	}
})

const matches = computed(() => {
	const re = scanRe.value
	if (!re || !text.value) return []
	const out = []
	let guard = 0
	let m = re.exec(text.value)
	while (m && guard < 5000) {
		guard += 1
		const groups = []
		if (m.groups) {
			for (const [key, value] of Object.entries(m.groups)) groups.push({ key, value })
		}
		out.push({ value: m[0], index: m.index, groups })
		if (m[0] === '') re.lastIndex += 1
		m = re.exec(text.value)
	}
	return out
})

/* ---------------- 高亮分段 ---------------- */
const segments = computed(() => {
	const src = text.value || ''
	if (!src) return []
	const list = matches.value
	if (!list.length) return [{ text: src, hit: false, group: 0 }]

	const out = []
	let cursor = 0
	list.forEach((m, i) => {
		if (m.index > cursor) out.push({ text: src.slice(cursor, m.index), hit: false, group: 0 })
		if (m.value) out.push({ text: m.value, hit: true, group: i })
		cursor = m.index + m.value.length
	})
	if (cursor < src.length) out.push({ text: src.slice(cursor), hit: false, group: 0 })
	return out
})

/* ---------------- 替换 ---------------- */
const replaced = computed(() => {
	const re = compiled.value.re
	if (!re || !text.value || error.value) return ''
	try {
		return text.value.replace(re, replacement.value)
	} catch {
		return ''
	}
})

/* ---------------- 操作 ---------------- */
const applyPreset = p => {
	pattern.value = p.pattern
	flags.value = p.flags.split('')
	text.value = p.text
	replacement.value = '[$&]'
}

const loadSample = () => {
	text.value = SAMPLE
}

const reset = () => {
	pattern.value = '\\d{3,}'
	flags.value = ['g']
	text.value = SAMPLE
	replacement.value = '[$&]'
}

const copyMatches = async () => {
	const content = matches.value.map((m, i) => `${i + 1}. ${m.value} @${m.index}`).join('\n')
	const ok = await copyText(content)
	message[ok ? 'success' : 'error'](ok ? `已复制 ${matches.value.length} 条匹配` : '复制失败')
}

const copyResult = async content => {
	const ok = await copyText(content)
	message[ok ? 'success' : 'error'](ok ? '已复制' : '复制失败')
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.regexTester {
	.layout {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.main-col {
		flex: 2;
		min-width: 380px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.side-col {
		flex: 1;
		min-width: 320px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.block-title {
		font-weight: 600;
		color: var(--text-color);
		margin-bottom: 10px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;

		.count {
			font-size: 11px;
			font-weight: 500;
			padding: 1px 7px;
			border-radius: 9px;
			background: rgba(22, 119, 255, 0.12);
			color: #1677ff;
		}
	}
	.regex-bar {
		display: flex;
		align-items: center;
		gap: 8px;

		.slash {
			font-family: Consolas, Monaco, monospace;
			font-size: 18px;
			color: var(--text-color-3);
		}
		.pattern-input {
			flex: 1;
		}
		.flags-text {
			font-family: Consolas, Monaco, monospace;
			font-size: 14px;
			color: #1677ff;
			min-width: 16px;
		}
	}
	.flag-row {
		margin-top: 10px;
		:deep(.ant-checkbox-group) {
			display: flex;
			flex-wrap: wrap;
			gap: 4px 14px;
		}
	}
	.status {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
		font-size: 12px;
		.err {
			color: #ef4444;
			word-break: break-all;
		}
		.ok {
			color: var(--text-color-2);
			b {
				color: #1677ff;
				margin: 0 2px;
			}
		}
	}
	.mono {
		font-family: Consolas, Monaco, monospace;
	}
	.text-input {
		font-family: Consolas, Monaco, monospace;
		font-size: 13px;
		line-height: 1.7;
	}
	.highlight {
		min-height: 60px;
		max-height: 240px;
		overflow: auto;
		padding: 10px 12px;
		border-radius: 8px;
		background: rgba(127, 127, 127, 0.09);
		border: 1px solid var(--border-color);
		font-size: 13px;
		line-height: 1.8;
		color: var(--text-color);
		white-space: pre-wrap;
		word-break: break-all;

		mark {
			padding: 0 1px;
			border-radius: 3px;
			color: inherit;
			&.hit-0 {
				background: rgba(22, 119, 255, 0.24);
			}
			&.hit-1 {
				background: rgba(249, 115, 22, 0.26);
			}
			&.hit-2 {
				background: rgba(16, 185, 129, 0.26);
			}
			&.hit-3 {
				background: rgba(168, 85, 247, 0.26);
			}
		}
	}
	.presets {
		display: flex;
		flex-flow: column;
		gap: 6px;
		max-height: 260px;
		overflow: auto;
		.preset {
			display: flex;
			flex-flow: column;
			align-items: flex-start;
			gap: 2px;
			padding: 6px 10px;
			border: 1px solid var(--border-color);
			border-radius: 8px;
			background: transparent;
			cursor: pointer;
			text-align: left;
			transition: all 0.15s;

			.pname {
				font-size: 12px;
				color: var(--text-color);
			}
			.pval {
				font-size: 11px;
				color: var(--text-color-3);
				word-break: break-all;
			}
			&:hover {
				border-color: #1677ff;
				background: rgba(22, 119, 255, 0.06);
			}
		}
	}
	.match-list {
		display: flex;
		flex-flow: column;
		gap: 6px;
		max-height: 300px;
		overflow: auto;
		.match-row {
			display: flex;
			gap: 8px;
			padding: 6px 8px;
			border-radius: 8px;
			background: rgba(127, 127, 127, 0.09);
			border: 1px solid var(--border-color);
			.idx {
				flex: none;
				width: 20px;
				height: 20px;
				border-radius: 50%;
				background: rgba(22, 119, 255, 0.12);
				color: #1677ff;
				font-size: 11px;
				display: flex;
				align-items: center;
				justify-content: center;
			}
			.match-main {
				min-width: 0;
				flex: 1;
			}
			.mtext {
				font-size: 12px;
				color: var(--text-color);
				word-break: break-all;
				white-space: pre-wrap;
			}
			.mmeta {
				display: flex;
				flex-wrap: wrap;
				gap: 4px 10px;
				margin-top: 2px;
				font-size: 11px;
				color: var(--text-color-3);
				.group {
					color: #10b981;
					word-break: break-all;
				}
			}
		}
	}
	.code {
		margin: 8px 0 0;
		padding: 8px 10px;
		background: rgba(127, 127, 127, 0.09);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		font-family: Consolas, Monaco, monospace;
		font-size: 12px;
		line-height: 1.7;
		color: var(--text-color);
		white-space: pre-wrap;
		word-break: break-all;
		max-height: 180px;
		overflow: auto;
	}
}
</style>
