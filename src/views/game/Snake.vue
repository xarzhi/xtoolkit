<template>
	<div class="tool snake">
		<h1 class="tool-title">
			贪吃蛇
			<span class="tip">方向键 / WASD 控制，空格暂停；吃掉果实变长，撞墙或咬到自己就结束</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<div class="board-col">
					<div class="tool-card board-card">
						<div class="hud">
							<div class="hud-item">
								<span class="k">得分</span>
								<span class="v">{{ score }}</span>
							</div>
							<div class="hud-item">
								<span class="k">本档最高</span>
								<span class="v">{{ best }}</span>
							</div>
							<div class="hud-item">
								<span class="k">长度</span>
								<span class="v">{{ snake.length }}</span>
							</div>
						</div>

						<div class="board-wrap">
							<canvas ref="canvasRef" class="board"></canvas>
							<div v-if="state !== 'running'" class="overlay">
								<div class="big">{{ overlay.title }}</div>
								<div class="hint">{{ overlay.hint }}</div>
								<a-button type="primary" size="large" @click="start">{{ overlay.button }}</a-button>
							</div>
						</div>

						<div class="pad">
							<button class="pad-btn" title="左" @click="setDir(-1, 0)">←</button>
							<button class="pad-btn" title="上" @click="setDir(0, -1)">↑</button>
							<button class="pad-btn" title="下" @click="setDir(0, 1)">↓</button>
							<button class="pad-btn" title="右" @click="setDir(1, 0)">→</button>
						</div>
					</div>
				</div>

				<div class="side-col">
					<div class="tool-card block">
						<div class="block-title">难度</div>
						<a-radio-group v-model:value="settings.level" button-style="solid" :disabled="state === 'running'" @change="resetGame">
							<a-radio-button value="easy">轻松</a-radio-button>
							<a-radio-button value="normal">普通</a-radio-button>
							<a-radio-button value="hard">困难</a-radio-button>
							<a-radio-button value="insane">地狱</a-radio-button>
						</a-radio-group>
						<div class="hint" style="margin-top: 8px">{{ levelDesc }}</div>

						<div class="switch-row">
							<span class="label">穿墙模式（从另一侧出来）</span>
							<a-switch v-model:checked="settings.wrap" size="small" @change="resetGame" />
						</div>
						<div class="switch-row">
							<span class="label">显示网格</span>
							<a-switch v-model:checked="settings.grid" size="small" />
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">玩法</div>
						<div class="hint">· 方向键或 WASD 转向，不能直接掉头</div>
						<div class="hint">· 每吃一个果实 +10 分，蛇身变长、速度略快</div>
						<div class="hint">· 困难 / 地狱档场地里会出现灰色石块，撞上直接结束</div>
						<div class="hint">· 空格 开始 / 暂停，R 重新开始</div>
						<div class="hint">· 切到别的页面会自动暂停</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">各难度最高分</div>
						<div class="best-list">
							<div
								class="best-item"
								v-for="item in bestList"
								:key="item.key"
								:class="{ on: item.key === settings.level }"
							>
								<span class="bn">{{ item.label }}</span>
								<span class="bv">{{ item.score }}</span>
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
			<span class="hint">当前速度：每步 {{ stepMs }} ms</span>
			<a-space>
				<a-button @click="resetGame">重新开始</a-button>
				<a-button type="primary" @click="togglePause">{{ state === 'running' ? '暂停' : '继续 / 开始' }}</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'

const COLS = 24
const ROWS = 24
const SIZE = 480 // 画布逻辑尺寸
const BEST_KEY = 'xtools-snake-best-v2'
const OLD_BEST_KEY = 'xtools-snake-best'

/** 四档难度：速度 + 场地石块数量 */
const LEVELS = {
	easy: { label: '轻松', speed: 160, obstacles: 0, desc: '每步 160ms，场地干净，适合慢慢玩' },
	normal: { label: '普通', speed: 122, obstacles: 0, desc: '每步 122ms，标准节奏' },
	hard: { label: '困难', speed: 96, obstacles: 12, desc: '每步 96ms，场地里随机出现 12 个石块' },
	insane: { label: '地狱', speed: 74, obstacles: 26, desc: '每步 74ms + 26 个石块，加速也更凶' },
}
const LEVEL_KEYS = Object.keys(LEVELS)

const loadBestMap = () => {
	let map = {}
	try {
		map = JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}
	} catch {
		map = {}
	}
	// 老版本只存了一个数字，迁移到普通难度
	if (!Object.keys(map).length) {
		const legacy = Number(localStorage.getItem(OLD_BEST_KEY) || 0) || 0
		if (legacy > 0) map = { normal: legacy }
	}
	for (const key of LEVEL_KEYS) if (!Number.isFinite(Number(map[key]))) map[key] = 0
	return map
}

