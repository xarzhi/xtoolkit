<template>
	<div class="tool bezierCurve">
		<h1 class="tool-title">
			贝塞尔曲线
			<span class="tip">拖动锚点与控制柄塑造曲线，实时导出 CSS cubic-bezier 与 SVG 路径</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<!-- 画布 -->
				<div class="stage-col">
					<div class="stage-box">
						<svg ref="svgRef" viewBox="0 0 400 400" class="stage" @pointerdown="onStageDown" @dblclick="onStageDblClick">
							<defs>
								<pattern id="bz-grid" width="34" height="34" patternUnits="userSpaceOnUse" x="30" y="30">
									<path d="M 34 0 L 0 0 0 34" fill="none" stroke="#e5e9f0" stroke-width="1" />
								</pattern>
							</defs>

							<rect x="30" y="30" width="340" height="340" fill="url(#bz-grid)" />
							<rect x="30" y="30" width="340" height="340" fill="none" stroke="#cbd5e1" stroke-width="1.2" />

							<!-- 参考对角线 -->
							<line x1="30" y1="370" x2="370" y2="30" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4 4" />

							<!-- 控制多边形 -->
							<g stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 3">
								<line
									v-for="(l, i) in legs"
									:key="'leg' + i"
									:x1="l.x1"
									:y1="l.y1"
									:x2="l.x2"
									:y2="l.y2"
								/>
							</g>

							<!-- 曲线 -->
							<path ref="pathRef" :d="screenPath" fill="none" stroke="#1677ff" stroke-width="2.4" stroke-linecap="round" />

							<!-- 动画小球 -->
							<circle :cx="dot.x" :cy="dot.y" r="5.5" fill="#f97316" stroke="#fff" stroke-width="1.4" />

							<!-- 锚点 -->
							<g v-for="(p, i) in points" :key="'p' + i">
								<circle
									:cx="sx(p.out.x)"
									:cy="sy(p.out.y)"
									r="5"
									class="handle"
									@pointerdown.stop="startDrag('out', i, $event)"
								/>
								<circle
									:cx="sx(p.in.x)"
									:cy="sy(p.in.y)"
									r="5"
									class="handle"
									@pointerdown.stop="startDrag('in', i, $event)"
								/>
								<rect
									:x="sx(p.x) - 6"
									:y="sy(p.y) - 6"
									width="12"
									height="12"
									class="anchor"
									:class="{ active: selected === i }"
									@pointerdown.stop="startDrag('point', i, $event)"
								/>
							</g>
						</svg>

						<div class="stage-tip hint">
							双击空白处添加节点 · 拖动方块移动锚点 · 拖动圆点调整控制柄 · Delete 删除选中锚点 · 锚点与控制柄都限制在方框内
						</div>
					</div>

					<div class="preview">
						<div class="preview-head">
							<span>轨迹动画</span>
							<span class="hint">{{ points.length }} 段 · {{ points.length - 1 }} 个贝塞尔段</span>
						</div>
						<div class="track">
							<div class="bar" :style="{ transitionTimingFunction: cssEasing, left: playing ? 'calc(100% - 26px)' : '0%' }"></div>
						</div>
						<a-space :size="8" style="margin-top: 10px" wrap>
							<a-button size="small" type="primary" @click="togglePlay">{{ playing ? '重置' : '播放' }}</a-button>
							<a-button size="small" @click="reset">重置默认曲线</a-button>
						</a-space>
					</div>
				</div>

				<!-- 面板 -->
				<div class="panel">
					<div class="tool-card block">
						<div class="block-title">常用预设</div>
						<div class="presets">
							<button v-for="p in PRESETS" :key="p.name" class="preset" @click="applyPreset(p)">
								{{ p.name }}
							</button>
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">
							锚点坐标（0 ~ 1）
							<a-button size="small" style="margin-left: auto" @click="appendPoint">+ 添加节点</a-button>
						</div>
						<div class="points">
							<div v-for="(p, i) in points" :key="'row' + i" class="point-row">
								<span class="idx">{{ i + 1 }}</span>
								<a-input-number v-model:value="p.x" :min="0" :max="1" :step="0.01" size="small" style="width: 74px" />
								<a-input-number v-model:value="p.y" :min="0" :max="1" :step="0.01" size="small" style="width: 74px" />
								<a-button size="small" type="text" danger :disabled="points.length <= 2" @click="removePoint(i)">删除</a-button>
							</div>
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">输出</div>

						<div class="out-row">
							<span class="out-label">CSS 缓动</span>
							<a-button size="small" :disabled="!isEasing" @click="copy(cssEasing)">复制</a-button>
						</div>
						<pre class="code">{{ isEasing ? `cubic-bezier(${cssEasing.replace('cubic-bezier(', '').replace(')', '')})` : '（多段曲线无法表示为单个 cubic-bezier）' }}</pre>

						<div class="out-row">
							<span class="out-label">SVG 路径</span>
							<a-button size="small" @click="copy(exportPath)">复制</a-button>
						</div>
						<pre class="code">{{ exportPath }}</pre>

						<div class="out-row">
							<span class="out-label">SVG 代码</span>
							<a-button size="small" @click="copy(svgCode)">复制</a-button>
						</div>
						<pre class="code">{{ svgCode }}</pre>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">坐标系：X 横向进度 0→1，Y 纵向数值 0→1（越大越高）；导出 SVG 时自动换算为屏幕坐标</span>
			<a-space>
				<a-button @click="exportSvgFile">导出 SVG 文件</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { copyText, saveTextAs } from '@/utils/tauriIO'

