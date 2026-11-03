<template>
	<div class="tool maze">
		<h1 class="tool-title">
			走迷宫
			<span class="tip">四档难度：尺寸越大、岔路越多；方向键 / WASD 移动，走不出来可以看提示路径</span>
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
								<span class="k">步数</span>
								<span class="v">{{ steps }}</span>
							</div>
							<div class="hud-item">
								<span class="k">本档最佳</span>
								<span class="v">{{ bestText }}</span>
							</div>
						</div>

						<div class="board-wrap">
							<canvas ref="canvasRef" class="board"></canvas>
							<div v-if="state === 'won'" class="overlay">
								<div class="big">走通了！</div>
								<div class="hint">用时 {{ timeText }} · {{ steps }} 步</div>
								<a-button type="primary" size="large" @click="regenerate">换一个迷宫</a-button>
							</div>
						</div>

						<div class="pad">
							<button class="pad-btn" title="左" @click="move(-1, 0)">←</button>
							<button class="pad-btn" title="上" @click="move(0, -1)">↑</button>
							<button class="pad-btn" title="下" @click="move(0, 1)">↓</button>
							<button class="pad-btn" title="右" @click="move(1, 0)">→</button>
						</div>
					</div>
				</div>

				<div class="side-col">
					<div class="tool-card block">
						<div class="block-title">难度</div>
						<a-radio-group v-model:value="cfg.level" button-style="solid" class="level-group">
							<a-radio-button v-for="item in LEVEL_LIST" :key="item.value" :value="item.value">
								{{ item.label }}
							</a-radio-button>
						</a-radio-group>
						<div class="hint" style="margin-top: 8px">{{ currentLevel.desc }}</div>

						<div class="switch-row">
							<span class="label">显示提示路径</span>
							<a-switch v-model:checked="cfg.showPath" size="small" />
						</div>
						<div class="switch-row">
							<span class="label">显示已走过的格子</span>
							<a-switch v-model:checked="cfg.showTrail" size="small" />
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">玩法</div>
						<div class="hint">· 蓝色圆点是起点（左上），绿点旗子是终点（右下）</div>
						<div class="hint">· 方向键或 WASD 走一步，撞墙不会动</div>
						<div class="hint">· 提示路径用最短路径算法算出来，跟着走必到</div>
						<div class="hint">· R 键重走本局，N 键换一个迷宫</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">本局进度</div>
						<div class="bar">
							<span class="fill" :style="{ width: `${progress}%` }"></span>
						</div>
						<div class="hint" style="margin-top: 6px">
							已走过 {{ visited.size }} / {{ totalCells }} 格 · 地图 {{ cols }} × {{ rows }}
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">各难度最佳</div>
						<div class="best-list">
							<div
								class="best-item"
								v-for="item in LEVEL_LIST"
								:key="item.value"
								:class="{ on: item.value === cfg.level }"
							>
								<span class="bn">{{ item.label }} · {{ item.size }}×{{ item.size }}</span>
								<span class="bv">{{ formatBest(item.value) }}</span>
							</div>
						</div>
						<a-button size="small" type="text" danger block style="margin-top: 6px" @click="clearBest">
							清除记录
						</a-button>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">{{ state === 'won' ? '这一局已经走完，试试更高难度？' : '慢慢来，不着急' }}</span>
			<a-space>
				<a-button @click="resetRun">重走本局</a-button>
				<a-button type="primary" @click="regenerate">换一个迷宫</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'

const SIZE_PX = 620
const BEST_KEY = 'xtools-maze-best-v2'

/**
 * 难度 = 尺寸 + 环路比例
 * 完美迷宫（braid=0）每一步都只有一条路；打通一部分墙之后会形成环路，
 * 走到岔路口的选择变多，也就更容易绕晕。
 */
