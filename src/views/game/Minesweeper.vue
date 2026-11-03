<template>
	<div class="tool minesweeper">
		<h1 class="tool-title">
			扫雷
			<span class="tip">左键翻开、右键插旗；数字是周围 8 格的雷数，首次点击一定安全</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<div class="board-col">
					<div class="tool-card board-card">
						<div class="hud">
							<div class="hud-item">
								<span class="k">剩余雷数</span>
								<span class="v" :class="{ danger: mineLeft < 0 }">{{ String(mineLeft).padStart(3, '0') }}</span>
							</div>

							<button class="face" :class="faceState" title="重新开始（R）" @click="newGame">
								<svg viewBox="0 0 24 24" aria-hidden="true">
									<circle class="face-bg" cx="12" cy="12" r="10.5" />
									<template v-if="faceState === 'won'">
										<path class="face-line" d="M6.6 9.4h4.2M13.2 9.4h4.2M8.6 9.4v2.2h2.2v-2.2M13.2 9.4v2.2h2.2v-2.2" />
										<path class="face-line" d="M8 14.6q4 3.6 8 0" />
									</template>
									<template v-else-if="faceState === 'lost'">
										<path class="face-line" d="M8.2 8.8l2.4 2.4M10.6 8.8l-2.4 2.4M13.4 8.8l2.4 2.4M15.8 8.8l-2.4 2.4" />
										<path class="face-line" d="M8.4 16.4q3.6-3.4 7.2 0" />
									</template>
									<template v-else>
										<circle class="face-dot" cx="9" cy="9.7" r="1.35" />
										<circle class="face-dot" cx="15" cy="9.7" r="1.35" />
										<path class="face-line" d="M8 14.3q4 3.7 8 0" />
									</template>
								</svg>
							</button>

							<div class="hud-item">
								<span class="k">用时</span>
								<span class="v">{{ timeText }}</span>
							</div>
						</div>

						<div class="board-wrap">
							<div class="board-scroll">
								<div
									ref="boardBox"
									class="board"
									:style="boardStyle"
									@contextmenu.prevent
									@mouseleave="hovered = -1"
								>
									<button
										v-for="(cell, index) in cells"
										:key="index"
										type="button"
										class="cell"
										:class="cellClass(cell, index)"
										@click="onLeftClick(index)"
										@contextmenu.prevent="onRightClick(index)"
										@dblclick="chord(index)"
										@mousedown.middle.prevent="chord(index)"
										@mouseenter="hovered = index"
									>
										<svg v-if="cell.revealed && cell.mine" class="ico mine" viewBox="0 0 24 24">
											<circle cx="12" cy="12" r="6.1" />
											<path d="M12 2.4v3.1M12 18.5v3.1M2.4 12h3.1M18.5 12h3.1M5.2 5.2l2.2 2.2M16.6 16.6l2.2 2.2M18.8 5.2l-2.2 2.2M7.4 16.6l-2.2 2.2" />
										</svg>
										<svg v-else-if="cell.wrong" class="ico wrong" viewBox="0 0 24 24">
											<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
										</svg>
										<svg v-else-if="cell.flagged" class="ico flag" viewBox="0 0 24 24">
											<path class="pole" d="M8.6 20.2h6.8M10.6 20.2V5.6" />
											<path class="cloth" d="M10.6 6.2l7.2 2.7-7.2 2.7z" />
										</svg>
										<span v-else-if="cell.revealed && cell.adjacent > 0" class="num">{{ cell.adjacent }}</span>
									</button>
								</div>
							</div>

							<div v-if="state === 'won'" class="overlay">
								<div class="big">清完了！</div>
								<div class="hint">用时 {{ timeText }} 秒{{ isNewRecord ? ' · 新纪录' : '' }}</div>
								<a-button type="primary" size="large" @click="newGame">再来一局</a-button>
							</div>
							<div v-else-if="state === 'lost'" class="overlay">
								<div class="big">踩到雷了</div>
								<div class="hint">剩 {{ mineLeft }} 颗雷没标 · 按 R 或点笑脸重来</div>
								<a-button type="primary" size="large" @click="newGame">重新开始</a-button>
							</div>
						</div>

						<div class="board-hint">
							{{
								state === 'ready'
									? '点任意一格开局，第一下不会踩雷'
									: state === 'playing'
										? '双击已翻开的数字可快速展开周围，前提是旗子插对了'
										: '换一档难度或者再来一局'
							}}
						</div>
					</div>
				</div>

				<div class="side-col">
					<div class="tool-card block">
						<div class="block-title">难度</div>
						<a-radio-group v-model:value="level" button-style="solid" @change="newGame">
							<a-radio-button v-for="item in LEVELS" :key="item.value" :value="item.value">
								{{ item.label }}
							</a-radio-button>
						</a-radio-group>
						<div class="hint" style="margin-top: 8px">
							{{ currentLevel.label }}：{{ cols }} × {{ rows }}，{{ mineCount }} 颗雷
						</div>

						<div v-if="level === 'custom'" class="custom-box">
							<div class="custom-row">
								<span class="label">列数</span>
								<a-input-number v-model:value="custom.cols" :min="5" :max="40" size="small" @change="onCustomChange" />
							</div>
							<div class="custom-row">
								<span class="label">行数</span>
								<a-input-number v-model:value="custom.rows" :min="5" :max="30" size="small" @change="onCustomChange" />
							</div>
							<div class="custom-row">
								<span class="label">雷数</span>
								<a-input-number
									v-model:value="custom.mines"
									:min="1"
									:max="Math.max(1, cols * rows - 9)"
									size="small"
									@change="onCustomChange"
								/>
							</div>
						</div>

						<div class="switch-row">
							<span class="label">标旗模式（左键即插旗，触屏用）</span>
							<a-switch v-model:checked="flagMode" size="small" />
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">操作</div>
						<div class="op-row">
							<a-button block @click="newGame">重新开始</a-button>
							<a-button block :disabled="!canHint" @click="hint">提示一格</a-button>
						</div>
						<div class="hint" style="margin-top: 8px">
							提示会给一个能确定的安全格；剩 {{ hintsLeft }} 次
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">各难度最佳</div>
						<div class="best-list">
							<div
								v-for="item in LEVELS.filter(entry => entry.value !== 'custom')"
								:key="item.value"
								class="best-row"
								:class="{ active: level === item.value }"
							>
								<span class="name">{{ item.label }} · {{ item.cols }}×{{ item.rows }}</span>
								<span class="score">{{ bestMap[item.value] ? `${bestMap[item.value]} 秒` : '—' }}</span>
							</div>
						</div>
						<a-button size="small" type="link" danger :disabled="!hasBest" @click="clearBest">清除记录</a-button>
					</div>

					<div class="tool-card block">
						<div class="block-title">玩法</div>
						<div class="hint">· 左键翻开，右键插旗；数字表示周围 8 格的雷数</div>
						<div class="hint">· 首次点击的九宫格内不会布雷，开局不会秒死</div>
						<div class="hint">· 已翻开数字周围的旗数等于该数字时，双击它可一次展开</div>
						<div class="hint">· 翻开的空白格会自动带出一整片相连区域</div>
						<div class="hint">· 快捷键：方向键选格、空格翻开、F 插旗、X 展开、R 重开</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">本局</div>
						<div class="bar">
							<span class="fill" :style="{ width: `${progress}%` }"></span>
						</div>
						<div class="hint" style="margin-top: 6px">
							已翻开 {{ revealedCount }} / {{ cols * rows - mineCount }} 格 · 插旗 {{ flagCount }} 面
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">{{ footerHint }}</span>
			<a-space>
				<a-button @click="toggleFlagMode">{{ flagMode ? '退出标旗模式' : '标旗模式' }}</a-button>
				<a-button type="primary" @click="newGame">重新开始</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'