/* 画布映射：世界坐标 (0~1) ↔ 屏幕坐标（Y 轴翻转，1 在上方） */
const PAD = 30
const SIZE = 340
const sx = x => PAD + x * SIZE
const sy = y => PAD + (1 - y) * SIZE

const PRESETS = [
	{ name: '线性', points: [0, 0, 1, 1] },
	{ name: 'ease', points: [0.25, 0.1, 0.25, 1] },
	{ name: 'ease-in', points: [0.42, 0, 1, 1] },
	{ name: 'ease-out', points: [0, 0, 0.58, 1] },
	{ name: 'ease-in-out', points: [0.42, 0, 0.58, 1] },
	{ name: '快出慢停', points: [0.34, 1, 0.64, 1] },
	{ name: '缓出加长', points: [0.16, 1, 0.3, 1] },
]

const makePoints = (x1, y1, x2, y2) => [
	{ x: 0, y: 0, in: { x: 0, y: 0 }, out: { x: x1, y: y1 } },
	{ x: 1, y: 1, in: { x: x2, y: y2 }, out: { x: 1, y: 1 } },
]

const points = ref(makePoints(0.42, 0, 0.58, 1))
const selected = ref(-1)
const playing = ref(false)

const pathRef = ref(null)
const svgRef = ref(null)

/* ---------------- 路径 ---------------- */
const screenPath = computed(() => {
	const list = points.value
	if (list.length < 2) return ''
	let d = `M ${sx(list[0].x)} ${sy(list[0].y)}`
	for (let i = 1; i < list.length; i += 1) {
		const prev = list[i - 1]
		const cur = list[i]
		d += ` C ${sx(prev.out.x)} ${sy(prev.out.y)} ${sx(cur.in.x)} ${sy(cur.in.y)} ${sx(cur.x)} ${sy(cur.y)}`
	}
	return d
})

/** 导出的 SVG path：0~100 归一化坐标 + Y 翻转 */
const exportPath = computed(() => {
	const list = points.value
	if (list.length < 2) return ''
	const fx = v => +(v * 100).toFixed(2)
	const fy = v => +((1 - v) * 100).toFixed(2)
	let d = `M ${fx(list[0].x)} ${fy(list[0].y)}`
	for (let i = 1; i < list.length; i += 1) {
		const prev = list[i - 1]
		const cur = list[i]
		d += ` C ${fx(prev.out.x)} ${fy(prev.out.y)}, ${fx(cur.in.x)} ${fy(cur.in.y)}, ${fx(cur.x)} ${fy(cur.y)}`
	}
	return d
})

const svgCode = computed(
	() =>
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">\n  <path d="${exportPath.value}"\n        fill="none" stroke="#1677ff" stroke-width="2" />\n</svg>`
)

/* ---------------- CSS 缓动 ---------------- */
const isEasing = computed(
	() =>
		points.value.length === 2 &&
		Math.abs(points.value[0].x) < 1e-6 &&
		Math.abs(points.value[0].y) < 1e-6 &&
		Math.abs(points.value[1].x - 1) < 1e-6 &&
		Math.abs(points.value[1].y - 1) < 1e-6
)