const LEVELS = {
	easy: { value: 'easy', label: '简单', size: 15, braid: 0, desc: '15 × 15 完美迷宫，全程只有一条正确路线' },
	normal: { value: 'normal', label: '普通', size: 21, braid: 0.06, desc: '21 × 21，打通了少量墙，出现零星环路' },
	hard: { value: 'hard', label: '困难', size: 27, braid: 0.12, desc: '27 × 27，一成通道被打通，岔路明显变多' },
	insane: { value: 'insane', label: '地狱', size: 35, braid: 0.18, desc: '35 × 35，近两成通道互通，到处是分叉口' },
}
const LEVEL_LIST = Object.values(LEVELS)

const canvasRef = ref(null)
const cfg = reactive({ level: 'normal', showPath: false, showTrail: true })
const cells = ref([])
const player = reactive({ x: 0, y: 0 })
const goal = reactive({ x: 0, y: 0 })
const steps = ref(0)
const elapsed = ref(0)
const state = ref('ready') // ready | playing | won
const visited = reactive(new Set())
const bestMap = ref(readBest())

let ctx = null
let startedAt = 0
let timerId = 0

function readBest() {
	try {
		return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}
	} catch {
		return {}
	}
}
const saveBest = () => localStorage.setItem(BEST_KEY, JSON.stringify(bestMap.value))
const clearBest = () => {
	bestMap.value = {}
	localStorage.removeItem(BEST_KEY)
	message.success('记录已清除')
}

const currentLevel = computed(() => LEVELS[cfg.level] || LEVELS.normal)
const cols = computed(() => currentLevel.value.size)
const rows = computed(() => currentLevel.value.size)
const totalCells = computed(() => cols.value * rows.value)

const timeText = computed(() => formatTime(elapsed.value))

const formatTime = ms => {
	if (!ms) return '--:--'
	const total = Math.floor(ms / 1000)
	const mm = String(Math.floor(total / 60)).padStart(2, '0')
	const ss = String(total % 60).padStart(2, '0')
	return `${mm}:${ss}`
}

const formatBest = level => {
	const ms = bestMap.value[level]
	return ms ? formatTime(ms) : '--:--'
}

const bestText = computed(() => formatBest(cfg.level))
const progress = computed(() => Math.round((visited.size / totalCells.value) * 100))

/* ---------------- 生成迷宫 ---------------- */

/** 递归回溯生成完美迷宫 */
const buildMaze = size => {
	const list = Array.from({ length: size * size }, () => ({ n: true, e: true, s: true, w: true, v: false }))
	const at = (x, y) => list[y * size + x]
	const dirs = [
		['n', 0, -1, 's'],
		['e', 1, 0, 'w'],
		['s', 0, 1, 'n'],
		['w', -1, 0, 'e'],
	]
	const stack = [[0, 0]]
	at(0, 0).v = true
	while (stack.length) {
		const [x, y] = stack[stack.length - 1]
		const options = dirs.filter(([, dx, dy]) => {
			const nx = x + dx
			const ny = y + dy
			return nx >= 0 && ny >= 0 && nx < size && ny < size && !at(nx, ny).v
		})
		if (!options.length) {
			stack.pop()
			continue
		}
		const [d, dx, dy, opposite] = options[Math.floor(Math.random() * options.length)]
		const nx = x + dx
		const ny = y + dy
		at(x, y)[d] = false
		at(nx, ny)[opposite] = false
		at(nx, ny).v = true
		stack.push([nx, ny])
	}
	return list
}

/** 打通一部分内墙，制造环路和更多岔路 */
const braidMaze = (list, size, ratio) => {
	if (!ratio) return list
	const walls = []
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const cell = list[y * size + x]
			if (x < size - 1 && cell.e) walls.push([x, y, 'e'])
			if (y < size - 1 && cell.s) walls.push([x, y, 's'])
		}
	}
	for (let i = walls.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1))
		;[walls[i], walls[j]] = [walls[j], walls[i]]
	}
	const count = Math.floor(walls.length * ratio)
	for (let i = 0; i < count; i += 1) {
		const [x, y, dir] = walls[i]
		if (dir === 'e') {
			list[y * size + x].e = false
			list[y * size + x + 1].w = false
		} else {
			list[y * size + x].s = false
			list[(y + 1) * size + x].n = false
		}
	}
	return list
}