const LEVELS = [
	{ value: 'beginner', label: '初级', cols: 9, rows: 9, mines: 10 },
	{ value: 'intermediate', label: '中级', cols: 16, rows: 16, mines: 40 },
	{ value: 'expert', label: '高级', cols: 30, rows: 16, mines: 99 },
	{ value: 'custom', label: '自定义', cols: 16, rows: 16, mines: 40 },
]

const BEST_KEY = 'xtools-minesweeper-best-v1'

const level = ref('beginner')
const custom = reactive({ cols: 16, rows: 16, mines: 40 })
/** ready 未开局 / playing 进行中 / won 通关 / lost 踩雷 */
const state = ref('ready')
const cells = ref([])
const elapsed = ref(0)
const flagCount = ref(0)
const revealedCount = ref(0)
const explodedIndex = ref(-1)
const planted = ref(false)
const hintsLeft = ref(3)
const flagMode = ref(false)
const isNewRecord = ref(false)
const hovered = ref(-1)
const cursor = ref(0)
/** 光标框只在用过键盘后才显示，避免开局就有一个蓝框挂在第一格上 */
const keyboardActive = ref(false)
const bestMap = ref({})
const boardBox = ref(null)
const cellSize = ref(28)

let timerId = 0
let observer = null

/* ---------------- 难度 ---------------- */

