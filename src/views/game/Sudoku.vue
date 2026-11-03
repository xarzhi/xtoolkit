<template>
	<div class="tool sudoku">
		<h1 class="tool-title">
			数独
			<span class="tip">方向键选格、1-9 填数、Backspace 擦除；四档难度都保证唯一解</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<div class="board-col">
					<div class="tool-card board-card">
						<div class="hud">
							<div class="hud-item">
								<span class="k">难度</span>
								<span class="v small">{{ currentLevel.label }}</span>
							</div>
							<div class="hud-item">
								<span class="k">用时</span>
								<span class="v">{{ timeText }}</span>
							</div>
							<div class="hud-item">
								<span class="k">已填</span>
								<span class="v">{{ filledCount }} / 81</span>
							</div>
							<div class="hud-item">
								<span class="k">错误</span>
								<span class="v" :class="{ danger: errorCount > 0 }">{{ errorCount }}</span>
							</div>
						</div>

						<div class="board-wrap">
							<div class="board-grid" :class="{ paused: state === 'paused' }">
								<div
									v-for="(cell, index) in cells"
									:key="index"
									class="cell"
									:class="cellClass(index)"
									@click="selectCell(index)"
								>
									<span v-if="values[index]" class="num">{{ values[index] }}</span>
									<span v-else-if="notes[index]" class="notes">
										<i v-for="digit in 9" :key="digit" :class="{ on: notes[index] & (1 << (digit - 1)) }">
											{{ notes[index] & (1 << (digit - 1)) ? digit : '' }}
										</i>
									</span>
								</div>
							</div>

							<div v-if="generating" class="overlay">
								<div class="big">正在出题…</div>
								<div class="hint">正在校验唯一解</div>
							</div>
							<div v-else-if="state === 'won'" class="overlay">
								<div class="big">全部正确！</div>
								<div class="hint">用时 {{ timeText }} · {{ errorCount === 0 ? '零失误' : `错误 ${errorCount} 次` }}</div>
								<a-button type="primary" size="large" @click="newGame">再来一局</a-button>
							</div>
							<div v-else-if="state === 'paused'" class="overlay">
								<div class="big">已暂停</div>
								<div class="hint">点下面的「继续」恢复计时</div>
							</div>
						</div>

						<div class="pad">
							<button class="num-btn" v-for="digit in 9" :key="digit" @click="inputDigit(digit)">
								<span class="n">{{ digit }}</span>
								<span class="left" :class="{ done: digitLeft(digit) === 0 }">{{ digitLeft(digit) === 0 ? '✓' : digitLeft(digit) }}</span>
							</button>
							<button class="num-btn erase" @click="erase">
								<span class="n">⌫</span>
								<span class="left">擦除</span>
							</button>
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
						<div class="hint" style="margin-top: 8px">{{ currentLevel.desc }}</div>

						<div class="switch-row">
							<span class="label">笔记模式（填候选数）</span>
							<a-switch v-model:checked="noteMode" size="small" />
						</div>
						<div class="switch-row">
							<span class="label">自动擦除同宫/同行候选数</span>
							<a-switch v-model:checked="autoCleanNotes" size="small" />
						</div>
						<div class="switch-row">
							<span class="label">标记填错的格子</span>
							<a-switch v-model:checked="markError" size="small" />
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">操作</div>
						<div class="op-row">
							<a-button block @click="undo" :disabled="!history.length">撤销</a-button>
							<a-button block @click="hint" :disabled="state === 'won'">提示（{{ hintsLeft }}）</a-button>
						</div>
						<div class="op-row">
							<a-button block @click="restart">重玩本题</a-button>
							<a-button block type="primary" @click="newGame">换一题</a-button>
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">玩法</div>
						<div class="hint">· 每行、每列、每个 3×3 宫都要填满 1-9 且不重复</div>
						<div class="hint">· 点击格子后用下方数字键或键盘输入</div>
						<div class="hint">· 打开「笔记模式」后输入的是候选数，再按一次取消</div>
						<div class="hint">· 快捷键：N 切换笔记、H 提示、空格暂停、R 重玩</div>
						<div class="hint">· 题目由程序生成并校验过唯一解，不用怕出现多解</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">本局</div>
						<div class="bar">
							<span class="fill" :style="{ width: `${(filledCount / 81) * 100}%` }"></span>
						</div>
						<div class="hint" style="margin-top: 6px">
							已知 {{ givenCount }} 个数字 · 提示用了 {{ hintsUsed }} 次
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">{{ state === 'won' ? '完成了，试试更高难度？' : '慢一点也没关系，重要的是推理过程' }}</span>
			<a-space>
				<a-button @click="togglePause">{{ state === 'paused' ? '继续' : '暂停' }}</a-button>
				<a-button type="primary" @click="newGame">换一题</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'