/* ---------------- 求解（BFS 最短路径） ---------------- */
const solve = () => {
	const size = cols.value
	const at = (x, y) => cells.value[y * size + x]
	const prev = new Map()
	const queue = [[player.x, player.y]]
	const seen = new Set([`${player.x},${player.y}`])
	while (queue.length) {
		const [x, y] = queue.shift()
		if (x === goal.x && y === goal.y) {
			const path = []
			let key = `${x},${y}`
			while (key) {
				const [px, py] = key.split(',').map(Number)
				path.push({ x: px, y: py })
				key = prev.get(key)
			}
			return path.reverse()
		}
		const cell = at(x, y)
		const steps4 = [
			[!cell.n, 0, -1],
			[!cell.e, 1, 0],
			[!cell.s, 0, 1],
			[!cell.w, -1, 0],
		]
		for (const [open, dx, dy] of steps4) {
			if (!open) continue
			const nx = x + dx
			const ny = y + dy
			const key = `${nx},${ny}`
			if (seen.has(key)) continue
			seen.add(key)
			prev.set(key, `${x},${y}`)
			queue.push([nx, ny])
		}
	}
	return []
}

/* ---------------- 状态流转 ---------------- */
const regenerate = () => {
	const level = currentLevel.value
	const size = level.size
	cells.value = braidMaze(buildMaze(size), size, level.braid)
	goal.x = size - 1
	goal.y = size - 1
	state.value = 'ready'
	resetRun()
}

const resetRun = () => {
	player.x = 0
	player.y = 0
	steps.value = 0
	elapsed.value = 0
	state.value = 'ready'
	visited.clear()
	visited.add('0,0')
	stopTimer()
	draw()
}

const stopTimer = () => {
	if (timerId) clearInterval(timerId)
	timerId = 0
}

const startTimer = () => {
	if (timerId) return
	startedAt = Date.now() - elapsed.value
	timerId = window.setInterval(() => {
		elapsed.value = Date.now() - startedAt
	}, 200)
}

const win = () => {
	state.value = 'won'
	stopTimer()
	elapsed.value = Date.now() - startedAt
	const key = cfg.level
	const prev = bestMap.value[key] || Infinity
	if (elapsed.value < prev) {
		bestMap.value = { ...bestMap.value, [key]: elapsed.value }
		saveBest()
		message.success(`新纪录：${timeText.value}（${currentLevel.value.label}）`)
	} else {
		message.success(`走通了！用时 ${timeText.value}，${steps.value} 步`)
	}
	draw()
}

/* ---------------- 移动 ---------------- */
const move = (dx, dy) => {
	if (state.value === 'won') return
	const size = cols.value
	const cell = cells.value[player.y * size + player.x]
	if (!cell) return
	const blocked =
		(dx === 0 && dy === -1 && cell.n) ||
		(dx === 1 && dy === 0 && cell.e) ||
		(dx === 0 && dy === 1 && cell.s) ||
		(dx === -1 && dy === 0 && cell.w)
	if (blocked) return

	if (state.value === 'ready') {
		state.value = 'playing'
		startTimer()
	}

	player.x += dx
	player.y += dy
	steps.value += 1
	visited.add(`${player.x},${player.y}`)
	draw()

	if (player.x === goal.x && player.y === goal.y) win()
}