const currentLevel = computed(() => LEVELS.find(item => item.value === level.value) || LEVELS[0])

const cols = computed(() => {
	const raw = level.value === 'custom' ? Number(custom.cols) : currentLevel.value.cols
	return Math.max(5, Math.min(40, Math.round(raw) || 9))
})

const rows = computed(() => {
	const raw = level.value === 'custom' ? Number(custom.rows) : currentLevel.value.rows
	return Math.max(5, Math.min(30, Math.round(raw) || 9))
})

const mineCount = computed(() => {
	const max = Math.max(1, cols.value * rows.value - 9)
	const raw = level.value === 'custom' ? Number(custom.mines) : currentLevel.value.mines
	return Math.max(1, Math.min(max, Math.round(raw) || 10))
})

const mineLeft = computed(() => mineCount.value - flagCount.value)
const timeText = computed(() => String(Math.min(999, elapsed.value)).padStart(3, '0'))
const faceState = computed(() => (state.value === 'lost' ? 'lost' : state.value === 'won' ? 'won' : 'playing'))
const totalSafe = computed(() => cols.value * rows.value - mineCount.value)
const progress = computed(() => (totalSafe.value ? Math.min(100, (revealedCount.value / totalSafe.value) * 100) : 0))
const canHint = computed(() => state.value !== 'won' && state.value !== 'lost' && hintsLeft.value > 0)
const hasBest = computed(() => Object.keys(bestMap.value).length > 0)
const footerHint = computed(() => {
	if (state.value === 'won') return '这一局很干净，试试高级的 30 × 16 吧'
	if (state.value === 'lost') return '踩雷是常事，注意别在没把握的格子上一口气双击'
	return '别急着插旗，先把必定的安全格摊开'
})

const boardStyle = computed(() => ({
	'--cell': `${cellSize.value}px`,
	gridTemplateColumns: `repeat(${cols.value}, ${cellSize.value}px)`,
	// 宽度要算上 gap(1px) 与 padding(4px×2)，否则格子会顶出容器
	width: `${cols.value * cellSize.value + (cols.value - 1) + 8}px`,
}))

/* ---------------- 棋盘数据 ---------------- */

const makeCell = () => ({ mine: false, adjacent: 0, revealed: false, flagged: false, wrong: false })

const neighbors = index => {
	const x = index % cols.value
	const y = Math.floor(index / cols.value)
	const out = []
	for (let dy = -1; dy <= 1; dy += 1) {
		for (let dx = -1; dx <= 1; dx += 1) {
			if (dx === 0 && dy === 0) continue
			const nx = x + dx
			const ny = y + dy
			if (nx < 0 || ny < 0 || nx >= cols.value || ny >= rows.value) continue
			out.push(ny * cols.value + nx)
		}
	}
	return out
}

const shuffled = list => {
	const arr = list.slice()
	for (let i = arr.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1))
		const temp = arr[i]
		arr[i] = arr[j]
		arr[j] = temp
	}
	return arr
}

/** 第一次翻开时才布雷，并保证起点九宫格内无雷 */
const plantMines = safeIndex => {
	const list = cells.value
	const total = list.length
	const safe = new Set([safeIndex, ...neighbors(safeIndex)])
	let pool = []
	for (let i = 0; i < total; i += 1) if (!safe.has(i)) pool.push(i)
	// 雷太多塞不下九宫格时，退化成只保证起点本身安全
	if (pool.length < mineCount.value) {
		pool = []
		for (let i = 0; i < total; i += 1) if (i !== safeIndex) pool.push(i)
	}
	for (const index of shuffled(pool).slice(0, mineCount.value)) list[index].mine = true
	for (let i = 0; i < total; i += 1) {
		if (list[i].mine) {
			list[i].adjacent = 0
			continue
		}
		let count = 0
		for (const n of neighbors(i)) if (list[n].mine) count += 1
		list[i].adjacent = count
	}
	planted.value = true
}