const LEVELS = [
	{ value: 'easy', label: '简单', clues: 48, desc: '保留 48 个提示数，基本靠单数排除就能推完' },
	{ value: 'medium', label: '中等', clues: 38, desc: '保留 38 个提示数，需要用到宫内排除' },
	{ value: 'hard', label: '困难', clues: 30, desc: '保留 30 个提示数，得靠候选数做推理' },
	{ value: 'expert', label: '专家', clues: 25, desc: '保留 25 个提示数，经常要用到数对/唯一矩形' },
]

const BITS = Array.from({ length: 10 }, (_, index) => (index ? 1 << (index - 1) : 0))
const POPCOUNT = new Uint8Array(512)
for (let i = 1; i < 512; i += 1) POPCOUNT[i] = POPCOUNT[i >> 1] + (i & 1)

/* ---------------- 生成与求解 ---------------- */

const rowOf = index => (index / 9) | 0
const colOf = index => index % 9
const boxOf = index => (((index / 9) | 0) / 3 | 0) * 3 + ((index % 9) / 3 | 0)

const shuffled = list => {
	const arr = list.slice()
	for (let i = arr.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1))
		;[arr[i], arr[j]] = [arr[j], arr[i]]
	}
	return arr
}

/** 随机填出一个完整解 */
const fillSolution = () => {
	const grid = new Array(81).fill(0)
	const rows = new Array(9).fill(0)
	const cols = new Array(9).fill(0)
	const boxes = new Array(9).fill(0)

	const fill = pos => {
		if (pos === 81) return true
		const r = rowOf(pos)
		const c = colOf(pos)
		const b = boxOf(pos)
		for (const value of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
			const bit = BITS[value]
			if ((rows[r] | cols[c] | boxes[b]) & bit) continue
			grid[pos] = value
			rows[r] |= bit
			cols[c] |= bit
			boxes[b] |= bit
			if (fill(pos + 1)) return true
			grid[pos] = 0
			rows[r] &= ~bit
			cols[c] &= ~bit
			boxes[b] &= ~bit
		}
		return false
	}
	fill(0)
	return grid
}

/** 数解的个数（最多数到 limit 个就停），MRV + 位运算，速度快 */
const countSolutions = (board, limit = 2) => {
	const grid = board.slice()
	const rows = new Array(9).fill(0)
	const cols = new Array(9).fill(0)
	const boxes = new Array(9).fill(0)
	for (let i = 0; i < 81; i += 1) {
		const value = grid[i]
		if (!value) continue
		const bit = BITS[value]
		rows[rowOf(i)] |= bit
		cols[colOf(i)] |= bit
		boxes[boxOf(i)] |= bit
	}

	let count = 0
	const dfs = () => {
		if (count >= limit) return
		let best = -1
		let bestMask = 0
		let bestCount = 10
		for (let i = 0; i < 81; i += 1) {
			if (grid[i]) continue
			const mask = ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & 0x1ff
			const n = POPCOUNT[mask]
			if (n === 0) return
			if (n < bestCount) {
				bestCount = n
				best = i
				bestMask = mask
				if (n === 1) break
			}
		}
		if (best === -1) {
			count += 1
			return
		}
		const r = rowOf(best)
		const c = colOf(best)
		const b = boxOf(best)
		let mask = bestMask
		while (mask) {
			const bit = mask & -mask
			mask ^= bit
			grid[best] = Math.round(Math.log2(bit)) + 1
			rows[r] |= bit
			cols[c] |= bit
			boxes[b] |= bit
			dfs()
			rows[r] &= ~bit
			cols[c] &= ~bit
			boxes[b] &= ~bit
			grid[best] = 0
			if (count >= limit) return
		}
	}
	dfs()
	return count
}

/** 从完整解里挖洞，挖的同时保证唯一解 */
const digPuzzle = (solution, targetClues) => {
	const puzzle = solution.slice()
	let clues = 81
	for (const index of shuffled(Array.from({ length: 81 }, (_, i) => i))) {
		if (clues <= targetClues) break
		const backup = puzzle[index]
		puzzle[index] = 0
		if (countSolutions(puzzle, 2) === 1) clues -= 1
		else puzzle[index] = backup
	}
	return { puzzle, clues }
}