const canvasRef = ref(null)
const state = ref('idle') // idle | running | paused | over
const score = ref(0)
const bestMap = ref(loadBestMap())
const best = computed(() => Number(bestMap.value[settings.level]) || 0)
const snake = ref([])
const obstacles = ref([])
const food = ref({ x: 0, y: 0 })
const stepMs = ref(LEVELS.normal.speed)
const settings = reactive({ level: 'normal', wrap: false, grid: true })

const saveBest = () => {
	localStorage.setItem(BEST_KEY, JSON.stringify(bestMap.value))
	const legacy = Object.values(bestMap.value).reduce((sum, value) => sum + (Number(value) || 0), 0)
	localStorage.setItem(OLD_BEST_KEY, String(legacy))
}

const isObstacle = (x, y) => obstacles.value.some(item => item.x === x && item.y === y)

let dir = { x: 1, y: 0 }
let queue = []
let raf = 0
let lastTs = 0
let acc = 0
let ctx = null

const levelDesc = computed(() => LEVELS[settings.level]?.desc || '')
const bestList = computed(() =>
	LEVEL_KEYS.map(key => ({ key, label: LEVELS[key].label, score: Number(bestMap.value[key]) || 0 }))
)

const overlay = computed(() => {
	if (state.value === 'over') return { title: '游戏结束', hint: `本局得分 ${score.value}`, button: '再来一局' }
	if (state.value === 'paused') return { title: '已暂停', hint: '按空格或点下面按钮继续', button: '继续' }
	return { title: '准备好了吗', hint: '方向键 / WASD 控制，吃掉红点变长', button: '开始游戏' }
})

/* ---------------- 初始化 ---------------- */
const setupCanvas = () => {
	const canvas = canvasRef.value
	if (!canvas) return
	const dpr = Math.min(window.devicePixelRatio || 1, 2)
	canvas.width = SIZE * dpr
	canvas.height = SIZE * dpr
	ctx = canvas.getContext('2d')
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

const spawnFood = () => {
	const empty = []
	for (let y = 0; y < ROWS; y += 1) {
		for (let x = 0; x < COLS; x += 1) {
			if (snake.value.some(s => s.x === x && s.y === y)) continue
			if (isObstacle(x, y)) continue
			empty.push({ x, y })
		}
	}
	food.value = empty.length ? empty[Math.floor(Math.random() * empty.length)] : { x: 0, y: 0 }
}

/** 按难度随机撒石块，出生点周围一定留空 */
const buildObstacles = () => {
	const count = LEVELS[settings.level]?.obstacles || 0
	const list = []
	if (!count) return list
	const cx = Math.floor(COLS / 2)
	const cy = Math.floor(ROWS / 2)
	const used = new Set()
	for (let x = cx - 3; x <= cx + 3; x += 1) used.add(`${x},${cy}`)
	used.add(`${cx},${cy - 1}`)
	used.add(`${cx},${cy + 1}`)
	let guard = 0
	while (list.length < count && guard < 3000) {
		guard += 1
		const x = Math.floor(Math.random() * COLS)
		const y = Math.floor(Math.random() * ROWS)
		const key = `${x},${y}`
		if (used.has(key)) continue
		used.add(key)
		list.push({ x, y })
	}
	return list
}

const resetGame = () => {
	const cx = Math.floor(COLS / 2)
	const cy = Math.floor(ROWS / 2)
	snake.value = [
		{ x: cx, y: cy },
		{ x: cx - 1, y: cy },
		{ x: cx - 2, y: cy },
	]
	obstacles.value = buildObstacles()
	dir = { x: 1, y: 0 }
	queue = []
	score.value = 0
	stepMs.value = LEVELS[settings.level]?.speed || LEVELS.normal.speed
	acc = 0
	lastTs = 0
	state.value = 'idle'
	spawnFood()
	draw()
}

const start = () => {
	if (state.value === 'over' || state.value === 'idle') {
		if (state.value === 'over') resetGame()
		state.value = 'running'
		lastTs = 0
		return
	}
	state.value = 'running'
	lastTs = 0
}

const togglePause = () => {
	if (state.value === 'running') state.value = 'paused'
	else start()
}

/* ---------------- 逻辑 ---------------- */
const gameOver = () => {
	state.value = 'over'
	const record = Number(bestMap.value[settings.level]) || 0
	if (score.value > record) {
		bestMap.value = { ...bestMap.value, [settings.level]: score.value }
		saveBest()
		message.success(`新纪录：${score.value} 分（${LEVELS[settings.level].label}）`)
	}
}

const bumpBest = () => {
	const record = Number(bestMap.value[settings.level]) || 0
	if (score.value > record) {
		bestMap.value = { ...bestMap.value, [settings.level]: score.value }
		saveBest()
	}
}

const tick = () => {
	if (queue.length) {
		const next = queue.shift()
		if (next.x !== -dir.x || next.y !== -dir.y) dir = next
	}
	const head = snake.value[0]
	let nx = head.x + dir.x
	let ny = head.y + dir.y

	if (settings.wrap) {
		nx = (nx + COLS) % COLS
		ny = (ny + ROWS) % ROWS
	} else if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
		gameOver()
		return
	}

	if (isObstacle(nx, ny)) {
		gameOver()
		return
	}

	const eating = nx === food.value.x && ny === food.value.y
	const body = eating ? snake.value : snake.value.slice(0, -1)
	if (body.some(s => s.x === nx && s.y === ny)) {
		gameOver()
		return
	}

	const next = [{ x: nx, y: ny }, ...snake.value]
	if (eating) {
		score.value += 10
		bumpBest()
		snake.value = next
		spawnFood()
		// 每 50 分提一次速，地狱档提得更猛
		const step = settings.level === 'insane' ? 10 : 8
		const floor = settings.level === 'insane' ? 48 : 62
		stepMs.value = Math.max(floor, (LEVELS[settings.level]?.speed || 120) - Math.floor(score.value / 50) * step)
	} else {
		next.pop()
		snake.value = next
	}
}