/** 翻开一格；相邻雷数为 0 时向外扩散 */
const flood = start => {
	const list = cells.value
	const stack = [start]
	while (stack.length) {
		const index = stack.pop()
		const cell = list[index]
		if (!cell || cell.revealed || cell.flagged) continue
		cell.revealed = true
		revealedCount.value += 1
		if (cell.adjacent === 0 && !cell.mine) {
			for (const n of neighbors(index)) {
				const next = list[n]
				if (next && !next.revealed && !next.flagged && !next.mine) stack.push(n)
			}
		}
	}
}

/* ---------------- 计时与成绩 ---------------- */

const startTimer = () => {
	if (timerId) return
	timerId = window.setInterval(() => {
		elapsed.value = Math.min(999, elapsed.value + 1)
	}, 1000)
}

const stopTimer = () => {
	if (!timerId) return
	window.clearInterval(timerId)
	timerId = 0
}

const loadBest = () => {
	try {
		const raw = localStorage.getItem(BEST_KEY)
		const parsed = raw ? JSON.parse(raw) : null
		if (!parsed || typeof parsed !== 'object') return
		const next = {}
		for (const item of LEVELS) {
			const value = Number(parsed[item.value])
			if (Number.isFinite(value) && value > 0) next[item.value] = Math.round(value)
		}
		bestMap.value = next
	} catch {
		/* 隐私模式下读不到就算了 */
	}
}

const saveBest = () => {
	try {
		localStorage.setItem(BEST_KEY, JSON.stringify(bestMap.value))
	} catch {
		/* 忽略 */
	}
}

const recordBest = () => {
	isNewRecord.value = false
	if (level.value === 'custom') return
	// 存 1 秒起，避免 0 秒记录在读取时被判为无效
	const seconds = Math.max(1, elapsed.value)
	const key = level.value
	const best = bestMap.value[key]
	if (best && best <= seconds) return
	bestMap.value = { ...bestMap.value, [key]: seconds }
	isNewRecord.value = true
	saveBest()
}

const clearBest = () => {
	bestMap.value = {}
	saveBest()
	message.success('记录已清除')
}

/* ---------------- 游戏流程 ---------------- */

const checkWin = () => {
	if (revealedCount.value < totalSafe.value) return
	if (state.value === 'won') return
	state.value = 'won'
	stopTimer()
	// 通关后把剩下的雷自动插上旗，画面更整齐
	let flags = 0
	for (const cell of cells.value) {
		if (cell.mine) {
			cell.flagged = true
			flags += 1
		}
	}
	flagCount.value = flags
	recordBest()
}

const lose = index => {
	if (state.value === 'lost') return
	state.value = 'lost'
	explodedIndex.value = index
	stopTimer()
	const list = cells.value
	for (let i = 0; i < list.length; i += 1) {
		const cell = list[i]
		if (cell.mine && !cell.flagged) cell.revealed = true
		if (!cell.mine && cell.flagged) cell.wrong = true
	}
	if (list[index]) {
		list[index].exploded = true
		list[index].revealed = true
	}
}

const openCell = index => {
	if (state.value === 'won' || state.value === 'lost') return
	const cell = cells.value[index]
	if (!cell || cell.revealed || cell.flagged) return
	if (!planted.value) {
		plantMines(index)
		state.value = 'playing'
		startTimer()
	}
	if (cell.mine) {
		lose(index)
		return
	}
	flood(index)
	checkWin()
}

const toggleFlag = index => {
	if (state.value === 'won' || state.value === 'lost') return
	const cell = cells.value[index]
	if (!cell || cell.revealed) return
	cell.flagged = !cell.flagged
	flagCount.value += cell.flagged ? 1 : -1
}