const makePuzzle = targetClues => {
	const solution = fillSolution()
	return { ...digPuzzle(solution, targetClues), solution }
}

/* ---------------- 状态 ---------------- */

const level = ref('easy')
const currentLevel = computed(() => LEVELS.find(item => item.value === level.value) || LEVELS[0])

const values = ref(new Array(81).fill(0))
const notes = ref(new Array(81).fill(0))
const puzzle = ref(new Array(81).fill(0))
const solution = ref(new Array(81).fill(0))
const selected = ref(-1)
const state = ref('playing') // playing | paused | won
const generating = ref(false)
const noteMode = ref(false)
const autoCleanNotes = ref(true)
const markError = ref(true)
const history = ref([])
const hintsUsed = ref(0)
const errorCount = ref(0)
const elapsed = ref(0)

const hintsLeft = computed(() => Math.max(0, 3 - hintsUsed.value))

const cells = computed(() => values.value.map((_, index) => index))
const givenCount = computed(() => puzzle.value.filter(Boolean).length)
const filledCount = computed(() => values.value.filter(Boolean).length)
const errorCount2 = computed(() => values.value.filter((value, index) => value && value !== solution.value[index]).length)
watch(errorCount2, value => {
	// 错误次数只累加不回落，避免改对之后归零
	if (value > 0) errorCount.value = Math.max(errorCount.value, value)
})

const timeText = computed(() => {
	const total = Math.floor(elapsed.value / 1000)
	return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
})

const digitLeft = digit => 9 - values.value.filter(value => value === digit).length

const conflictSet = computed(() => {
	const set = new Set()
	if (!markError.value) return set
	values.value.forEach((value, index) => {
		if (!value) return
		if (value !== solution.value[index]) set.add(index)
	})
	return set
})

/** 被「提示」填过的格子，用绿色区分（reactive 才能让 class 跟着变） */
const hintCells = reactive(new Set())

const cellClass = index => {
	const value = values.value[index]
	const isGiven = !!puzzle.value[index]
	const row = rowOf(index)
	const col = colOf(index)
	const box = boxOf(index)
	const sel = selected.value
	const selValue = sel >= 0 ? values.value[sel] : 0
	return {
		given: isGiven,
		selected: sel === index,
		peer:
			sel >= 0 &&
			sel !== index &&
			(rowOf(sel) === row || colOf(sel) === col || boxOf(sel) === box),
		same: !!value && value === selValue && sel !== index,
		error: conflictSet.value.has(index),
		'hint-cell': hintCells.has(index),
		'blk-r': col === 2 || col === 5,
		'blk-b': row === 2 || row === 5,
	}
}

/* ---------------- 计时 ---------------- */

let timerId = 0
let startedAt = 0

const startTimer = () => {
	if (timerId || state.value === 'won') return
	startedAt = Date.now() - elapsed.value
	timerId = window.setInterval(() => {
		elapsed.value = Date.now() - startedAt
	}, 500)
}
const stopTimer = () => {
	if (timerId) clearInterval(timerId)
	timerId = 0
}
const togglePause = () => {
	if (state.value === 'won') return
	if (state.value === 'paused') {
		state.value = 'playing'
		startTimer()
	} else {
		state.value = 'paused'
		stopTimer()
	}
}

/* ---------------- 操作 ---------------- */

const selectCell = index => {
	selected.value = index
	if (state.value === 'paused') {
		state.value = 'playing'
		startTimer()
	}
}

const pushHistory = (index, prevValue, prevNotes) => {
	history.value.push({ index, prevValue, prevNotes })
	if (history.value.length > 200) history.value.shift()
}

const peerIndices = index => {
	const result = []
	const row = rowOf(index)
	const col = colOf(index)
	const box = boxOf(index)
	for (let i = 0; i < 81; i += 1) {
		if (i === index) continue
		if (rowOf(i) === row || colOf(i) === col || boxOf(i) === box) result.push(i)
	}
	return result
}

const cleanPeerNotes = digit => {
	if (!autoCleanNotes.value) return
	const bit = BITS[digit]
	for (const index of peerIndices(selected.value)) {
		if (notes.value[index] & bit) notes.value[index] &= ~bit
	}
}

