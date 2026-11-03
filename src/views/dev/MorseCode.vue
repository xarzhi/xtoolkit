<template>
	<div class="tool morseCode">
		<h1 class="tool-title">
			摩斯密码编解码
			<span class="tip">文本与 . - 信号双向转换，支持字母、数字、常用标点，可试听节奏</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<div class="main-col">
					<div class="tool-card block">
						<div class="block-title">
							<a-radio-group v-model:value="direction" size="small" button-style="solid">
								<a-radio-button value="encode">文本 → 摩斯</a-radio-button>
								<a-radio-button value="decode">摩斯 → 文本</a-radio-button>
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
							:placeholder="direction === 'encode' ? '输入要转换的文字，例如：SOS HELP' : '输入摩斯信号，字母间用空格，单词间用 / ，例如：... --- ... / .... . .-.. .--.'"
							:spellcheck="false"
						/>
						<div class="row" style="margin-top: 10px">
							<span class="hint">{{ inputInfo }}</span>
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">
							转换结果
							<a-space style="margin-left: auto" :size="8">
								<a-button size="small" :disabled="!output" @click="copy(output)">复制</a-button>
								<a-button size="small" :disabled="!output" @click="swap">结果转回输入</a-button>
							</a-space>
						</div>
						<div class="output" :class="{ empty: !output }">{{ output || '（转换结果会显示在这里）' }}</div>
						<div v-if="warnings.length" class="warn-box">
							<div v-for="(item, index) in warnings" :key="index" class="warn-line">· {{ item }}</div>
						</div>
					</div>
				</div>

				<div class="side-col">
					<div class="tool-card block">
						<div class="block-title">分隔符</div>
						<div class="hint">
							输出格式：字母之间用空格分隔，单词之间用 <code>/</code> 分隔；这是国际通用的电报写法。
						</div>
						<div class="switch-row">
							<span class="label">单词分隔用斜杠</span>
							<a-switch v-model:checked="useSlash" size="small" />
						</div>
						<div class="hint" style="margin-top: 6px">
							{{ useSlash ? '示例：.... . .-.. .-.. --- / .-- --- .-. .-.. -..' : '示例：.... . .-.. .-.. ---   .-- --- .-. .-.. -..（连用两个空格分词）' }}
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">试听</div>
						<div class="row">
							<span class="label">速度</span>
							<a-slider v-model:value="wpm" :min="5" :max="30" :step="1" class="slider" />
							<span class="hint value">{{ wpm }} WPM</span>
						</div>
						<div class="row" style="margin-top: 8px">
							<a-button size="small" :disabled="!morsePlayable || playing" @click="play">
								{{ playing ? '播放中…' : '播放信号' }}
							</a-button>
							<a-button size="small" :disabled="!playing" @click="stop">停止</a-button>
						</div>
						<div class="hint" style="margin-top: 8px">按国际标准：点 1 个单位、划 3 个单位，符号间停 1 个、字母间停 3 个、单词间停 7 个</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">对照表</div>
						<div class="table-wrap">
							<div class="code-item" v-for="item in TABLE_LIST" :key="item.char">
								<span class="ch">{{ item.char }}</span>
								<span class="code">{{ item.code }}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">中文、emoji 没有对应的摩斯码，会被跳过并提示</span>
			<a-space>
				<a-button @click="swap" :disabled="!output">结果转回输入</a-button>
				<a-button type="primary" :disabled="!output" @click="copy(output)">复制结果</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { copyText, friendlyError } from '@/utils/tauriIO'

/** 国际摩斯码表 */
const MORSE = {
	A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
	I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
	Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
	Y: '-.--', Z: '--..',
	0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
	5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
	'.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
	'/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
	';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', _: '..--.-',
	'"': '.-..-.', $: '...-..-', '@': '.--.-.',
}

const CHAR_TO_MORSE = MORSE
const MORSE_TO_CHAR = Object.fromEntries(Object.entries(MORSE).map(([ch, code]) => [code, ch]))
const TABLE_LIST = Object.entries(MORSE).map(([char, code]) => ({ char, code }))

const direction = ref('encode')
const input = ref('SOS HELP')
const wpm = ref(15)
const useSlash = ref(true)
const playing = ref(false)

const warnings = ref([])

/* ---------------- 转换 ---------------- */

const encode = text => {
	const skipped = new Set()
	const words = String(text).trim().split(/\s+/).filter(Boolean)
	const encoded = words.map(word => {
		const codes = []
		for (const char of word.toUpperCase()) {
			const code = CHAR_TO_MORSE[char]
			if (code) codes.push(code)
			else skipped.add(char)
		}
		return codes.join(' ')
	}).filter(Boolean)
	return { text: encoded.join(useSlash.value ? ' / ' : '   '), skipped: [...skipped] }
}

const decode = text => {
	const raw = String(text).trim()
	if (!raw) return { text: '', skipped: [] }
	const unknown = new Set()
	// 兼容 | ｜ 等手写分隔，统一成 /；换行同样视为单词分隔（否则多行会粘成一个词）
	const normalized = raw.replace(/[|｜\r\n]+/g, '/').replace(/\/{2,}/g, '/')
	const words = normalized.split('/')
	const decoded = words.map(word => {
		const chars = word.trim().split(/\s+/).filter(Boolean)
		return chars.map(code => {
			const normalizedCode = code.replace(/[·•＊*_]/g, ch => (ch === '·' || ch === '•' ? '.' : '-'))
			const char = MORSE_TO_CHAR[normalizedCode]
			if (char) return char
			unknown.add(code)
			return '?'
		}).join('')
	}).filter(Boolean)
	return { text: decoded.join(' '), skipped: [...unknown] }
}