/** 已翻开数字周围旗数够了，双击一次展开剩余格 */
const chord = index => {
	if (state.value !== 'playing') return
	const cell = cells.value[index]
	if (!cell || !cell.revealed || cell.adjacent === 0) return
	const near = neighbors(index)
	let flags = 0
	for (const n of near) if (cells.value[n].flagged) flags += 1
	if (flags !== cell.adjacent) {
		if (flags > 0) message.info(`这一格周围有 ${cell.adjacent} 颗雷，现在只插了 ${flags} 面旗`)
		return
	}
	let boom = -1
	for (const n of near) {
		const item = cells.value[n]
		if (!item.flagged && !item.revealed && item.mine) {
			boom = n
			break
		}
	}
	if (boom >= 0) {
		lose(boom)
		return
	}
	for (const n of near) {
		const item = cells.value[n]
		if (!item.flagged && !item.revealed) flood(n)
	}
	checkWin()
}

/** 提示：找一格 100% 安全且未翻开的格子翻开 */
const hint = () => {
	if (!canHint.value) return
	const list = cells.value
	// 还没布雷就随便点一下开局，天然安全
	if (!planted.value) {
		hintsLeft.value -= 1
		openCell(Math.floor(Math.random() * list.length))
		return
	}
	let target = -1
	// 优先用「旗子数已满足」的数字格推出周围安全格
	for (let i = 0; i < list.length && target < 0; i += 1) {
		const cell = list[i]
		if (!cell.revealed || cell.adjacent === 0) continue
		const near = neighbors(i)
		let flags = 0
		for (const n of near) if (list[n].flagged) flags += 1
		if (flags !== cell.adjacent) continue
		const candidate = near.find(n => !list[n].revealed && !list[n].flagged)
		if (candidate !== undefined && !list[candidate].mine) target = candidate
	}
	// 退一步：找相邻已有数字为 0 的未翻开格，或者干脆找非雷格
	if (target < 0) {
		for (let i = 0; i < list.length; i += 1) {
			if (!list[i].revealed && !list[i].flagged && !list[i].mine) {
				target = i
				break
			}
		}
	}
	if (target < 0) {
		message.info('没有可以安全翻开的地方了')
		return
	}
	hintsLeft.value -= 1
	openCell(target)
}

const newGame = () => {
	stopTimer()
	elapsed.value = 0
	revealedCount.value = 0
	flagCount.value = 0
	explodedIndex.value = -1
	planted.value = false
	isNewRecord.value = false
	state.value = 'ready'
	hintsLeft.value = 3
	cursor.value = 0
	keyboardActive.value = false
	hovered.value = -1
	cells.value = Array.from({ length: cols.value * rows.value }, makeCell)
	nextTick(updateSize)
}

const onCustomChange = () => {
	custom.cols = Math.max(5, Math.min(40, Math.round(Number(custom.cols)) || 9))
	custom.rows = Math.max(5, Math.min(30, Math.round(Number(custom.rows)) || 9))
	custom.mines = Math.max(1, Math.min(custom.cols * custom.rows - 9, Math.round(Number(custom.mines)) || 10))
	newGame()
}

/* ---------------- 交互 ---------------- */

const onLeftClick = index => {
	keyboardActive.value = false
	if (flagMode.value) {
		toggleFlag(index)
		return
	}
	cursor.value = index
	openCell(index)
}

const onRightClick = index => {
	keyboardActive.value = false
	cursor.value = index
	toggleFlag(index)
}

const toggleFlagMode = () => {
	flagMode.value = !flagMode.value
}

/* ---------------- 尺寸 ---------------- */

const updateSize = () => {
	const box = boardBox.value
	if (!box) return
	// 用滚动容器（宽度由外层决定）做基准，别用棋盘自己——否则尺寸一变宽，
	// 格子跟着变，容易互相追着缩成一个死循环
	const scroller = box.parentElement
	const avail = (scroller?.clientWidth || 520) - (cols.value - 1) - 12
	const byWidth = Math.floor(avail / cols.value)
	const byHeight = Math.floor((window.innerHeight * 0.6) / rows.value)
	const next = Math.min(38, Math.max(16, Math.min(byWidth, byHeight) || 24))
	if (next !== cellSize.value) cellSize.value = next
}

/* ---------------- 渲染辅助 ---------------- */