const cssEasing = computed(() => {
	if (!isEasing.value) return 'cubic-bezier(0.42, 0, 0.58, 1)'
	const p = points.value
	const r = v => Math.round(v * 1000) / 1000
	return `cubic-bezier(${r(p[0].out.x)}, ${r(p[0].out.y)}, ${r(p[1].in.x)}, ${r(p[1].in.y)})`
})

/* ---------------- 控制柄连线 ---------------- */
const legs = computed(() => {
	const out = []
	const list = points.value
	for (const p of list) {
		out.push({ x1: sx(p.x), y1: sy(p.y), x2: sx(p.out.x), y2: sy(p.out.y) })
		out.push({ x1: sx(p.x), y1: sy(p.y), x2: sx(p.in.x), y2: sy(p.in.y) })
	}
	return out
})

/* ---------------- 拖拽 ---------------- */
let drag = null
const dot = reactive({ x: 0, y: 0 })

const toWorld = evt => {
	const rect = svgRef.value.getBoundingClientRect()
	const x = ((evt.clientX - rect.left) / rect.width) * 400
	const y = ((evt.clientY - rect.top) / rect.height) * 400
	return { x: (x - PAD) / SIZE, y: 1 - (y - PAD) / SIZE }
}

const clamp = v => Math.min(1, Math.max(0, v))

const startDrag = (kind, index, evt) => {
	if (evt.button !== 0) return
	evt.preventDefault()
	selected.value = index
	const p = points.value[index]
	drag = {
		kind,
		index,
		start: toWorld(evt),
		orig: kind === 'point' ? { x: p.x, y: p.y, in: { ...p.in }, out: { ...p.out } } : null,
	}
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
}

const onMove = evt => {
	if (!drag) return
	const w = toWorld(evt)
	const dx = w.x - drag.start.x
	const dy = w.y - drag.start.y
	const p = points.value[drag.index]
	if (!p) return

	if (drag.kind === 'point') {
		p.x = clamp(drag.orig.x + dx)
		p.y = clamp(drag.orig.y + dy)
		// 控制柄跟随锚点一起平移，但不允许被带出方框
		p.in = { x: clamp(drag.orig.in.x + dx), y: clamp(drag.orig.in.y + dy) }
		p.out = { x: clamp(drag.orig.out.x + dx), y: clamp(drag.orig.out.y + dy) }
	} else {
		const target = p[drag.kind === 'in' ? 'in' : 'out']
		target.x = clamp(w.x)
		target.y = clamp(w.y)
	}
}

const onUp = () => {
	drag = null
	window.removeEventListener('pointermove', onMove)
	window.removeEventListener('pointerup', onUp)
}

/* ---------------- 增删节点 ---------------- */
const appendPoint = () => {
	const list = points.value
	const last = list[list.length - 1]
	const prev = list[list.length - 2] || { x: 0, y: 0 }
	const nx = clamp(last.x + 0.3)
	const ny = clamp(last.y + 0.3)
	const p = {
		x: nx,
		y: ny,
		in: { x: clamp(nx - (nx - prev.x) / 3), y: clamp(ny - (ny - prev.y) / 3) },
		out: { x: nx, y: ny },
	}
	list.push(p)
	selected.value = list.length - 1
}

const removePoint = index => {
	if (points.value.length <= 2) return
	points.value.splice(index, 1)
	selected.value = -1
}

const onStageDblClick = evt => {
	if (evt.target.closest('.anchor') || evt.target.closest('.handle')) return
	const w = toWorld(evt)
	const list = points.value
	const last = list[list.length - 1]
	const p = {
		x: clamp(w.x),
		y: clamp(w.y),
		in: { x: clamp(w.x - (w.x - last.x) / 3), y: clamp(w.y - (w.y - last.y) / 3) },
		out: { x: clamp(w.x), y: clamp(w.y) },
	}
	list.push(p)
	selected.value = list.length - 1
}

const onStageDown = () => {
	selected.value = -1
}

/* ---------------- 预设 / 重置 ---------------- */
const applyPreset = preset => {
	const [x1, y1, x2, y2] = preset.points
	points.value = makePoints(x1, y1, x2, y2)
	selected.value = -1
}

const reset = () => applyPreset(PRESETS[4])

const copy = async text => {
	const ok = await copyText(text)
	message[ok ? 'success' : 'error'](ok ? '已复制' : '复制失败')
}