const onKeyDown = evt => {
	const tag = (evt.target?.tagName || '').toLowerCase()
	if (tag === 'input' || tag === 'textarea' || evt.target?.isContentEditable) return
	const map = {
		ArrowUp: [0, -1],
		ArrowDown: [0, 1],
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0],
		w: [0, -1],
		s: [0, 1],
		a: [-1, 0],
		d: [1, 0],
		W: [0, -1],
		S: [0, 1],
		A: [-1, 0],
		D: [1, 0],
	}
	if (map[evt.key]) {
		evt.preventDefault()
		move(...map[evt.key])
		return
	}
	if (evt.key === 'r' || evt.key === 'R') {
		evt.preventDefault()
		resetRun()
	}
	if (evt.key === 'n' || evt.key === 'N') {
		evt.preventDefault()
		regenerate()
	}
}

/* ---------------- 渲染 ---------------- */
const setupCanvas = () => {
	const canvas = canvasRef.value
	if (!canvas) return
	const dpr = Math.min(window.devicePixelRatio || 1, 2)
	canvas.width = SIZE_PX * dpr
	canvas.height = SIZE_PX * dpr
	ctx = canvas.getContext('2d')
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	draw()
}

const draw = () => {
	const canvas = canvasRef.value
	if (!canvas || !ctx || !cells.value.length) return
	const size = cols.value
	const cell = SIZE_PX / size
	const dark = document.documentElement.dataset.theme === 'dark'

	ctx.clearRect(0, 0, SIZE_PX, SIZE_PX)
	ctx.fillStyle = dark ? '#1b1b1b' : '#ffffff'
	ctx.fillRect(0, 0, SIZE_PX, SIZE_PX)

	// 走过的格子
	if (cfg.showTrail) {
		ctx.fillStyle = 'rgba(34,197,94,0.14)'
		visited.forEach(key => {
			const [x, y] = key.split(',').map(Number)
			ctx.fillRect(x * cell, y * cell, cell, cell)
		})
	}

	// 提示路径
	if (cfg.showPath) {
		const path = solve()
		if (path.length > 1) {
			ctx.strokeStyle = 'rgba(22,119,255,0.35)'
			ctx.lineWidth = Math.max(2, cell * 0.28)
			ctx.lineJoin = 'round'
			ctx.lineCap = 'round'
			ctx.beginPath()
			path.forEach((p, i) => {
				const cx = p.x * cell + cell / 2
				const cy = p.y * cell + cell / 2
				if (i === 0) ctx.moveTo(cx, cy)
				else ctx.lineTo(cx, cy)
			})
			ctx.stroke()
		}
	}

	// 终点
	const gx = goal.x * cell
	const gy = goal.y * cell
	ctx.fillStyle = 'rgba(34,197,94,0.18)'
	ctx.fillRect(gx, gy, cell, cell)
	ctx.fillStyle = '#22c55e'
	ctx.beginPath()
	ctx.arc(gx + cell / 2, gy + cell / 2, cell * 0.24, 0, Math.PI * 2)
	ctx.fill()

	// 墙壁
	ctx.strokeStyle = dark ? '#94a3b8' : '#334155'
	ctx.lineWidth = Math.max(1.4, cell * 0.1)
	ctx.lineCap = 'square'
	ctx.beginPath()
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const c = cells.value[y * size + x]
			const px = x * cell
			const py = y * cell
			if (c.n) {
				ctx.moveTo(px, py)
				ctx.lineTo(px + cell, py)
			}
			if (c.w) {
				ctx.moveTo(px, py)
				ctx.lineTo(px, py + cell)
			}
			if (c.s && y === size - 1) {
				ctx.moveTo(px, py + cell)
				ctx.lineTo(px + cell, py + cell)
			}
			if (c.e && x === size - 1) {
				ctx.moveTo(px + cell, py)
				ctx.lineTo(px + cell, py + cell)
			}
		}
	}
	ctx.stroke()

	// 玩家
	ctx.fillStyle = '#1677ff'
	ctx.beginPath()
	ctx.arc(player.x * cell + cell / 2, player.y * cell + cell / 2, cell * 0.28, 0, Math.PI * 2)
	ctx.fill()
}

