<template>
	<div class="tool unicodeCodec">
		<h1 class="tool-title">
			Unicode 编解码
			<span class="tip">JS 转义 / HTML 实体 / U+ / %u 多种写法互转，emoji 等增补字符也正确</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<div class="main-col">
					<div class="tool-card block">
						<div class="block-title">
							<a-radio-group v-model:value="mode" size="small" button-style="solid">
								<a-radio-button value="encode">编码</a-radio-button>
								<a-radio-button value="decode">解码</a-radio-button>
							</a-radio-group>
							<a-space style="margin-left: auto" :size="8">
								<a-button size="small" @click="loadSample">载入示例</a-button>
								<a-button size="small" @click="input = ''">清空</a-button>
							</a-space>
						</div>

						<a-textarea
							v-model:value="input"
							class="mono"
							:rows="6"
							:placeholder="mode === 'encode' ? '输入要编码的文字，例如：你好 world' : '粘贴任意 Unicode 转义写法，例如：\\u4F60\\u597D &#x4E16;&#x754C;'"
							:spellcheck="false"
						/>

						<template v-if="mode === 'encode'">
							<div class="row" style="margin-top: 10px">
								<span class="label">输出格式</span>
								<a-select v-model:value="format" :options="FORMAT_OPTIONS" style="width: 210px" />
								<a-checkbox v-model:checked="escapeAll">全部转义（含 ASCII）</a-checkbox>
							</div>
							<div class="hint" style="margin-top: 6px">{{ formatHint }}</div>
						</template>
						<div v-else class="hint" style="margin-top: 8px">
							支持 \uXXXX、\u{XXXXX}、%uXXXX、&#xXXXX;、&#NNNN;、U+XXXX、\xXX 混写，自动识别无需选项。
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">
							结果
							<a-space style="margin-left: auto" :size="8">
								<a-button size="small" :disabled="!output" @click="copy(output)">复制</a-button>
								<a-button size="small" :disabled="!output" @click="swap">结果转回输入</a-button>
							</a-space>
						</div>
						<div class="output mono">{{ output || '（结果会显示在这里）' }}</div>
						<div class="stats">
							<span>{{ codePointCount }} 个字符</span>
							<span>UTF-16 长度 {{ charCount }}</span>
							<span>{{ byteCount }} 字节 UTF-8</span>
						</div>
					</div>
				</div>

				<div class="side-col">
					<div class="tool-card block">
						<div class="block-title">字符明细 <span class="count">{{ detailList.length }}</span></div>
						<div class="detail-wrap">
							<div class="detail-row" v-for="(item, index) in detailList" :key="index">
								<span class="ch">{{ item.char }}</span>
								<span class="cp mono">{{ item.code }}</span>
								<span class="utf mono">{{ item.utf8 }}</span>
							</div>
							<div v-if="!detailList.length" class="hint">还没有输入内容</div>
						</div>
						<div v-if="codePointCount > detailList.length" class="hint" style="margin-top: 6px">
							仅显示前 {{ detailList.length }} 个
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">格式说明</div>
						<div class="hint">· <code>\uXXXX</code>：JavaScript / Java / C# 常见写法，增补字符拆成代理对</div>
						<div class="hint">· <code>&amp;#xXXXX;</code>：HTML 十六进制实体，增补字符可直接写完整码点</div>
						<div class="hint">· <code>&amp;#NNNN;</code>：HTML 十进制实体</div>
						<div class="hint">· <code>U+XXXX</code>：Unicode 标准记法，常见于文档与字体</div>
						<div class="hint">· <code>%uXXXX</code>：老式 JS escape() 写法，多用于历史数据</div>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">编码时仅转义非 ASCII（中文、emoji 等），ASCII 保持可读</span>
			<a-space>
				<a-button @click="swap" :disabled="!output">结果转回输入</a-button>
				<a-button type="primary" :disabled="!output" @click="copy(output)">复制结果</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import { copyText, friendlyError } from '@/utils/tauriIO'

const FORMAT_OPTIONS = [
	{ label: '\\uXXXX（JS 转义）', value: 'js' },
	{ label: '&#xXXXX;（HTML 十六进制）', value: 'html' },
	{ label: '&#NNNN;（HTML 十进制）', value: 'htmlDec' },
	{ label: 'U+XXXX（Unicode 标准）', value: 'uplus' },
	{ label: '%uXXXX（老式 escape）', value: 'escape' },
]

const FORMAT_HINTS = {
	js: '\\u4F60\\u597D，增补字符（emoji）会拆成两个代理对，例如 \\uD83D\\uDE00',
	html: '&#x4F60;，增补字符直接写完整码点，例如 &#x1F600;，可放在网页源码里',
	htmlDec: '&#20320;，十进制写法，兼容性最好',
	uplus: 'U+4F60，加空格分隔更接近文档写法',
	escape: '%u4F60，老式 escape() 输出，仅供还原历史数据',
}

const mode = ref('encode')
const format = ref('js')
const escapeAll = ref(false)
const input = ref('你好，World 👋')

const formatHint = computed(() => FORMAT_HINTS[format.value] || '')

/* ---------------- 编码 ---------------- */