const inputDigit = digit => {
	const index = selected.value
	if (index < 0 || state.value === 'won' || state.value === 'paused') return
	if (puzzle.value[index]) return

	pushHistory(index, values.value[index], notes.value[index])
	const bit = BITS[digit]

	if (noteMode.value) {
		if (values.value[index]) values.value[index] = 0
		notes.value[index] ^= bit
		return
	}

	if (values.value[index] === digit) {
		values.value[index] = 0
		return
	}

	values.value[index] = digit
	notes.value[index] = 0
	// 同一数字在同行列宫里的候选数同步擦掉
	const snapshot = selected.value
	selected.value = index
	cleanPeerNotes(digit)
	selected.value = snapshot

	checkWin()
}

const erase = () => {
	const index = selected.value
	if (index < 0 || state.value === 'won' || puzzle.value[index]) return
	pushHistory(index, values.value[index], notes.value[index])
	values.value[index] = 0
	notes.value[index] = 0
}

const undo = () => {
	const last = history.value.pop()
	if (!last) return
	values.value[last.index] = last.prevValue
	notes.value[last.index] = last.prevNotes
	selected.value = last.index
}

const hint = () => {
	if (hintsLeft.value <= 0) {
		message.warning('本题的提示次数用完了')
		return
	}
	let index = selected.value
	if (index < 0 || values.value[index] === solution.value[index]) {
		// 没选格或选中的已经是对的，就找一个空格
		index = values.value.findIndex((value, i) => value !== solution.value[i])
	}
	if (index < 0) return

	pushHistory(index, values.value[index], notes.value[index])
	values.value[index] = solution.value[index]
	notes.value[index] = 0
	hintCells.add(index)
	hintsUsed.value += 1
	selected.value = index
	checkWin()
}

const checkWin = () => {
	if (values.value.some((value, index) => value !== solution.value[index])) return
	state.value = 'won'
	stopTimer()
	message.success(`完成！用时 ${timeText.value}`)
}

const restart = () => {
	values.value = puzzle.value.slice()
	notes.value = new Array(81).fill(0)
	history.value = []
	hintCells.clear()
	hintsUsed.value = 0
	errorCount.value = 0
	elapsed.value = 0
	selected.value = -1
	state.value = 'playing'
	stopTimer()
}

const newGame = () => {
	if (generating.value) return
	generating.value = true
	stopTimer()
	// 让出一帧，先显示"正在出题"
	window.setTimeout(() => {
		const { puzzle: p, solution: s } = makePuzzle(currentLevel.value.clues)
		puzzle.value = p
		solution.value = s
		generating.value = false
		restart()
	}, 30)
}

/* ---------------- 键盘 ---------------- */

const onKeyDown = evt => {
	const tag = (evt.target?.tagName || '').toLowerCase()
	if (tag === 'input' || tag === 'textarea' || evt.target?.isContentEditable) return

	if (/^[1-9]$/.test(evt.key)) {
		evt.preventDefault()
		inputDigit(Number(evt.key))
		return
	}
	if (evt.key === 'Backspace' || evt.key === 'Delete' || evt.key === '0') {
		evt.preventDefault()
		erase()
		return
	}
	if (evt.key.startsWith('Arrow')) {
		evt.preventDefault()
		const cur = selected.value < 0 ? 40 : selected.value
		const delta = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[evt.key]
		const next = cur + delta
		// 左右移动不能跨行
		if (evt.key === 'ArrowLeft' && colOf(cur) === 0) return
		if (evt.key === 'ArrowRight' && colOf(cur) === 8) return
		if (next < 0 || next > 80) return
		selectCell(next)
		return
	}
	const key = evt.key.toLowerCase()
	if (key === 'n') {
		evt.preventDefault()
		noteMode.value = !noteMode.value
		message.info(noteMode.value ? '笔记模式开' : '笔记模式关')
		return
	}
	if (key === 'h') {
		evt.preventDefault()
		hint()
		return
	}
	if (key === 'r') {
		evt.preventDefault()
		restart()
		return
	}
	if (evt.key === ' ') {
		evt.preventDefault()
		togglePause()
	}
}

/* ---------------- 生命周期 ---------------- */

onMounted(() => {
	newGame()
	window.addEventListener('keydown', onKeyDown)
	if (import.meta.env.DEV) {
		window.__sudokuTest = {
			newGame,
			input: inputDigit,
			select: selectCell,
			erase,
			hint,
			restart,
			undo,
			setLevel: value => {
				level.value = value
				newGame()
			},
			solveAll: () => {
				// 一键填满正解，用来验证完成判定与计时停止
				values.value = solution.value.slice()
				checkWin()
			},
			state: () => ({
				level: level.value,
				givens: givenCount.value,
				filled: filledCount.value,
				empty: 81 - givenCount.value,
				state: state.value,
				errors: conflictSet.value.size,
				hints: hintsUsed.value,
				unique: countSolutions(puzzle.value, 3),
				grid: values.value.slice(),
				puzzle: puzzle.value.slice(),
				solution: solution.value.slice(),
				elapsed: elapsed.value,
			}),
		}
	}
})

