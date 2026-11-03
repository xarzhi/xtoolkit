<template>
	<div class="tool pomodoro">
		<h1 class="tool-title">
			番茄时钟
			<span class="tip">专注 25 分钟 + 休息 5 分钟，按节奏推进；完成的番茄数与专注时长都记在本地</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<!-- 左：计时器 -->
				<div class="timer-col">
					<div class="tool-card timer-card">
						<div class="modes">
							<button
								v-for="m in MODES"
								:key="m.key"
								class="mode"
								:class="{ on: mode === m.key }"
								:style="mode === m.key ? { color: m.color, background: m.soft, borderColor: m.color } : null"
								@click="switchMode(m.key)"
							>
								{{ m.label }}
							</button>
						</div>

						<div class="dial">
							<svg viewBox="0 0 280 280" class="ring">
								<circle cx="140" cy="140" r="124" class="track" />
								<circle
									cx="140"
									cy="140"
									r="124"
									class="progress"
									:style="{
										stroke: current.color,
										strokeDasharray: `${circumference} ${circumference}`,
										strokeDashoffset: dashOffset,
									}"
								/>
							</svg>
							<div class="time-box">
								<div class="time" :style="{ color: current.color }">{{ display }}</div>
								<div class="phase">{{ running ? '进行中 · 按空格暂停' : current.hint }}</div>
								<div class="dots">
									<span
										v-for="i in settings.longEvery"
										:key="i"
										class="dot"
										:class="{ done: i <= cycleDone }"
										:style="i <= cycleDone ? { background: current.color, borderColor: current.color } : null"
									></span>
								</div>
							</div>
						</div>

						<div class="controls">
							<a-button type="primary" size="large" class="main-btn" :style="{ background: current.color, borderColor: current.color }" @click="toggle">
								{{ running ? '暂停' : mode === 'focus' ? '开始专注' : '开始休息' }}
							</a-button>
							<a-button size="large" :disabled="running && remainMs === totalMs" @click="reset">重置</a-button>
							<a-button size="large" @click="skip">跳过</a-button>
						</div>

						<a-input v-model:value="task" class="task-input" placeholder="这一轮专注做什么？（可留空）" allow-clear />
					</div>
				</div>

				<!-- 右：统计 + 设置 -->
				<div class="side-col">
					<div class="tool-card block">
						<div class="block-title">今日记录</div>
						<div class="stats">
							<div class="stat">
								<span class="num">{{ stats.completed }}</span>
								<span class="label">已完成番茄</span>
							</div>
							<div class="stat">
								<span class="num">{{ focusMinutes }}</span>
								<span class="label">专注分钟</span>
							</div>
						</div>
						<div class="progress-line">
							<div class="bar">
								<span class="fill" :style="{ width: `${Math.min(100, (cycleDone / settings.longEvery) * 100)}%`, background: current.color }"></span>
							</div>
							<span class="hint">再完成 {{ settings.longEvery - cycleDone }} 个番茄进入长休息</span>
						</div>
						<a-button size="small" type="text" style="margin-top: 8px; padding-left: 0" @click="resetStats">重置今日统计</a-button>
					</div>

					<div class="tool-card block">
						<div class="block-title">时长设置（分钟）</div>
						<div class="field">
							<span class="label">专注</span>
							<a-input-number v-model:value="settings.focus" :min="1" :max="120" :step="1" style="flex: 1" />
							<span class="label">短休息</span>
							<a-input-number v-model:value="settings.short" :min="1" :max="60" :step="1" style="flex: 1" />
						</div>
						<div class="field">
							<span class="label">长休息</span>
							<a-input-number v-model:value="settings.long" :min="1" :max="90" :step="1" style="flex: 1" />
							<span class="label">每</span>
							<a-input-number v-model:value="settings.longEvery" :min="2" :max="8" :step="1" style="width: 74px" />
							<span class="label">个一长休</span>
						</div>

						<div class="switch-row">
							<span class="label">自动开始下一轮</span>
							<a-switch v-model:checked="settings.autoNext" size="small" />
						</div>
						<div class="switch-row">
							<span class="label">结束提示音</span>
							<a-switch v-model:checked="settings.sound" size="small" />
						</div>
					</div>

					<div class="tool-card block tips">
						<div class="block-title">小提示</div>
						<div class="hint">· 空格键开始 / 暂停，R 键重置</div>
						<div class="hint">· 计时以内置时间戳计算，切到别的页面也不会走偏</div>
						<div class="hint">· 数据存在本地，第二天自动从 0 开始</div>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">{{ task ? `当前任务：${task}` : '还没有填写任务' }}</span>
			<a-space>
				<a-button @click="resetSettings">恢复默认设置</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'