watch(() => cfg.showPath, draw)
watch(() => cfg.showTrail, draw)
watch(
	() => cfg.level,
	() => regenerate()
)

onMounted(() => {
	regenerate()
	setupCanvas()
	window.addEventListener('keydown', onKeyDown)
	window.addEventListener('resize', setupCanvas)
	// 开发期暴露内部状态，便于用无头浏览器验证"按最短路径走完"等流程（生产构建不含）
	if (import.meta.env.DEV) {
		window.__mazeTest = {
			solve,
			move,
			state,
			player,
			goal,
			steps,
			elapsed,
			regenerate,
			cfg,
			setLevel: value => {
				cfg.level = value
			},
			info: () => ({
				level: cfg.level,
				size: cols.value,
				cells: cells.value.length,
				// 统计开口数（相邻连通的对数），用来验证难度越高路越多
				openings: cells.value.reduce((sum, c) => sum + (c.e ? 0 : 1) + (c.s ? 0 : 1), 0),
				pathLength: solve().length,
				best: bestMap.value[cfg.level] || 0,
			}),
		}
	}
})

onBeforeUnmount(() => {
	stopTimer()
	window.removeEventListener('keydown', onKeyDown)
	window.removeEventListener('resize', setupCanvas)
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.maze {
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
	}
	.hud {
		display: flex;
		gap: 22px;
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
				font-size: 19px;
				font-weight: 700;
				color: var(--text-color);
				font-variant-numeric: tabular-nums;
				line-height: 1.2;
				&.small {
					font-size: 15px;
				}
			}
		}
	}
	.board-wrap {
		position: relative;
		width: min(560px, 52vh);
		aspect-ratio: 1;
		.board {
			display: block;
			width: 100%;
			height: 100%;
			border-radius: 12px;
			border: 1px solid var(--border-color);
			background: var(--panel-bg);
		}
		.overlay {
			position: absolute;
			inset: 0;
			display: flex;
			flex-flow: column;
			align-items: center;
			justify-content: center;
			gap: 10px;
			border-radius: 12px;
			background: rgba(15, 23, 42, 0.55);
			backdrop-filter: blur(2px);
			.big {
				font-size: 22px;
				font-weight: 700;
				color: #f8fafc;
			}
			.hint {
				color: rgba(248, 250, 252, 0.75);
			}
		}
	}
	.pad {
		display: flex;
		gap: 8px;
		justify-content: center;
		.pad-btn {
			width: 46px;
			height: 34px;
			border: 1px solid var(--border-color);
			background: rgba(127, 127, 127, 0.08);
			border-radius: 8px;
			font-size: 15px;
			color: var(--text-color-2);
			cursor: pointer;
			transition: all 0.15s;
			&:hover {
				color: #1677ff;
				border-color: #1677ff;
			}
			&:active {
				transform: translateY(1px);
			}
		}
	}
	.side-col {
		flex: 1;
		min-width: 290px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.level-group {
		display: flex;
		width: 100%;
		:deep(.ant-radio-button-wrapper) {
			flex: 1;
			text-align: center;
			padding: 0 6px;
		}
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
	.label {
		font-size: 12px;
		color: var(--text-color-2);
	}
	.switch-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 8px;
		margin-top: 4px;
		border-top: 1px solid var(--border-color);
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
	.best-list {
		display: flex;
		flex-flow: column;
		gap: 4px;
	}
	.best-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 5px 10px;
		border-radius: 7px;
		background: rgba(127, 127, 127, 0.06);
		.bn {
			font-size: 12px;
			color: var(--text-color-2);
		}
		.bv {
			font-size: 14px;
			font-weight: 700;
			color: #1677ff;
			font-variant-numeric: tabular-nums;
		}
		&.on {
			background: rgba(22, 119, 255, 0.12);
			.bn {
				color: var(--text-color);
				font-weight: 600;
			}
		}
	}
}
</style>