onBeforeUnmount(() => {
	stopTimer()
	window.removeEventListener('keydown', onKeyDown)
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.sudoku {
	// 数独线色，明暗主题都能看清
	--sudoku-line: #334155;
	--sudoku-line-soft: rgba(127, 127, 127, 0.32);

	.layout {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.board-col {
		flex: 1.2;
		min-width: 360px;
		display: flex;
		justify-content: center;
	}
	.board-card {
		display: flex;
		flex-flow: column;
		align-items: center;
		gap: 12px;
		padding: 14px;
	}
	.hud {
		display: flex;
		gap: 24px;
		flex-wrap: wrap;
		justify-content: center;
		.hud-item {
			display: flex;
			flex-flow: column;
			align-items: center;
			.k {
				font-size: 11px;
				color: var(--text-color-3);
			}
			.v {
				font-size: 18px;
				font-weight: 700;
				color: var(--text-color);
				font-variant-numeric: tabular-nums;
				line-height: 1.25;
				&.small {
					font-size: 15px;
				}
				&.danger {
					color: #ff4d4f;
				}
			}
		}
	}
	.board-wrap {
		position: relative;
		width: min(520px, 56vh);
		aspect-ratio: 1;
	}
	.board-grid {
		display: grid;
		grid-template-columns: repeat(9, 1fr);
		width: 100%;
		height: 100%;
		border: 2px solid var(--sudoku-line);
		border-radius: 8px;
		overflow: hidden;
		background: var(--panel-bg);
		&.paused .cell {
			filter: blur(5px);
		}
	}
	.cell {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		border-right: 1px solid var(--sudoku-line-soft);
		border-bottom: 1px solid var(--sudoku-line-soft);
		cursor: pointer;
		user-select: none;
		transition: background 0.12s;
		&:nth-child(9n) {
			border-right: none;
		}
		&:nth-child(n + 73) {
			border-bottom: none;
		}
		&.blk-r {
			border-right: 2px solid var(--sudoku-line);
		}
		&.blk-b {
			border-bottom: 2px solid var(--sudoku-line);
		}
		&.peer {
			background: rgba(22, 119, 255, 0.07);
		}
		&.same {
			background: rgba(22, 119, 255, 0.13);
		}
		&.selected {
			background: rgba(22, 119, 255, 0.24);
		}
		&.error {
			background: rgba(255, 77, 79, 0.16);
		}
		.num {
			font-size: clamp(14px, 3.4vh, 22px);
			line-height: 1;
			color: #1677ff;
			font-weight: 500;
		}
		&.given .num {
			color: var(--text-color);
			font-weight: 700;
		}
		&.error .num {
			color: #ff4d4f;
		}
		&.hint-cell .num {
			color: #52c41a;
		}
		.notes {
			position: absolute;
			inset: 2px;
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			grid-template-rows: repeat(3, 1fr);
			i {
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: clamp(6px, 1.2vh, 9px);
				font-style: normal;
				color: var(--text-color-3);
				line-height: 1;
			}
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
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.6);
		backdrop-filter: blur(3px);
		.big {
			font-size: 22px;
			font-weight: 700;
			color: #f8fafc;
		}
		.hint {
			color: rgba(248, 250, 252, 0.75);
		}
	}
	.pad {
		display: grid;
		grid-template-columns: repeat(10, 1fr);
		gap: 6px;
		width: 100%;
		max-width: 520px;
	}
	.num-btn {
		display: flex;
		flex-flow: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
		padding: 6px 0;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		background: rgba(127, 127, 127, 0.06);
		cursor: pointer;
		color: var(--text-color);
		transition: all 0.15s;
		.n {
			font-size: 17px;
			font-weight: 600;
			line-height: 1.1;
		}
		.left {
			font-size: 9px;
			color: var(--text-color-3);
			line-height: 1;
			&.done {
				color: #52c41a;
			}
		}
		&:hover {
			border-color: #1677ff;
			color: #1677ff;
		}
		&:active {
			transform: translateY(1px);
		}
		&.erase .n {
			font-size: 15px;
		}
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
	.switch-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
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
		& + .op-row {
			margin-top: 8px;
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
</style>