const MODES = [
	{ key: 'focus', label: '专注', color: '#ef4444', soft: 'rgba(239, 68, 68, 0.1)', hint: '准备好就开始' },
	{ key: 'short', label: '短休息', color: '#22c55e', soft: 'rgba(34, 197, 94, 0.1)', hint: '起来活动一下' },
	{ key: 'long', label: '长休息', color: '#1677ff', soft: 'rgba(22, 119, 255, 0.1)', hint: '喝点水，走一走' },
]

const SETTINGS_KEY = 'xtools-pomodoro-settings'
const STATS_KEY = 'xtools-pomodoro-stats'
const DEFAULTS = { focus: 25, short: 5, long: 15, longEvery: 4, autoNext: true, sound: true }

const readJSON = (key, fallback) => {
	try {
		const raw = localStorage.getItem(key)
		return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback }
	} catch {
		return { ...fallback }
	}
}
const today = () => new Date().toLocaleDateString('zh-CN')

const settings = reactive(readJSON(SETTINGS_KEY, DEFAULTS))
const stats = reactive(readJSON(STATS_KEY, { date: today(), completed: 0, focusMs: 0 }))

const mode = ref('focus')
const running = ref(false)
const remainMs = ref(settings.focus * 60000)
const task = ref('')
const circumference = 2 * Math.PI * 124

let tickId = 0
let endAt = 0
let autoNextId = 0

const current = computed(() => MODES.find(m => m.key === mode.value) || MODES[0])
const durationOf = key => (key === 'focus' ? settings.focus : key === 'short' ? settings.short : settings.long)
const totalMs = computed(() => durationOf(mode.value) * 60000)
const display = computed(() => {
	const total = Math.max(0, Math.round(remainMs.value / 1000))
	const mm = String(Math.floor(total / 60)).padStart(2, '0')
	const ss = String(total % 60).padStart(2, '0')
	return `${mm}:${ss}`
})
// 环从满到空：剩余时间越少缺口越大，像沙漏一样直观
const dashOffset = computed(() => circumference * (1 - (remainingRatio.value || 0)))
const remainingRatio = computed(() => (totalMs.value ? Math.max(0, Math.min(1, remainMs.value / totalMs.value)) : 0))
const focusMinutes = computed(() => Math.round(stats.focusMs / 60000))
const cycleDone = computed(() => stats.completed % settings.longEvery)

/* ---------------- 计时 ---------------- */
const stopLoop = () => {
	if (tickId) clearInterval(tickId)
	tickId = 0
}

const loop = () => {
	stopLoop()
	tickId = window.setInterval(() => {
		const left = endAt - Date.now()
		remainMs.value = Math.max(0, left)
		if (left <= 0) finish()
	}, 200)
}

const start = () => {
	if (running.value) return
	if (remainMs.value <= 0) remainMs.value = totalMs.value
	running.value = true
	endAt = Date.now() + remainMs.value
	loop()
}

const pause = () => {
	if (!running.value) return
	remainMs.value = Math.max(0, endAt - Date.now())
	running.value = false
	stopLoop()
}

const toggle = () => (running.value ? pause() : start())