const cellClass = (cell, index) => ({
	open: cell.revealed,
	covered: !cell.revealed,
	flagged: cell.flagged && !cell.revealed,
	'has-mine': cell.revealed && cell.mine,
	exploded: cell.exploded,
	wrong: cell.wrong,
	cursor: keyboardActive.value && index === cursor.value && state.value !== 'lost' && state.value !== 'won',
	hovered: index === hovered.value && !cell.revealed,
	[`n${cell.adjacent}`]: cell.revealed && !cell.mine && cell.adjacent > 0,
})

/* ---------------- 键盘 ---------------- */

const onKeyDown = event => {
	const tag = event.target?.tagName
	if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return
	const key = event.key
	if (key === 'r' || key === 'R') {
		newGame()
		return
	}
	if (!cells.value.length) return

	let x = cursor.value % cols.value
	let y = Math.floor(cursor.value / cols.value)
	let moved = false
	if (key === 'ArrowLeft') {
		x -= 1
		moved = true
	} else if (key === 'ArrowRight') {
		x += 1
		moved = true
	} else if (key === 'ArrowUp') {
		y -= 1
		moved = true
	} else if (key === 'ArrowDown') {
		y += 1
		moved = true
	}
	if (moved) {
		event.preventDefault()
		keyboardActive.value = true
		x = Math.max(0, Math.min(cols.value - 1, x))
		y = Math.max(0, Math.min(rows.value - 1, y))
		cursor.value = y * cols.value + x
		return
	}
	if (key === ' ' || key === 'Enter') {
		event.preventDefault()
		keyboardActive.value = true
		openCell(cursor.value)
	} else if (key === 'f' || key === 'F') {
		event.preventDefault()
		keyboardActive.value = true
		toggleFlag(cursor.value)
	} else if (key === 'x' || key === 'X') {
		event.preventDefault()
		keyboardActive.value = true
		chord(cursor.value)
	}
}

/* ---------------- 生命周期 ---------------- */

watch(level, () => newGame())

onMounted(() => {
	loadBest()
	newGame()
	window.addEventListener('keydown', onKeyDown)
	window.addEventListener('resize', updateSize)
	if (typeof ResizeObserver !== 'undefined' && boardBox.value) {
		observer = new ResizeObserver(() => updateSize())
		observer.observe(boardBox.value.parentElement || boardBox.value)
	}

	if (import.meta.env.DEV) {
		window.__minesweeperTest = {
			newGame,
			setLevel: value => {
				level.value = value
			},
			setCustom: patch => {
				Object.assign(custom, patch)
			},
			openCell,
			toggleFlag,
			chord,
			hint,
			state,
			cells,
			bestMap,
			elapsed,
			cfg: () => ({ cols: cols.value, rows: rows.value, mines: mineCount.value, level: level.value }),
			info: () => ({
				level: level.value,
				cols: cols.value,
				rows: rows.value,
				mines: mineCount.value,
				state: state.value,
				planted: planted.value,
				revealed: revealedCount.value,
				flags: flagCount.value,
				exploded: explodedIndex.value,
				hintsLeft: hintsLeft.value,
				elapsed: elapsed.value,
				best: bestMap.value[level.value] || 0,
			}),
			/** 首点安全校验：返回起点九宫格内的雷数 */
			safeZoneMines: index => {
				const near = [index, ...neighbors(index)]
				return near.filter(n => cells.value[n]?.mine).length
			},
			/** 通关校验：把除雷以外的格子全翻开 */
			autoSolve: () => {
				const list = cells.value
				if (!planted.value) plantMines(0)
				for (let i = 0; i < list.length; i += 1) {
					const cell = list[i]
					if (cell.mine || cell.revealed) continue
					cell.revealed = true
					revealedCount.value += 1
				}
				state.value = 'playing'
				checkWin()
				return state.value
			},
			totalMines: () => cells.value.filter(cell => cell.mine).length,
		}
	}
})