/* ---------------- 渲染 ---------------- */
const draw = () => {
	const canvas = canvasRef.value
	if (!canvas || !ctx) return
	const cell = SIZE / COLS

	ctx.clearRect(0, 0, SIZE, SIZE)
	// 棋盘底色
	ctx.fillStyle = '#0f172a'
	ctx.fillRect(0, 0, SIZE, SIZE)

	if (settings.grid) {
		ctx.strokeStyle = 'rgba(255,255,255,0.045)'
		ctx.lineWidth = 1
		for (let i = 1; i < COLS; i += 1) {
			ctx.beginPath()
			ctx.moveTo(i * cell, 0)
			ctx.lineTo(i * cell, SIZE)
			ctx.stroke()
			ctx.beginPath()
			ctx.moveTo(0, i * cell)
			ctx.lineTo(SIZE, i * cell)
			ctx.stroke()
		}
	}

	// 石块障碍
	obstacles.value.forEach(item => {
		const x = item.x * cell + 2
		const y = item.y * cell + 2
		const w = cell - 4
		ctx.fillStyle = '#475569'
		ctx.beginPath()
		const r = Math.min(4, w / 3)
		ctx.roundRect ? ctx.roundRect(x, y, w, w, r) : ctx.rect(x, y, w, w)
		ctx.fill()
		ctx.strokeStyle = 'rgba(148,163,184,0.55)'
		ctx.lineWidth = 1
		ctx.stroke()
	})

	// 果实
	const fx = food.value.x * cell + cell / 2
	const fy = food.value.y * cell + cell / 2
	ctx.save()
	ctx.shadowColor = 'rgba(239,68,68,0.75)'
	ctx.shadowBlur = 14
	ctx.fillStyle = '#ef4444'
	ctx.beginPath()
	ctx.arc(fx, fy, cell * 0.34, 0, Math.PI * 2)
	ctx.fill()
	ctx.restore()

	// 蛇身
	const total = snake.value.length
	snake.value.forEach((seg, i) => {
		const t = total <= 1 ? 0 : i / (total - 1)
		const inset = i === 0 ? 1 : 1.6
		const x = seg.x * cell + inset
		const y = seg.y * cell + inset
		const w = cell - inset * 2
		if (i === 0) {
			ctx.fillStyle = '#4ade80'
		} else {
			const g = ctx.createLinearGradient(x, y, x + w, y + w)
			g.addColorStop(0, `rgba(34,197,94,${1 - t * 0.45})`)
			g.addColorStop(1, `rgba(21,128,61,${1 - t * 0.45})`)
			ctx.fillStyle = g
		}
		ctx.beginPath()
		const r = Math.min(6, w / 2)
		ctx.roundRect ? ctx.roundRect(x, y, w, w, r) : ctx.rect(x, y, w, w)
		ctx.fill()
	})

	// 头部眼睛
	const head = snake.value[0]
	if (head) {
		const hx = head.x * cell + cell / 2
		const hy = head.y * cell + cell / 2
		const ox = dir.x * cell * 0.16
		const oy = dir.y * cell * 0.16
		const px = dir.x === 0 ? cell * 0.18 : 0
		const py = dir.y === 0 ? cell * 0.18 : 0
		ctx.fillStyle = '#0f172a'
		ctx.beginPath()
		ctx.arc(hx + ox + px, hy + oy + py, cell * 0.09, 0, Math.PI * 2)
		ctx.arc(hx + ox - px, hy + oy - py, cell * 0.09, 0, Math.PI * 2)
		ctx.fill()
	}
}