const reset = () => {
	running.value = false
	stopLoop()
	remainMs.value = totalMs.value
}

const switchMode = key => {
	running.value = false
	stopLoop()
	mode.value = key
	remainMs.value = durationOf(key) * 60000
}

/** 结束当前阶段后该进入哪个阶段 */
const nextMode = () => {
	if (mode.value === 'focus') {
		const done = stats.completed
		mode.value = done > 0 && done % settings.longEvery === 0 ? 'long' : 'short'
	} else {
		mode.value = 'focus'
	}
	remainMs.value = durationOf(mode.value) * 60000
}

const skip = () => {
	running.value = false
	stopLoop()
	if (mode.value !== 'focus') stats.completed += 0 // 跳过休息不额外计数
	nextMode()
	message.info(`已跳到「${current.value.label}」`)
}

const beep = () => {
	if (!settings.sound) return
	try {
		const Ctx = window.AudioContext || window.webkitAudioContext
		if (!Ctx) return
		const ctx = new Ctx()
		const base = ctx.currentTime
		;[0, 0.3, 0.6].forEach((offset, i) => {
			const osc = ctx.createOscillator()
			const gain = ctx.createGain()
			osc.type = 'sine'
			osc.frequency.value = i === 2 ? 990 : 660
			gain.gain.setValueAtTime(0.0001, base + offset)
			gain.gain.exponentialRampToValueAtTime(0.22, base + offset + 0.02)
			gain.gain.exponentialRampToValueAtTime(0.0001, base + offset + 0.22)
			osc.connect(gain)
			gain.connect(ctx.destination)
			osc.start(base + offset)
			osc.stop(base + offset + 0.24)
		})
		setTimeout(() => ctx.close().catch(() => {}), 1600)
	} catch {
		/* 音频不可用就静默跳过 */
	}
}

const finish = () => {
	const finished = mode.value
	stopLoop()
	running.value = false
	remainMs.value = 0
	beep()

	if (finished === 'focus') {
		stats.completed += 1
		stats.focusMs += durationOf('focus') * 60000
		message.success(`完成一个番茄${task.value ? `：「${task.value}」` : ''}，休息一下`)
	} else {
		message.info('休息结束，回来继续专注吧')
	}

	nextMode()
	if (settings.autoNext) {
		clearTimeout(autoNextId)
		autoNextId = window.setTimeout(() => {
			if (!running.value) start()
		}, 1500)
	}
}

const resetStats = () => {
	stats.completed = 0
	stats.focusMs = 0
	message.success('今日统计已清零')
}

const resetSettings = () => {
	Object.assign(settings, DEFAULTS)
	if (!running.value) remainMs.value = totalMs.value
	message.success('已恢复默认时长')
}

/* ---------------- 持久化 ---------------- */
watch(settings, () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)), { deep: true })
watch(stats, () => {
	stats.date = today()
	localStorage.setItem(STATS_KEY, JSON.stringify(stats))
}, { deep: true })

// 改时长时，未开始的一轮立即跟着变
watch(
	() => [settings.focus, settings.short, settings.long],
	() => {
		if (!running.value) remainMs.value = totalMs.value
	}
)

/* ---------------- 快捷键 ---------------- */
const onKeyDown = evt => {
	const tag = (evt.target?.tagName || '').toLowerCase()
	if (tag === 'input' || tag === 'textarea' || evt.target?.isContentEditable) return
	if (evt.code === 'Space') {
		evt.preventDefault()
		toggle()
		return
	}
	if (evt.key === 'r' || evt.key === 'R') {
		evt.preventDefault()
		reset()
	}
}