onBeforeUnmount(() => {
	stopTimer()
	window.removeEventListener('keydown', onKeyDown)
	window.removeEventListener('resize', updateSize)
	if (observer) {
		observer.disconnect()
		observer = null
	}
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.minesweeper {
	/* 经典扫雷数字配色，浅色下方足够深 */
	--ms-1: #1d4ed8;
	--ms-2: #15803d;
	--ms-3: #dc2626;
	--ms-4: #4338ca;
	--ms-5: #991b1b;
	--ms-6: #0e7490;
	--ms-7: #111827;
	--ms-8: #6b7280;
	/* 未翻开格子的立体感：灰蓝凸起，和翻开后的近白平面形成明显差别 */
	--ms-cover-a: #eef2f7;
	--ms-cover-b: #ccd6e2;
	--ms-cover-edge: rgba(15, 23, 42, 0.22);
	--ms-open-bg: rgba(255, 255, 255, 0.92);
	--ms-mine: #1f2937;

	.layout {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.board-col {
		flex: 1.2;
		min-width: 340px;
		display: flex;
		justify-content: center;
	}
	.board-card {
		display: flex;
		flex-flow: column;
		align-items: center;
		gap: 12px;
		padding: 14px;
		/* 撑满左栏，给棋盘一个稳定的宽度基准 */
		width: 100%;
		box-sizing: border-box;
	}
	.hud {
		display: flex;
		align-items: center;
		gap: 28px;
		.hud-item {
			display: flex;
			flex-flow: column;
			align-items: center;
			min-width: 60px;
			.k {
				font-size: 11px;
				color: var(--text-color-3);
			}
			.v {
				font-size: 20px;
				font-weight: 700;
				color: var(--text-color);
				font-variant-numeric: tabular-nums;
				line-height: 1.25;
				letter-spacing: 0.02em;
				&.danger {
					color: #ff4d4f;
				}
			}
		}
	}
	.face {
		width: 42px;
		height: 42px;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		transition: transform 0.12s;
		svg {
			width: 100%;
			height: 100%;
			display: block;
		}
		.face-bg {
			fill: #fde047;
			stroke: #ca8a04;
			stroke-width: 1.2;
		}
		.face-dot {
			fill: #1f2937;
		}
		.face-line {
			fill: none;
			stroke: #1f2937;
			stroke-width: 1.6;
			stroke-linecap: round;
		}
		&:hover {
			transform: scale(1.08);
		}
		&:active {
			transform: scale(0.94);
		}
		&.lost .face-bg {
			fill: #fca5a5;
			stroke: #dc2626;
		}
	}
	.board-wrap {
		position: relative;
		width: 100%;
		display: flex;
		justify-content: center;
	}
	.board-scroll {
		overflow: auto;
		width: 100%;
		padding-bottom: 2px;
		/* 这里不能用 flex 居中：棋盘比容器宽时左侧会滚不到，
		   交给 .board 的 margin: 0 auto 更安全 */
	}
	.board {
		display: grid;
		gap: 1px;
		padding: 4px;
		margin: 0 auto;
		border-radius: 6px;
		background: var(--ms-cover-edge);
	}
	.cell {
		position: relative;
		width: var(--cell);
		height: var(--cell);
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 2px;
		font-family: inherit;
		font-size: calc(var(--cell) * 0.56);
		font-weight: 700;
		line-height: 1;
		cursor: pointer;
		user-select: none;
		transition:
			background 0.1s,
			box-shadow 0.1s;
		background: linear-gradient(180deg, var(--ms-cover-a), var(--ms-cover-b));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.9),
			inset 0 -1px 0 var(--ms-cover-edge);
		&.hovered {
			background: linear-gradient(180deg, #ffffff, #e9eef5);
		}
		&.open {
			cursor: default;
			background: var(--ms-open-bg);
			box-shadow: none;
		}
		&.flagged {
			cursor: pointer;
		}
		&.exploded {
			background: #ef4444;
		}
		&.wrong {
			background: var(--ms-open-bg);
		}
		&.cursor::after {
			content: '';
			position: absolute;
			inset: 1px;
			border: 2px solid #1677ff;
			border-radius: 2px;
			pointer-events: none;
		}
		.num {
			color: var(--text-color);
		}
		&.n1 .num {
			color: var(--ms-1);
		}
		&.n2 .num {
			color: var(--ms-2);
		}
		&.n3 .num {
			color: var(--ms-3);
		}
		&.n4 .num {
			color: var(--ms-4);
		}
		&.n5 .num {
			color: var(--ms-5);
		}
		&.n6 .num {
			color: var(--ms-6);
		}
		&.n7 .num {
			color: var(--ms-7);
		}
		&.n8 .num {
			color: var(--ms-8);
		}
	}
	.ico {
		width: 82%;
		height: 82%;
		display: block;
		&.mine {
			fill: var(--ms-mine);
			stroke: var(--ms-mine);
			stroke-width: 1.9;
			stroke-linecap: round;
		}
		&.flag {
			.pole {
				fill: none;
				stroke: #334155;
				stroke-width: 1.7;
				stroke-linecap: round;
			}
			.cloth {
				fill: #ef4444;
			}
		}
		&.wrong {
			fill: none;
			stroke: #ef4444;
			stroke-width: 2.4;
			stroke-linecap: round;
		}
	}
	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-flow: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		border-radius: 6px;
		/* 不要压太黑：踩雷后玩家还想看清雷都在哪 */
		background: rgba(15, 23, 42, 0.45);
		backdrop-filter: blur(1.5px);
		.big {
			font-size: 22px;
			font-weight: 700;
			color: #f8fafc;
			text-shadow: 0 1px 6px rgba(0, 0, 0, 0.55);
		}
		.hint {
			color: rgba(248, 250, 252, 0.85);
			text-shadow: 0 1px 6px rgba(0, 0, 0, 0.55);
		}
	}
	.board-hint {
		font-size: 12px;
		color: var(--text-color-3);
		text-align: center;
		min-height: 18px;
	}
	.side-col {
		flex: 1;
		min-width: 300px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.block {
		display: flex;
		flex-flow: column;
		gap: 6px;
	}
	.block-title {
		font-weight: 600;
		color: var(--text-color);
		margin-bottom: 4px;
		font-size: 13px;
	}
	.custom-box {
		display: flex;
		flex-flow: column;
		gap: 6px;
		padding: 8px 0 2px;
		border-top: 1px dashed var(--border-color);
		margin-top: 4px;
	}
	.custom-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		.label {
			font-size: 12px;
			color: var(--text-color-2);
		}
	}
	.switch-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding-top: 8px;
		margin-top: 4px;
		border-top: 1px solid var(--border-color);
		.label {
			font-size: 12px;
			color: var(--text-color-2);
		}
	}
	.op-row {
		display: flex;
		gap: 8px;
	}
	.best-list {
		display: flex;
		flex-flow: column;
		gap: 2px;
		margin-bottom: 4px;
	}
	.best-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 6px;
		border-radius: 4px;
		font-size: 12px;
		color: var(--text-color-2);
		.score {
			font-variant-numeric: tabular-nums;
			font-weight: 600;
			color: var(--text-color);
		}
		&.active {
			background: rgba(22, 119, 255, 0.1);
			.name {
				color: #1677ff;
			}
		}
	}
	.bar {
		height: 6px;
		border-radius: 3px;
		background: rgba(127, 127, 127, 0.16);
		overflow: hidden;
		.fill {
			display: block;
			height: 100%;
			background: #1677ff;
			border-radius: 3px;
			transition: width 0.2s ease;
		}
	}
	.hint {
		line-height: 1.7;
	}
}

/* 深色主题：格子改成灰阶凸起，数字用亮一档的颜色。
   这里不能写 :global()——本项目的 Vue 版本会把 :global() 之后的选择器一起吃掉，
   直接写 html[data-theme] 前缀即可，scoped 会正常把属性加到 .minesweeper 上。 */
html[data-theme='dark'] .minesweeper {
	--ms-1: #60a5fa;
	--ms-2: #4ade80;
	--ms-3: #f87171;
	--ms-4: #a5b4fc;
	--ms-5: #fca5a5;
	--ms-6: #22d3ee;
	--ms-7: #e5e7eb;
	--ms-8: #9ca3af;
	--ms-cover-a: #5b6675;
	--ms-cover-b: #3d4753;
	--ms-cover-edge: rgba(0, 0, 0, 0.5);
	--ms-open-bg: rgba(255, 255, 255, 0.035);
	--ms-mine: #e5e7eb;

	.cell {
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.16),
			inset 0 -1px 0 rgba(0, 0, 0, 0.35);
		&.hovered {
			background: linear-gradient(180deg, #64748b, #475569);
		}
	}
	.ico.flag .pole {
		stroke: #cbd5e1;
	}
}
</style>