const result = computed(() => (direction.value === 'encode' ? encode(input.value) : decode(input.value)))
const output = computed(() => result.value.text)

const inputInfo = computed(() => {
	const text = input.value
	if (!text.trim()) return '等待输入'
	if (direction.value === 'encode') {
		const letters = [...text].filter(ch => CHAR_TO_MORSE[ch.toUpperCase()]).length
		return `共 ${[...text].length} 个字符，其中 ${letters} 个可编码`
	}
	const symbols = (text.match(/[./\-]/g) || []).length
	return `共 ${symbols} 个信号符号`
})

const morsePlayable = computed(() => (direction.value === 'encode' ? output.value : input.value))

watch(result, value => {
	warnings.value = value.skipped.length
		? [
				direction.value === 'encode'
					? `以下字符没有摩斯码，已跳过：${value.skipped.join(' ')}`
					: `以下信号无法识别，已用 ? 代替：${value.skipped.join(' ')}`,
			]
		: []
})

/* ---------------- 播放 ---------------- */

let audioCtx = null
let nodes = []
let stopTimer = 0

const stop = () => {
	nodes.forEach(node => {
		try {
			node.stop()
		} catch {
			/* 已停止 */
		}
	})
	nodes = []
	playing.value = false
	if (stopTimer) clearTimeout(stopTimer)
	stopTimer = 0
}

const play = () => {
	const signal = String(morsePlayable.value || '').trim()
	if (!signal) return
	stop()
	const Ctor = window.AudioContext || window.webkitAudioContext
	if (!Ctor) {
		message.error('当前环境不支持音频播放')
		return
	}
	if (!audioCtx) audioCtx = new Ctor()
	if (audioCtx.state === 'suspended') audioCtx.resume()

	const unit = 1.2 / wpm.value // 点长（秒），PARIS 标准
	let t = audioCtx.currentTime + 0.08
	const gain = audioCtx.createGain()
	gain.gain.value = 0
	gain.connect(audioCtx.destination)

	const beep = duration => {
		const osc = audioCtx.createOscillator()
		osc.type = 'sine'
		osc.frequency.value = 640
		osc.connect(gain)
		osc.start(t)
		osc.stop(t + duration)
		nodes.push(osc)
		// 简单包络，避免爆音
		gain.gain.setValueAtTime(0, t)
		gain.gain.linearRampToValueAtTime(0.35, t + 0.005)
		gain.gain.setValueAtTime(0.35, t + duration - 0.005)
		gain.gain.linearRampToValueAtTime(0, t + duration)
		t += duration
	}

	const gap = duration => {
		t += duration
	}

	for (const char of signal) {
		if (char === '.') {
			beep(unit)
			gap(unit)
		} else if (char === '-') {
			beep(unit * 3)
			gap(unit)
		} else if (char === ' ') {
			// 连续空格视为分词，这里只补到字母间隔
			gap(unit * 2)
		} else if (char === '/') {
			gap(unit * 4)
		}
	}

	playing.value = true
	const total = Math.max(0, t - audioCtx.currentTime) * 1000 + 120
	stopTimer = window.setTimeout(() => {
		playing.value = false
		stopTimer = 0
	}, total)
}

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
	direction.value = direction.value === 'encode' ? 'decode' : 'encode'
}

const loadSample = () => {
	input.value = direction.value === 'encode' ? 'SOS HELP ME' : '... --- ... / .... . .-.. .--. / -- .'
}

onBeforeUnmount(stop)

if (import.meta.env.DEV) {
	window.__morseTest = {
		setDirection: value => {
			direction.value = value
		},
		setInput: value => {
			input.value = value
		},
		state: () => ({ output: output.value, warnings: warnings.value }),
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.morseCode {
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
	}
	.mono {
		font-family: Consolas, Monaco, 'Courier New', monospace;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.label {
		font-size: 12px;
		color: var(--text-color-3);
		white-space: nowrap;
	}
	.slider {
		flex: 1;
		min-width: 90px;
		margin: 0 4px;
	}
	.value {
		width: 62px;
		text-align: right;
		white-space: nowrap;
	}
	.output {
		min-height: 88px;
		padding: 12px 14px;
		border-radius: 10px;
		background: rgba(127, 127, 127, 0.07);
		font-family: Consolas, Monaco, monospace;
		font-size: 15px;
		line-height: 1.9;
		letter-spacing: 1px;
		color: #1677ff;
		word-break: break-word;
		white-space: pre-wrap;
		&.empty {
			color: var(--text-color-3);
			letter-spacing: 0;
			font-family: inherit;
			font-size: 13px;
		}
	}
	.warn-box {
		margin-top: 10px;
		padding: 8px 12px;
		border-radius: 8px;
		background: rgba(250, 173, 20, 0.12);
		.warn-line {
			font-size: 12px;
			line-height: 1.8;
			color: #d48806;
		}
	}
	.switch-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 10px;
		margin-top: 8px;
		border-top: 1px solid var(--border-color);
	}
	.table-wrap {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 4px 8px;
		max-height: 240px;
		overflow: auto;
	}
	.code-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: Consolas, Monaco, monospace;
		font-size: 12px;
		.ch {
			flex: none;
			width: 14px;
			font-weight: 700;
			color: var(--text-color);
		}
		.code {
			color: #1677ff;
			letter-spacing: 0.5px;
		}
	}
	code {
		font-family: Consolas, Monaco, monospace;
	}
	.hint {
		line-height: 1.7;
	}
}
</style>