onMounted(() => {
	// 跨天自动清零
	if (stats.date !== today()) {
		stats.completed = 0
		stats.focusMs = 0
		stats.date = today()
	}
	remainMs.value = totalMs.value
	// 首次进入就把默认值落盘，之后改设置/统计会自动保存
	if (!localStorage.getItem(SETTINGS_KEY)) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
	if (!localStorage.getItem(STATS_KEY)) localStorage.setItem(STATS_KEY, JSON.stringify(stats))
	window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
	stopLoop()
	clearTimeout(autoNextId)
	window.removeEventListener('keydown', onKeyDown)
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.pomodoro {
	.layout {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.timer-col {
		flex: 1.2;
		min-width: 340px;
	}
	.side-col {
		flex: 1;
		min-width: 300px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.timer-card {
		display: flex;
		flex-flow: column;
		align-items: center;
		gap: 16px;
		padding: 20px 16px;
	}
	.modes {
		display: flex;
		gap: 8px;
		background: rgba(127, 127, 127, 0.09);
		padding: 4px;
		border-radius: 10px;
		.mode {
			border: 1px solid transparent;
			background: transparent;
			border-radius: 8px;
			padding: 5px 16px;
			font-size: 13px;
			cursor: pointer;
			color: var(--text-color-2);
			transition: all 0.15s;
			&:hover {
				color: var(--text-color);
			}
			&.on {
				font-weight: 600;
			}
		}
	}
	.dial {
		position: relative;
		width: min(280px, 60vh);
		aspect-ratio: 1;
		.ring {
			width: 100%;
			height: 100%;
			transform: rotate(-90deg);
		}
		.track {
			fill: none;
			stroke: rgba(127, 127, 127, 0.16);
			stroke-width: 14;
		}
		.progress {
			fill: none;
			stroke-width: 14;
			stroke-linecap: round;
			transition: stroke-dashoffset 0.2s linear;
		}
		.time-box {
			position: absolute;
			inset: 0;
			display: flex;
			flex-flow: column;
			align-items: center;
			justify-content: center;
			gap: 6px;
			pointer-events: none;
		}
		.time {
			font-size: 52px;
			font-weight: 700;
			line-height: 1;
			font-variant-numeric: tabular-nums;
			letter-spacing: 1px;
		}
		.phase {
			font-size: 12px;
			color: var(--text-color-2);
		}
		.dots {
			display: flex;
			gap: 8px;
			margin-top: 8px;
			.dot {
				width: 9px;
				height: 9px;
				border-radius: 50%;
				border: 1px solid rgba(127, 127, 127, 0.45);
				background: transparent;
				transition: all 0.2s;
			}
		}
	}
	.controls {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		justify-content: center;
		.main-btn {
			min-width: 120px;
		}
	}
	.task-input {
		max-width: 320px;
	}
	.block-title {
		font-weight: 600;
		color: var(--text-color);
		margin-bottom: 10px;
		font-size: 13px;
	}
	.stats {
		display: flex;
		gap: 10px;
		.stat {
			flex: 1;
			display: flex;
			flex-flow: column;
			gap: 2px;
			padding: 10px 12px;
			border-radius: 10px;
			background: rgba(127, 127, 127, 0.09);
			.num {
				font-size: 24px;
				font-weight: 700;
				color: var(--text-color);
				font-variant-numeric: tabular-nums;
				line-height: 1.2;
			}
			.label {
				font-size: 11px;
				color: var(--text-color-3);
			}
		}
	}
	.progress-line {
		margin-top: 10px;
		display: flex;
		flex-flow: column;
		gap: 6px;
		.bar {
			height: 6px;
			border-radius: 3px;
			background: rgba(127, 127, 127, 0.14);
			overflow: hidden;
			.fill {
				display: block;
				height: 100%;
				border-radius: 3px;
				transition: width 0.2s ease;
			}
		}
	}
	.field {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}
	.label {
		font-size: 12px;
		color: var(--text-color-3);
		white-space: nowrap;
	}
	.switch-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 0;
		border-top: 1px solid var(--border-color);
		&:first-of-type {
			margin-top: 4px;
		}
	}
	.tips {
		display: flex;
		flex-flow: column;
		gap: 6px;
	}
}
</style>