const exportSvgFile = async () => {
	try {
		const path = await saveTextAs(svgCode.value, {
			defaultPath: '曲线.svg',
			filters: [{ name: 'SVG', extensions: ['svg'] }],
		})
		if (path) message.success(`已导出：${path}`)
	} catch (err) {
		message.error(err?.message || String(err))
	}
}

/* ---------------- 小圆点沿曲线运动 ---------------- */
let frame = 0
let t = 0
const tick = () => {
	frame = requestAnimationFrame(tick)
	const el = pathRef.value
	if (!el) return
	const len = el.getTotalLength?.() || 0
	if (!len) return
	t = (t + 0.004) % 1
	const pt = el.getPointAtLength(t * len)
	dot.x = pt.x
	dot.y = pt.y
}

const togglePlay = () => {
	playing.value = !playing.value
	t = 0
}

onMounted(() => {
	tick()
	window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
	if (frame) cancelAnimationFrame(frame)
	onUp()
	window.removeEventListener('keydown', onKeyDown)
})

const onKeyDown = evt => {
	const tag = (evt.target?.tagName || '').toLowerCase()
	if (tag === 'input' || tag === 'textarea') return
	if ((evt.key === 'Delete' || evt.key === 'Backspace') && selected.value >= 0) {
		evt.preventDefault()
		removePoint(selected.value)
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.bezierCurve {
	.layout {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.stage-col {
		flex: 1;
		min-width: 380px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.stage-box {
		background: var(--panel-bg);
		border-radius: 12px;
		padding: 8px;
	}
	.stage {
		/* 正方形画布：同时受宽度和视口高度约束，保证下方「轨迹动画」不用滚动就能看到 */
		width: min(100%, 480px, 44vh);
		max-width: 100%;
		display: block;
		margin: 0 auto;
		touch-action: none;
		user-select: none;
	}
	:deep(.anchor) {
		fill: #fff;
		stroke: #1677ff;
		stroke-width: 1.6;
		cursor: move;
		&.active {
			fill: #1677ff;
		}
	}
	:deep(.handle) {
		fill: #fff;
		stroke: #f97316;
		stroke-width: 1.6;
		cursor: pointer;
	}
	.stage-tip {
		text-align: center;
		padding: 2px 0 6px;
	}
	.preview {
		background: var(--panel-bg);
		border-radius: 12px;
		padding: 12px 16px;
	}
	.preview-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		font-weight: 600;
		color: var(--text-color);
		margin-bottom: 10px;
		font-size: 13px;
	}
	.track {
		position: relative;
		height: 26px;
		border-radius: 13px;
		background: rgba(127, 127, 127, 0.1);
		border: 1px solid var(--border-color);
		overflow: hidden;
		.bar {
			position: absolute;
			top: 3px;
			left: 0;
			width: 20px;
			height: 20px;
			border-radius: 50%;
			background: linear-gradient(135deg, #1677ff, #06b6d4);
			transition-property: left;
			transition-duration: 1.6s;
		}
	}
	.panel {
		flex: 1;
		min-width: 340px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.block {
		.block-title {
			font-weight: 600;
			color: var(--text-color);
			margin-bottom: 10px;
			display: flex;
			align-items: center;
			gap: 8px;
		}
	}
	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		.preset {
			padding: 5px 12px;
			border: 1px solid var(--border-color);
			border-radius: 8px;
			background: transparent;
			cursor: pointer;
			font-size: 12px;
			color: var(--text-color-2);
			transition: all 0.15s;
			&:hover {
				border-color: #1677ff;
				color: #1677ff;
			}
		}
	}
	.points {
		display: flex;
		flex-flow: column;
		gap: 8px;
		.point-row {
			display: flex;
			align-items: center;
			gap: 8px;
			.idx {
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
		}
	}
	.out-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 8px;
		.out-label {
			font-size: 12px;
			color: var(--text-color-3);
		}
	}
	.code {
		margin: 6px 0 0;
		padding: 8px 10px;
		background: rgba(127, 127, 127, 0.09);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		font-family: Consolas, Monaco, monospace;
		font-size: 12px;
		line-height: 1.6;
		color: var(--text-color);
		white-space: pre-wrap;
		word-break: break-all;
		max-height: 130px;
		overflow: auto;
	}
}
</style>