/* ---------------- 主循环 ---------------- */
const frame = ts => {
	raf = requestAnimationFrame(frame)
	if (state.value !== 'running') {
		draw()
		return
	}
	if (!lastTs) lastTs = ts
	const dt = Math.min(80, ts - lastTs)
	lastTs = ts
	acc += dt
	let guard = 0
	while (acc >= stepMs.value && state.value === 'running' && guard < 8) {
		acc -= stepMs.value
		guard += 1
		tick()
	}
	draw()
}

/* ---------------- 输入 ---------------- */
const setDir = (x, y) => {
	const d = { x, y }
	const ref = queue.length ? queue[queue.length - 1] : dir
	// 不允许 180° 掉头，也不重复入队同一方向
	if (d.x === -ref.x && d.y === -ref.y) return
	if (d.x === ref.x && d.y === ref.y) return
	if (queue.length >= 3) return
	queue.push(d)
	if (state.value === 'idle') start()
}

const onKeyDown = evt => {
	const tag = (evt.target?.tagName || '').toLowerCase()
	if (tag === 'input' || tag === 'textarea' || evt.target?.isContentEditable) return
	const key = evt.key
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
	if (map[key]) {
		evt.preventDefault()
		setDir(...map[key])
		return
	}
	if (evt.code === 'Space') {
		evt.preventDefault()
		togglePause()
		return
	}
	if (key === 'r' || key === 'R') {
		evt.preventDefault()
		resetGame()
	}
}

const onVisibility = () => {
	if (document.hidden && state.value === 'running') state.value = 'paused'
}

const clearBest = () => {
	bestMap.value = { easy: 0, normal: 0, hard: 0, insane: 0 }
	localStorage.removeItem(BEST_KEY)
	localStorage.removeItem(OLD_BEST_KEY)
	message.success('最高分已清除')
}

watch(() => settings.grid, draw)

onMounted(() => {
	setupCanvas()
	resetGame()
	raf = requestAnimationFrame(frame)
	window.addEventListener('keydown', onKeyDown)
	window.addEventListener('resize', setupCanvas)
	document.addEventListener('visibilitychange', onVisibility)
	// 开发期暴露内部状态，便于无头浏览器验证吃果实/撞墙等逻辑（生产构建不含）
	if (import.meta.env.DEV) {
		window.__snakeTest = {
			snake,
			food,
			score,
			best,
			bestMap,
			state,
			stepMs,
			obstacles,
			settings,
			tick,
			setDir,
			resetGame,
			setLevel: value => {
				settings.level = value
				resetGame()
			},
			info: () => ({
				level: settings.level,
				obstacles: obstacles.value.length,
				stepMs: stepMs.value,
				best: best.value,
			}),
		}
	}
})

onBeforeUnmount(() => {
	cancelAnimationFrame(raf)
	window.removeEventListener('keydown', onKeyDown)
	window.removeEventListener('resize', setupCanvas)
	document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.snake {
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
		.hud-item {
			display: flex;
			flex-flow: column;
			align-items: center;
			.k {
				font-size: 11px;
				color: var(--text-color-3);
			}
			.v {
				font-size: 20px;
				font-weight: 700;
				color: var(--text-color);
				font-variant-numeric: tabular-nums;
				line-height: 1.2;
			}
		}
	}
	.board-wrap {
		position: relative;
		width: min(440px, 50vh);
		aspect-ratio: 1;
		.board {
			display: block;
			width: 100%;
			height: 100%;
			border-radius: 12px;
			background: #0f172a;
			touch-action: none;
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
			background: rgba(15, 23, 42, 0.72);
			backdrop-filter: blur(2px);
			.big {
				font-size: 20px;
				font-weight: 700;
				color: #f8fafc;
			}
			.hint {
				color: rgba(248, 250, 252, 0.7);
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
		min-width: 280px;
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
			font-size: 16px;
			font-weight: 700;
			color: #f59e0b;
			font-variant-numeric: tabular-nums;
		}
		&.on {
			background: rgba(245, 158, 11, 0.14);
			.bn {
				color: var(--text-color);
				font-weight: 600;
			}
		}
	}
}
</style>