const hex = (value, pad = 4) => value.toString(16).toUpperCase().padStart(pad, '0')

const encodeChar = (char, cp) => {
	switch (format.value) {
		case 'js': {
			if (cp > 0xffff) {
				const high = 0xd800 + ((cp - 0x10000) >> 10)
				const low = 0xdc00 + ((cp - 0x10000) & 0x3ff)
				return `\\u${hex(high)}\\u${hex(low)}`
			}
			return `\\u${hex(cp)}`
		}
		case 'escape': {
			if (cp > 0xffff) {
				const high = 0xd800 + ((cp - 0x10000) >> 10)
				const low = 0xdc00 + ((cp - 0x10000) & 0x3ff)
				return `%u${hex(high)}%u${hex(low)}`
			}
			return `%u${hex(cp)}`
		}
		case 'html':
			return `&#x${hex(cp)};`
		case 'htmlDec':
			return `&#${cp};`
		case 'uplus':
			return `U+${hex(cp)}`
		default:
			return char
	}
}

const encodeText = text => {
	if (!text) return ''
	let out = ''
	for (const char of text) {
		const cp = char.codePointAt(0)
		// 换行始终保留，否则结果挤成一行没法看
		if (char === '\n') {
			out += '\n'
			continue
		}
		const plainAscii = cp >= 0x20 && cp <= 0x7e
		if (!escapeAll.value && plainAscii) {
			out += char
			continue
		}
		out += encodeChar(char, cp)
	}
	return out
}

/* ---------------- 解码 ---------------- */

const DECODE_RE = /\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|%u([0-9a-fA-F]{4})|&#x([0-9a-fA-F]{1,6});|&#(\d{1,7});|U\+([0-9a-fA-F]{4,6})|\\x([0-9a-fA-F]{2})/g

const decodeText = text => {
	if (!text) return ''
	return text.replace(DECODE_RE, (whole, braced, jsHex, escHex, htmlHex, htmlDec, uplus, xHex) => {
		const hexValue = braced || jsHex || escHex || htmlHex || uplus || xHex
		const cp = hexValue ? parseInt(hexValue, 16) : Number(htmlDec)
		if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return whole
		try {
			return String.fromCodePoint(cp)
		} catch {
			return whole
		}
	})
}

const output = computed(() => (mode.value === 'encode' ? encodeText(input.value) : decodeText(input.value)))

/* ---------------- 统计 ---------------- */

const charCount = computed(() => input.value.length)
const codePointCount = computed(() => [...input.value].length)
const byteCount = computed(() => new TextEncoder().encode(input.value).length)

const toUtf8Hex = cp => {
	const bytes = new TextEncoder().encode(String.fromCodePoint(cp))
	return [...bytes].map(b => hex(b, 2)).join(' ')
}

const detailList = computed(() => {
	const list = []
	for (const char of input.value) {
		if (char === '\n') continue
		const cp = char.codePointAt(0)
		list.push({
			char,
			code: `U+${hex(cp)}`,
			utf8: toUtf8Hex(cp),
		})
		if (list.length >= 60) break
	}
	return list
})

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

const swap = () => {
	if (!output.value) return
	input.value = output.value
	mode.value = mode.value === 'encode' ? 'decode' : 'encode'
}

const loadSample = () => {
	input.value = mode.value === 'encode' ? '你好，World 👋' : '\\u4F60\\u597D &#x4E16;&#x754C; \\uD83D\\uDE00 U+4F60'
}

if (import.meta.env.DEV) {
	window.__unicodeTest = {
		setMode: value => {
			mode.value = value
		},
		setFormat: value => {
			format.value = value
		},
		setAll: value => {
			escapeAll.value = value
		},
		setInput: value => {
			input.value = value
		},
		state: () => ({ output: output.value, codePoints: codePointCount.value }),
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.unicodeCodec {
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
			background: rgba(22, 119, 255, 0.12);
			color: #1677ff;
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
	.label {
		font-size: 12px;
		color: var(--text-color-3);
	}
	.output {
		min-height: 92px;
		padding: 12px 14px;
		border-radius: 10px;
		background: rgba(127, 127, 127, 0.07);
		font-size: 14px;
		line-height: 1.9;
		color: #1677ff;
		word-break: break-all;
		white-space: pre-wrap;
	}
	.stats {
		display: flex;
		gap: 16px;
		margin-top: 10px;
		font-size: 12px;
		color: var(--text-color-3);
	}
	.detail-wrap {
		max-height: 300px;
		overflow: auto;
	}
	.detail-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 3px 0;
		font-size: 12px;
		& + .detail-row {
			border-top: 1px dashed var(--border-color);
		}
		.ch {
			flex: none;
			width: 22px;
			font-size: 15px;
			text-align: center;
			color: var(--text-color);
		}
		.cp {
			flex: none;
			width: 74px;
			color: #1677ff;
		}
		.utf {
			color: var(--text-color-3);
			letter-spacing: 0.5px;
		}
	}
	code {
		font-family: Consolas, Monaco, monospace;
		font-size: 12px;
		padding: 0 4px;
		border-radius: 4px;
		background: rgba(127, 127, 127, 0.12);
	}
	.hint {
		line-height: 1.8;
	}
}
</style>
