<template>
	<div class="tool diagramEditor">
		<h1 class="tool-title">
			流程图绘制
			<span class="tip">draw.io 风格：拖拽形状、连线、双击编辑文字，数据自动保存在本地</span>
		</h1>

		<div class="tool-content">
			<div class="editor">
				<!-- 左侧：形状面板 -->
				<aside class="palette">
					<div class="panel-title">形状</div>
					<div class="shape-grid">
						<button
							v-for="s in SHAPES"
							:key="s.type"
							class="shape-btn"
							:class="{ active: mode === `draw:${s.type}` }"
							:title="s.label"
							@click="pickShape(s.type)"
						>
							<svg viewBox="0 0 44 30" class="shape-icon">
								<path :d="s.icon" fill="none" stroke="currentColor" stroke-width="1.4" />
							</svg>
							<span>{{ s.label }}</span>
						</button>
					</div>

					<div class="panel-title">工具</div>
					<div class="tool-list">
						<button class="tool-btn" :class="{ active: mode === 'select' }" @click="setMode('select')">选择 / 移动</button>
						<button class="tool-btn" :class="{ active: mode === 'connect' }" @click="setMode('connect')">连线</button>
					</div>

					<div class="panel-title">快速添加</div>
					<div class="tool-list">
						<button class="tool-btn" @click="addNodeAtCenter('rect')">矩形</button>
						<button class="tool-btn" @click="addNodeAtCenter('diamond')">判断</button>
						<button class="tool-btn" @click="addNodeAtCenter('roundRect')">圆角矩形</button>
						<button class="tool-btn" @click="addNodeAtCenter('text')">文本</button>
					</div>
				</aside>

				<!-- 中间：画布 -->
				<div class="canvas-wrap" ref="wrapRef">
					<div class="canvas-toolbar">
						<a-space :size="4" wrap>
							<a-tooltip title="撤销 Ctrl+Z">
								<a-button size="small" :disabled="!undoStack.length" @click="undo">撤销</a-button>
							</a-tooltip>
							<a-tooltip title="重做 Ctrl+Y">
								<a-button size="small" :disabled="!redoStack.length" @click="redo">重做</a-button>
							</a-tooltip>
							<a-button size="small" :disabled="!selection.length" @click="removeSelection">删除</a-button>
							<a-button size="small" :disabled="!selection.length" @click="duplicateSelection">复制一份</a-button>
							<a-button size="small" :class="{ on: gridOn }" @click="gridOn = !gridOn">网格</a-button>
							<a-button size="small" @click="fitView">适应画布</a-button>
							<a-button size="small" @click="zoomBy(1.2)">放大</a-button>
							<a-button size="small" @click="zoomBy(1 / 1.2)">缩小</a-button>
							<span class="zoom-label">{{ Math.round(view.scale * 100) }}%</span>
						</a-space>
					</div>

					<svg
						ref="svgRef"
						class="stage"
						@pointerdown="onCanvasDown"
						@wheel.prevent="onWheel"
						@dblclick="onCanvasDblClick"
					>
						<defs>
							<pattern
								id="dg-grid"
								patternUnits="userSpaceOnUse"
								:width="20 * view.scale"
								:height="20 * view.scale"
								:x="view.tx % (20 * view.scale)"
								:y="view.ty % (20 * view.scale)"
							>
								<circle :cx="1" :cy="1" :r="Math.max(0.6, 1 * view.scale)" fill="#c9d2de" />
							</pattern>
							<marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
								<path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
							</marker>
							<marker id="dg-arrow-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
								<path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="#475569" stroke-width="1.6" />
							</marker>
						</defs>

						<rect v-show="gridOn" width="100%" height="100%" fill="url(#dg-grid)" />

						<g :transform="`translate(${view.tx} ${view.ty}) scale(${view.scale})`">
							<!-- 连线 -->
							<g v-for="e in renderEdges" :key="e.id">
								<path
									class="edge-hit"
									:d="e.d"
									@pointerdown.stop="onEdgeDown(e.source, $event)"
								/>
								<path
									class="edge-line"
									:d="e.d"
									:stroke="e.stroke"
									:stroke-width="e.strokeWidth"
									:stroke-dasharray="e.dashed ? '6 4' : ''"
									fill="none"
									:marker-end="e.arrowEnd ? 'url(#dg-arrow)' : ''"
									:marker-start="e.arrowStart ? 'url(#dg-arrow)' : ''"
									:class="{ selected: isSelected(e.id) }"
								/>
								<g v-if="e.label">
									<rect
										:x="e.labelX - e.labelWidth / 2 - 4"
										:y="e.labelY - 11"
										:width="e.labelWidth + 8"
										height="20"
										fill="var(--panel-bg, #fff)"
										opacity="0.9"
										rx="4"
									/>
									<text class="edge-label" :x="e.labelX" :y="e.labelY + 4" text-anchor="middle" font-size="12">{{ e.label }}</text>
								</g>
							</g>

							<!-- 节点 -->
							<g
								v-for="n in renderNodes"
								:key="n.id"
								class="node"
								:class="{ selected: isSelected(n.id) }"
								@pointerdown.stop="onNodeDown(n.source, $event)"
								@dblclick.stop="startEdit(n.source)"
								@pointerenter="hovered = n.id"
								@pointerleave="hovered = hovered === n.id ? '' : hovered"
							>
								<!-- 形状 -->
								<rect
									v-if="n.kind === 'rect'"
									:x="n.x"
									:y="n.y"
									:width="n.w"
									:height="n.h"
									:rx="n.radius"
									:fill="n.fill"
									:stroke="n.stroke"
									:stroke-width="n.strokeWidth"
									:opacity="n.opacity"
								/>
								<ellipse
									v-else-if="n.kind === 'ellipse'"
									:cx="n.x + n.w / 2"
									:cy="n.y + n.h / 2"
									:rx="n.w / 2"
									:ry="n.h / 2"
									:fill="n.fill"
									:stroke="n.stroke"
									:stroke-width="n.strokeWidth"
									:opacity="n.opacity"
								/>
								<polygon
									v-else-if="n.kind === 'polygon'"
									:points="n.points"
									:fill="n.fill"
									:stroke="n.stroke"
									:stroke-width="n.strokeWidth"
									:opacity="n.opacity"
								/>
								<g v-else-if="n.kind === 'cylinder'">
									<path :d="n.bodyPath" :fill="n.fill" :stroke="n.stroke" :stroke-width="n.strokeWidth" :opacity="n.opacity" />
									<path :d="n.topPath" fill="none" :stroke="n.stroke" :stroke-width="n.strokeWidth" />
								</g>
								<path
									v-else
									:d="n.bodyPath"
									:fill="n.fill"
									:stroke="n.stroke"
									:stroke-width="n.strokeWidth"
									:opacity="n.opacity"
								/>

								<!-- 文字（编辑时用 overlay 的 textarea 显示，避免重影） -->
								<text
									v-if="n.lines.length && editing?.id !== n.id"
									:text-anchor="n.align === 'left' ? 'start' : 'middle'"
									:fill="n.textColor"
									:font-size="n.fontSize"
									class="node-text"
									:style="{ pointerEvents: 'none' }"
								>
									<tspan v-for="(line, i) in n.lines" :key="i" :x="n.textX" :y="n.linesY[i]">{{ line }}</tspan>
								</text>

								<!-- 选中框与缩放手柄（编辑文字时隐藏，避免看起来像多出一个矩形） -->
								<g v-if="isSelected(n.id) && editing?.id !== n.id" class="sel">
									<rect
										:x="n.x - 3"
										:y="n.y - 3"
										:width="n.w + 6"
										:height="n.h + 6"
										fill="none"
										stroke="#1677ff"
										stroke-width="1.2"
										stroke-dasharray="4 3"
									/>
									<rect
										v-for="h in HANDLES"
										:key="h"
										:x="handleRect(n, h).x"
										:y="handleRect(n, h).y"
										width="7"
										height="7"
										fill="#fff"
										stroke="#1677ff"
										stroke-width="1.2"
										:style="{ cursor: HANDLE_CURSOR[h] }"
										@pointerdown.stop="onHandleDown(n.source, h, $event)"
									/>
								</g>

								<!-- 连线端口（悬停或选中时显示） -->
								<g v-if="mode === 'connect' || hovered === n.id || isSelected(n.id)">
									<circle
										v-for="p in PORTS"
										:key="p"
										class="port"
										:cx="portPoint(n, p).x"
										:cy="portPoint(n, p).y"
										r="4.5"
										@pointerdown.stop="onPortDown(n.source, p, $event)"
									/>
								</g>
							</g>

							<!-- 正在拉的连线 -->
							<path v-if="tempEdge" class="edge-line temp" :d="tempEdge" fill="none" stroke="#1677ff" stroke-width="1.6" stroke-dasharray="5 4" />

							<!-- 框选 -->
							<rect
								v-if="marquee"
								:x="marquee.x"
								:y="marquee.y"
								:width="marquee.w"
								:height="marquee.h"
								fill="rgba(22,119,255,0.08)"
								stroke="#1677ff"
								stroke-width="1"
								stroke-dasharray="4 3"
							/>
						</g>
					</svg>

					<textarea
						v-if="editing"
						ref="editRef"
						v-model="editing.text"
						class="text-editor"
						:style="editStyle"
						@blur="commitEdit"
						@keydown.esc.stop.prevent="cancelEdit"
						@keydown.enter.exact.stop.prevent="commitEdit"
					></textarea>

					<div v-if="!nodes.length" class="empty-hint">
						<div class="big">画布还是空的</div>
						<div class="hint">从左侧点一个形状，然后在画布上点击放置；拖动节点边缘的小圆点可以连线</div>
					</div>
				</div>

				<!-- 右侧：样式 -->
				<aside class="inspector">
					<div class="panel-title">{{ inspectorTitle }}</div>

					<template v-if="selNodes.length">
						<div class="row">
							<span class="label">填充</span>
							<input type="color" class="color" :value="styleValue('fill')" @pointerdown="markPending" @input="applyStyle('fill', $event.target.value)" />
							<span class="label">边框</span>
							<input type="color" class="color" :value="styleValue('stroke')" @pointerdown="markPending" @input="applyStyle('stroke', $event.target.value)" />
						</div>
						<div class="row">
							<span class="label">文字颜色</span>
							<input type="color" class="color" :value="styleValue('textColor')" @pointerdown="markPending" @input="applyStyle('textColor', $event.target.value)" />
						</div>
						<div class="row">
							<span class="label">边框粗细</span>
							<a-slider :value="styleValue('strokeWidth')" :min="0" :max="8" :step="0.5" style="flex: 1" @change="v => applyStyle('strokeWidth', v)" />
							<span class="hint">{{ styleValue('strokeWidth') }}</span>
						</div>
						<div class="row">
							<span class="label">字号</span>
							<a-slider :value="styleValue('fontSize')" :min="10" :max="40" :step="1" style="flex: 1" @change="v => applyStyle('fontSize', v)" />
							<span class="hint">{{ styleValue('fontSize') }}</span>
						</div>
						<div class="row">
							<span class="label">圆角</span>
							<a-slider :value="styleValue('radius')" :min="0" :max="40" :step="1" style="flex: 1" @change="v => applyStyle('radius', v)" />
							<span class="hint">{{ styleValue('radius') }}</span>
						</div>
						<div class="row">
							<span class="label">不透明度</span>
							<a-slider :value="styleValue('opacity')" :min="0.2" :max="1" :step="0.05" style="flex: 1" @change="v => applyStyle('opacity', v)" />
							<span class="hint">{{ Math.round(styleValue('opacity') * 100) }}%</span>
						</div>
						<div class="row">
							<span class="label">文字对齐</span>
							<a-radio-group :value="styleValue('align')" size="small" @change="e => applyStyle('align', e.target.value)">
								<a-radio-button value="center">居中</a-radio-button>
								<a-radio-button value="left">左对齐</a-radio-button>
							</a-radio-group>
						</div>
						<div class="row">
							<a-button size="small" @click="bringToFront">置于顶层</a-button>
							<a-button size="small" @click="sendToBack">置于底层</a-button>
						</div>
					</template>

					<template v-else-if="selEdges.length">
						<div class="row">
							<span class="label">线条颜色</span>
							<input type="color" class="color" :value="edgeStyle('stroke')" @pointerdown="markPending" @input="applyEdgeStyle('stroke', $event.target.value)" />
						</div>
						<div class="row">
							<span class="label">线宽</span>
							<a-slider :value="edgeStyle('strokeWidth')" :min="1" :max="6" :step="0.5" style="flex: 1" @change="v => applyEdgeStyle('strokeWidth', v)" />
							<span class="hint">{{ edgeStyle('strokeWidth') }}</span>
						</div>
						<div class="row" style="gap: 14px">
							<a-checkbox :checked="edgeStyle('dashed')" @change="e => applyEdgeStyle('dashed', e.target.checked)">虚线</a-checkbox>
							<a-checkbox :checked="edgeStyle('arrowEnd')" @change="e => applyEdgeStyle('arrowEnd', e.target.checked)">终点箭头</a-checkbox>
							<a-checkbox :checked="edgeStyle('arrowStart')" @change="e => applyEdgeStyle('arrowStart', e.target.checked)">起点箭头</a-checkbox>
						</div>
						<div class="row">
							<span class="label">标签</span>
							<a-input size="small" :value="edgeStyle('label')" placeholder="连线文字" @pointerdown="markPending" @change="e => applyEdgeStyle('label', e.target.value)" />
						</div>
						<div class="row">
							<a-button size="small" @click="reverseEdge">反向</a-button>
						</div>
					</template>

					<div v-else class="hint" style="line-height: 1.9">
						选中节点可改填充 / 边框 / 字号；<br />
						选中连线可改颜色 / 箭头 / 标签。<br />
						双击节点编辑文字，Tab / Enter 可快速建节点。
					</div>

					<div class="panel-title" style="margin-top: 16px">文档</div>
					<div class="doc-info hint">{{ storageLabel }}</div>
					<div class="row" style="margin-top: 8px; gap: 8px; flex-wrap: wrap">
						<a-button size="small" @click="saveAsFile">另存为</a-button>
						<a-button size="small" @click="openFile">打开</a-button>
						<a-button size="small" @click="exportSvg">导出 SVG</a-button>
						<a-button size="small" @click="exportPng">导出 PNG</a-button>
					</div>
				</aside>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">滚轮缩放 · 拖空白处框选 · Shift+点击多选 · Delete 删除 · Ctrl+Z 撤销 · Ctrl+S 保存</span>
			<a-space>
				<span v-if="savedAt" class="hint">已自动保存 {{ savedAt }}</span>
				<a-button danger :disabled="!nodes.length" @click="clearAll">清空画布</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { friendlyError, openFiles, readSourceText, saveBytesAs, saveTextAs } from '@/utils/tauriIO'
import { createDocStore, debounce } from '@/utils/localDoc'

/* ---------------- 常量 ---------------- */
const SHAPES = [
	{ type: 'rect', label: '矩形', icon: 'M4 6h36v18H4z' },
	{ type: 'roundRect', label: '圆角', icon: 'M10 6h24a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z' },
	{ type: 'ellipse', label: '椭圆', icon: 'M22 6c10 0 18 4 18 9s-8 9-18 9-18-4-18-9 8-9 18-9z' },
	{ type: 'diamond', label: '菱形', icon: 'M22 5l18 10-18 10L4 15z' },
	{ type: 'parallelogram', label: '平行四边形', icon: 'M10 6h30l-6 18H4z' },
	{ type: 'hexagon', label: '六边形', icon: 'M12 6h20l8 9-8 9H12l-8-9z' },
	{ type: 'cylinder', label: '数据库', icon: 'M10 7c0-2 5-3 12-3s12 1 12 3v16c0 2-5 3-12 3S10 25 10 23z' },
	{ type: 'document', label: '文档', icon: 'M6 5h32v16c-6 5-10-3-16 2s-10-1-16 1z' },
	{ type: 'text', label: '文本', icon: 'M8 10h28M22 10v16' },
	{ type: 'note', label: '便签', icon: 'M6 5h26l6 6v14H6z' },
	{ type: 'circle', label: '圆', icon: 'M22 5a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' },
	{ type: 'cloud', label: '云', icon: 'M14 22a6 6 0 0 1 1-11 8 8 0 0 1 15 3 5 5 0 0 1-1 8z' },
]

const PORTS = ['n', 'e', 's', 'w']
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_CURSOR = {
	nw: 'nwse-resize',
	n: 'ns-resize',
	ne: 'nesw-resize',
	e: 'ew-resize',
	se: 'nwse-resize',
	s: 'ns-resize',
	sw: 'nesw-resize',
	w: 'ew-resize',
}

const DEFAULT_NODE = {
	fill: '#ffffff',
	stroke: '#334155',
	strokeWidth: 1.5,
	fontSize: 13,
	textColor: '#0f172a',
	radius: 6,
	opacity: 1,
	align: 'center',
}
const DEFAULT_EDGE = { stroke: '#475569', strokeWidth: 1.5, dashed: false, arrowEnd: true, arrowStart: false, label: '' }

/* ---------------- 状态 ---------------- */
let uid = 1
const nodes = ref([])
const edges = ref([])
const selection = ref([])
const mode = ref('select')
const hovered = ref('')
const gridOn = ref(true)
const view = reactive({ scale: 1, tx: 40, ty: 40 })
const marquee = ref(null)
const tempEdge = ref('')
const editing = ref(null)
const savedAt = ref('')
const storageLabel = ref('')

const wrapRef = ref(null)
const svgRef = ref(null)
const editRef = ref(null)

const undoStack = reactive([])
const redoStack = reactive([])
let pendingSnapshot = ''

const store = createDocStore({ fileName: 'diagram-autosave.json', localKey: 'xtools-diagram-autosave' })

/* ---------------- 计算 ---------------- */
const selNodes = computed(() => nodes.value.filter(n => selection.value.includes(n.id)))
const selEdges = computed(() => edges.value.filter(e => selection.value.includes(e.id)))
const inspectorTitle = computed(() => {
	if (selNodes.value.length) return `节点样式（已选 ${selNodes.value.length}）`
	if (selEdges.value.length) return `连线样式（已选 ${selEdges.value.length}）`
	return '样式'
})

const isSelected = id => selection.value.includes(id)

/** Canvas 文本测量（用于换行） */
let measureCtx = null
const measureText = (text, fontSize) => {
	if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
	measureCtx.font = `${fontSize}px system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif`
	return measureCtx.measureText(text).width
}

const wrapText = (text, maxWidth, fontSize) => {
	const out = []
	for (const para of String(text ?? '').split('\n')) {
		if (!para) {
			out.push('')
			continue
		}
		let line = ''
		for (const ch of para) {
			const test = line + ch
			if (line && measureText(test, fontSize) > maxWidth) {
				out.push(line)
				line = ch
			} else {
				line = test
			}
		}
		out.push(line)
	}
	return out
}

const nodeKind = type => {
	if (type === 'ellipse' || type === 'circle') return 'ellipse'
	if (type === 'diamond' || type === 'parallelogram' || type === 'hexagon') return 'polygon'
	if (type === 'cylinder') return 'cylinder'
	if (type === 'document' || type === 'note' || type === 'cloud') return 'path'
	if (type === 'text') return 'none'
	return 'rect'
}

const polygonPoints = n => {
	const { x, y, w, h } = n
	const cx = x + w / 2
	const cy = y + h / 2
	const t = n.type
	if (t === 'diamond') return `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`
	if (t === 'hexagon') {
		const inset = Math.min(22, w * 0.22)
		return `${x + inset},${y} ${x + w - inset},${y} ${x + w},${cy} ${x + w - inset},${y + h} ${x + inset},${y + h} ${x},${cy}`
	}
	const skew = Math.min(22, w * 0.22)
	return `${x + skew},${y} ${x + w},${y} ${x + w - skew},${y + h} ${x},${y + h}`
}

const bodyPath = n => {
	const { x, y, w, h } = n
	if (n.type === 'cylinder') {
		const r = Math.min(h * 0.22, 14)
		return `M ${x} ${y + r} A ${w / 2} ${r} 0 0 1 ${x + w} ${y + r} L ${x + w} ${y + h - r} A ${w / 2} ${r} 0 0 1 ${x} ${y + h - r} Z`
	}
	if (n.type === 'document') {
		const waveY = y + h - 12
		return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${waveY} Q ${x + w * 0.75} ${waveY + 16} ${x + w * 0.5} ${waveY} Q ${x + w * 0.25} ${waveY - 14} ${x} ${waveY + 4} Z`
	}
	if (n.type === 'note') {
		const c = Math.min(18, w * 0.2, h * 0.3)
		return `M ${x} ${y} L ${x + w - c} ${y} L ${x + w} ${y + c} L ${x + w} ${y + h} L ${x} ${y + h} Z`
	}
	if (n.type === 'cloud') {
		const { w: W, h: H } = n
		return `M ${x + W * 0.22} ${y + H * 0.75}
			A ${W * 0.16} ${H * 0.2} 0 0 1 ${x + W * 0.26} ${y + H * 0.36}
			A ${W * 0.2} ${H * 0.26} 0 0 1 ${x + W * 0.62} ${y + H * 0.22}
			A ${W * 0.18} ${H * 0.22} 0 0 1 ${x + W * 0.86} ${y + H * 0.46}
			A ${W * 0.14} ${H * 0.16} 0 0 1 ${x + W * 0.8} ${y + H * 0.78} Z`
	}
	return ''
}

const renderNodes = computed(() =>
	nodes.value.map(n => {
		const kind = nodeKind(n.type)
		const innerW = Math.max(20, n.w - 20)
		const lines = n.type === 'text' ? String(n.text ?? '').split('\n') : wrapText(n.text, innerW, n.fontSize)
		const lh = n.fontSize * 1.35
		const totalH = Math.max(lh, lines.length * lh)
		const startY = n.y + n.h / 2 - totalH / 2 + lh * 0.78
		const linesY = lines.map((_, i) => startY + i * lh)
		const textX = n.align === 'left' ? n.x + 10 : n.x + n.w / 2
		const obj = {
			...n,
			source: n,
			kind,
			lines,
			linesY,
			textX,
		}
		if (kind === 'polygon') obj.points = polygonPoints(n)
		if (kind === 'cylinder') {
			obj.bodyPath = bodyPath(n)
			const r = Math.min(n.h * 0.22, 14)
			obj.topPath = `M ${n.x} ${n.y + r} A ${n.w / 2} ${r} 0 0 1 ${n.x + n.w} ${n.y + r}`
		}
		if (kind === 'path') obj.bodyPath = bodyPath(n)
		return obj
	})
)

/* ---------------- 连线几何 ---------------- */
const portPoint = (n, p) => {
	if (p === 'n') return { x: n.x + n.w / 2, y: n.y, dir: 'n' }
	if (p === 's') return { x: n.x + n.w / 2, y: n.y + n.h, dir: 's' }
	if (p === 'w') return { x: n.x, y: n.y + n.h / 2, dir: 'w' }
	return { x: n.x + n.w, y: n.y + n.h / 2, dir: 'e' }
}
const dirVec = d => ({ n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[d])
const isHoriz = d => d === 'e' || d === 'w'

const orthPoints = (a, b, stub = 20) => {
	const [ax, ay] = dirVec(a.dir)
	const [bx, by] = dirVec(b.dir)
	const s = { x: a.x + ax * stub, y: a.y + ay * stub }
	const e = { x: b.x + bx * stub, y: b.y + by * stub }
	const pts = [{ x: a.x, y: a.y }, s]
	if (isHoriz(a.dir) && isHoriz(b.dir)) {
		const mx = (s.x + e.x) / 2
		pts.push({ x: mx, y: s.y }, { x: mx, y: e.y })
	} else if (!isHoriz(a.dir) && !isHoriz(b.dir)) {
		const my = (s.y + e.y) / 2
		pts.push({ x: s.x, y: my }, { x: e.x, y: my })
	} else if (isHoriz(a.dir)) {
		pts.push({ x: e.x, y: s.y })
	} else {
		pts.push({ x: s.x, y: e.y })
	}
	pts.push(e, { x: b.x, y: b.y })
	// 去掉重复点
	return pts.filter((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) > 0.4 || Math.abs(p.y - pts[i - 1].y) > 0.4)
}

const roundedPath = (pts, r = 10) => {
	if (pts.length < 2) return ''
	let d = `M ${pts[0].x} ${pts[0].y}`
	for (let i = 1; i < pts.length - 1; i += 1) {
		const p = pts[i]
		const prev = pts[i - 1]
		const next = pts[i + 1]
		const d1 = Math.hypot(p.x - prev.x, p.y - prev.y)
		const d2 = Math.hypot(next.x - p.x, next.y - p.y)
		if (d1 < 1 || d2 < 1) {
			d += ` L ${p.x} ${p.y}`
			continue
		}
		const rr = Math.min(r, d1 / 2, d2 / 2)
		const p1 = { x: p.x + ((prev.x - p.x) / d1) * rr, y: p.y + ((prev.y - p.y) / d1) * rr }
		const p2 = { x: p.x + ((next.x - p.x) / d2) * rr, y: p.y + ((next.y - p.y) / d2) * rr }
		d += ` L ${p1.x} ${p1.y} Q ${p.x} ${p.y} ${p2.x} ${p2.y}`
	}
	const last = pts[pts.length - 1]
	d += ` L ${last.x} ${last.y}`
	return d
}

const edgeGeometry = e => {
	const from = nodes.value.find(n => n.id === e.from)
	const to = nodes.value.find(n => n.id === e.to)
	if (!from || !to) return null
	const a = portPoint(from, e.fromPort || 'e')
	const b = portPoint(to, e.toPort || 'w')
	const pts = orthPoints(a, b)
	const d = roundedPath(pts)
	const mid = pts[Math.floor(pts.length / 2)]
	return { d, labelX: mid.x, labelY: mid.y, labelWidth: e.label ? measureText(e.label, 12) : 0 }
}

const renderEdges = computed(() =>
	edges.value
		.map(e => {
			const g = edgeGeometry(e)
			return g ? { ...e, source: e, ...g } : null
		})
		.filter(Boolean)
)

/* ---------------- 坐标 ---------------- */
const toWorld = evt => {
	const rect = wrapRef.value.getBoundingClientRect()
	return {
		x: (evt.clientX - rect.left - view.tx) / view.scale,
		y: (evt.clientY - rect.top - view.ty) / view.scale,
	}
}

/* ---------------- 历史 ---------------- */
const snapshot = () => JSON.stringify({ nodes: nodes.value, edges: edges.value })
const pushHistory = () => {
	undoStack.push(snapshot())
	if (undoStack.length > 80) undoStack.shift()
	redoStack.length = 0
}
const restore = s => {
	const data = JSON.parse(s)
	nodes.value = data.nodes || []
	edges.value = data.edges || []
	selection.value = []
}
const undo = () => {
	if (!undoStack.length) return
	redoStack.push(snapshot())
	restore(undoStack.pop())
}
const redo = () => {
	if (!redoStack.length) return
	undoStack.push(snapshot())
	restore(redoStack.pop())
}
const markPending = () => {
	pendingSnapshot = snapshot()
}
const commitPending = () => {
	if (pendingSnapshot && pendingSnapshot !== snapshot()) {
		undoStack.push(pendingSnapshot)
		if (undoStack.length > 80) undoStack.shift()
		redoStack.length = 0
	}
	pendingSnapshot = ''
}

/* ---------------- 节点操作 ---------------- */
const makeNode = (type, x, y) => {
	const isText = type === 'text'
	const n = {
		id: `n${uid++}`,
		type,
		x: Math.round(x - (isText ? 60 : 70)),
		y: Math.round(y - (isText ? 14 : 32)),
		w: isText ? 120 : 140,
		h: isText ? 28 : 64,
		text: isText ? '文本' : '',
		...DEFAULT_NODE,
	}
	if (type === 'circle' || type === 'ellipse') {
		n.w = 130
		n.h = 80
	}
	if (type === 'diamond') {
		n.w = 150
		n.h = 90
	}
	return n
}

const pickShape = type => {
	mode.value = `draw:${type}`
}
const setMode = m => {
	mode.value = m
	if (m !== 'connect') tempEdge.value = ''
}

const addNodeAtCenter = type => {
	pushHistory()
	const rect = wrapRef.value.getBoundingClientRect()
	const c = {
		x: (rect.width / 2 - view.tx) / view.scale,
		y: (rect.height / 2 - view.ty) / view.scale,
	}
	const n = makeNode(type, c.x + (Math.random() * 40 - 20), c.y + (Math.random() * 40 - 20))
	nodes.value.push(n)
	selection.value = [n.id]
	mode.value = 'select'
}

const removeSelection = () => {
	if (!selection.value.length) return
	pushHistory()
	const ids = new Set(selection.value)
	nodes.value = nodes.value.filter(n => !ids.has(n.id))
	edges.value = edges.value.filter(e => !ids.has(e.id) && !ids.has(e.from) && !ids.has(e.to))
	selection.value = []
}

const duplicateSelection = () => {
	const picked = selNodes.value
	if (!picked.length) return
	pushHistory()
	const map = new Map()
	const created = []
	for (const n of picked) {
		const copy = { ...n, id: `n${uid++}`, x: n.x + 24, y: n.y + 24 }
		map.set(n.id, copy.id)
		nodes.value.push(copy)
		created.push(copy.id)
	}
	// 连线的两端都在选中集合里时一并复制
	for (const e of edges.value) {
		if (map.has(e.from) && map.has(e.to)) {
			edges.value.push({ ...e, id: `e${uid++}`, from: map.get(e.from), to: map.get(e.to) })
		}
	}
	selection.value = created
}

const bringToFront = () => {
	const picked = selNodes.value
	if (!picked.length) return
	pushHistory()
	const rest = nodes.value.filter(n => !isSelected(n.id))
	nodes.value = [...rest, ...picked]
}
const sendToBack = () => {
	const picked = selNodes.value
	if (!picked.length) return
	pushHistory()
	const rest = nodes.value.filter(n => !isSelected(n.id))
	nodes.value = [...picked, ...rest]
}

const clearAll = () => {
	pushHistory()
	nodes.value = []
	edges.value = []
	selection.value = []
}

/* ---------------- 指针交互 ---------------- */
let drag = null

const onCanvasDown = evt => {
	if (evt.button === 1) {
		startPan(evt)
		return
	}
	if (evt.button !== 0) return

	if (mode.value.startsWith('draw:')) {
		const type = mode.value.slice(5)
		const p = toWorld(evt)
		pushHistory()
		const n = makeNode(type, p.x, p.y)
		nodes.value.push(n)
		selection.value = [n.id]
		mode.value = 'select'
		return
	}

	if (mode.value === 'connect') {
		return
	}

	// 空白点击：取消选择 + 框选
	if (!evt.shiftKey) selection.value = []
	const p = toWorld(evt)
	drag = { type: 'marquee', start: p, moved: false }
	marquee.value = { x: p.x, y: p.y, w: 0, h: 0 }
	window.addEventListener('pointermove', onWindowMove)
	window.addEventListener('pointerup', onWindowUp)
}

const startPan = evt => {
	drag = { type: 'pan', startX: evt.clientX, startY: evt.clientY, tx: view.tx, ty: view.ty }
	window.addEventListener('pointermove', onWindowMove)
	window.addEventListener('pointerup', onWindowUp)
}

const onNodeDown = (node, evt) => {
	if (evt.button !== 0) return
	if (mode.value === 'connect') {
		startConnect(node, nearestPort(node, toWorld(evt)), evt)
		return
	}
	if (mode.value.startsWith('draw:')) return
	const already = isSelected(node.id)
	if (evt.shiftKey) {
		selection.value = already ? selection.value.filter(i => i !== node.id) : [...selection.value, node.id]
	} else if (!already) {
		selection.value = [node.id]
	}
	if (drag && drag.type === 'node') return
	markPending()
	const start = toWorld(evt)
	drag = {
		type: 'node',
		start,
		moved: false,
		originals: selNodes.value.map(n => ({ id: n.id, x: n.x, y: n.y })),
	}
	window.addEventListener('pointermove', onWindowMove)
	window.addEventListener('pointerup', onWindowUp)
}

const nearestPort = (node, p) => {
	let best = 'e'
	let bestD = Infinity
	for (const port of PORTS) {
		const q = portPoint(node, port)
		const d = Math.hypot(q.x - p.x, q.y - p.y)
		if (d < bestD) {
			bestD = d
			best = port
		}
	}
	return best
}

const startConnect = (node, port, evt) => {
	drag = { type: 'connect', from: node.id, fromPort: port }
	const a = portPoint(node, port)
	const p = toWorld(evt)
	tempEdge.value = roundedPath(orthPoints(a, { ...p, dir: 'w' }))
	window.addEventListener('pointermove', onWindowMove)
	window.addEventListener('pointerup', onWindowUp)
}

const onPortDown = (node, port, evt) => {
	if (evt.button !== 0) return
	startConnect(node, port, evt)
}

const onHandleDown = (node, handle, evt) => {
	if (evt.button !== 0) return
	markPending()
	drag = {
		type: 'resize',
		handle,
		start: toWorld(evt),
		original: { x: node.x, y: node.y, w: node.w, h: node.h },
		node,
	}
	window.addEventListener('pointermove', onWindowMove)
	window.addEventListener('pointerup', onWindowUp)
}

const onEdgeDown = (edge, evt) => {
	if (evt.button !== 0) return
	if (evt.shiftKey) {
		selection.value = isSelected(edge.id) ? selection.value.filter(i => i !== edge.id) : [...selection.value, edge.id]
	} else {
		selection.value = [edge.id]
	}
}

const onWindowMove = evt => {
	if (!drag) return
	const p = toWorld(evt)

	if (drag.type === 'pan') {
		view.tx = drag.tx + (evt.clientX - drag.startX)
		view.ty = drag.ty + (evt.clientY - drag.startY)
		return
	}

	if (drag.type === 'marquee') {
		const x = Math.min(drag.start.x, p.x)
		const y = Math.min(drag.start.y, p.y)
		marquee.value = { x, y, w: Math.abs(p.x - drag.start.x), h: Math.abs(p.y - drag.start.y) }
		drag.moved = true
		return
	}

	if (drag.type === 'node') {
		const dx = p.x - drag.start.x
		const dy = p.y - drag.start.y
		if (!drag.moved && Math.hypot(dx, dy) * view.scale < 3) return
		drag.moved = true
		for (const o of drag.originals) {
			const n = nodes.value.find(i => i.id === o.id)
			if (n) {
				n.x = Math.round(o.x + dx)
				n.y = Math.round(o.y + dy)
			}
		}
		return
	}

	if (drag.type === 'resize') {
		const { handle, original, node } = drag
		const dx = p.x - drag.start.x
		const dy = p.y - drag.start.y
		let { x, y, w, h } = original
		if (handle.includes('e')) w = original.w + dx
		if (handle.includes('s')) h = original.h + dy
		if (handle.includes('w')) {
			w = original.w - dx
			x = original.x + dx
		}
		if (handle.includes('n')) {
			h = original.h - dy
			y = original.y + dy
		}
		w = Math.max(24, Math.round(w))
		h = Math.max(24, Math.round(h))
		node.x = Math.round(x)
		node.y = Math.round(y)
		node.w = w
		node.h = h
		return
	}

	if (drag.type === 'connect') {
		const from = nodes.value.find(n => n.id === drag.from)
		if (!from) return
		const a = portPoint(from, drag.fromPort)
		const target = nodeAt(p, drag.from)
		if (target) {
			const tp = nearestPort(target, p)
			const tg = portPoint(target, tp)
			// 目标端口的朝向需要反转（连线进入的方向）
			const flipped = { n: 's', s: 'n', w: 'e', e: 'w' }[tp]
			tempEdge.value = roundedPath(orthPoints(a, { ...tg, dir: flipped }))
		} else {
			tempEdge.value = roundedPath(orthPoints(a, { ...p, dir: 'w' }))
		}
	}
}

const onWindowUp = evt => {
	const p = toWorld(evt)
	if (drag?.type === 'marquee') {
		const box = marquee.value
		if (box && box.w > 4 && box.h > 4) {
			const picked = nodes.value.filter(n => n.x < box.x + box.w && n.x + n.w > box.x && n.y < box.y + box.h && n.y + n.h > box.y)
			selection.value = picked.map(n => n.id)
		}
	}
	if (drag?.type === 'node' && drag.moved) commitPending()
	if (drag?.type === 'resize') commitPending()
	if (drag?.type === 'connect') {
		const target = nodeAt(p, drag.from)
		if (target) {
			pushHistory()
			const tp = nearestPort(target, p)
			edges.value.push({
				id: `e${uid++}`,
				from: drag.from,
				fromPort: drag.fromPort,
				to: target.id,
				toPort: tp,
				...DEFAULT_EDGE,
			})
		}
		tempEdge.value = ''
	}
	drag = null
	marquee.value = null
	window.removeEventListener('pointermove', onWindowMove)
	window.removeEventListener('pointerup', onWindowUp)
}

const nodeAt = (p, excludeId) => {
	for (let i = nodes.value.length - 1; i >= 0; i -= 1) {
		const n = nodes.value[i]
		if (n.id === excludeId) continue
		if (p.x >= n.x - 4 && p.x <= n.x + n.w + 4 && p.y >= n.y - 4 && p.y <= n.y + n.h + 4) return n
	}
	return null
}

/* ---------------- 缩放 ---------------- */
const onWheel = evt => {
	const rect = wrapRef.value.getBoundingClientRect()
	const mx = evt.clientX - rect.left
	const my = evt.clientY - rect.top
	const factor = evt.deltaY < 0 ? 1.1 : 1 / 1.1
	const next = Math.min(3, Math.max(0.2, view.scale * factor))
	const k = next / view.scale
	view.tx = mx - (mx - view.tx) * k
	view.ty = my - (my - view.ty) * k
	view.scale = next
}

const zoomBy = f => {
	const rect = wrapRef.value.getBoundingClientRect()
	const mx = rect.width / 2
	const my = rect.height / 2
	const next = Math.min(3, Math.max(0.2, view.scale * f))
	const k = next / view.scale
	view.tx = mx - (mx - view.tx) * k
	view.ty = my - (my - view.ty) * k
	view.scale = next
}

const fitView = () => {
	if (!nodes.value.length) {
		view.scale = 1
		view.tx = 40
		view.ty = 40
		return
	}
	const minX = Math.min(...nodes.value.map(n => n.x))
	const minY = Math.min(...nodes.value.map(n => n.y))
	const maxX = Math.max(...nodes.value.map(n => n.x + n.w))
	const maxY = Math.max(...nodes.value.map(n => n.y + n.h))
	const rect = wrapRef.value.getBoundingClientRect()
	const pad = 48
	const scale = Math.min((rect.width - pad * 2) / (maxX - minX || 1), (rect.height - pad * 2) / (maxY - minY || 1), 1.6)
	view.scale = Math.max(0.2, scale)
	view.tx = pad - minX * view.scale + (rect.width - pad * 2 - (maxX - minX) * view.scale) / 2
	view.ty = pad - minY * view.scale + (rect.height - pad * 2 - (maxY - minY) * view.scale) / 2
}

/* ---------------- 文字编辑 ---------------- */
const editStyle = computed(() => {
	if (!editing.value) return {}
	const n = nodes.value.find(i => i.id === editing.value.id)
	if (!n) return {}
	const scale = view.scale
	const lineHeight = 1.35
	const lines = Math.max(1, String(editing.value.text || '').split('\n').length)
	const contentHeight = lines * n.fontSize * lineHeight
	// 把输入框里的文字垂直居中到节点矩形内，视觉上和原文字完全重合
	const padTop = Math.max(2, (n.h - contentHeight) / 2)
	// 输入框是相对 .canvas-wrap 定位的，而坐标算的是 svg 内部坐标，
	// 必须补上 svg 在容器里的偏移（工具栏高度），否则编辑框会跑到图形上方
	const dx = svgRef.value && wrapRef.value ? svgRef.value.getBoundingClientRect().left - wrapRef.value.getBoundingClientRect().left : 0
	const dy = svgRef.value && wrapRef.value ? svgRef.value.getBoundingClientRect().top - wrapRef.value.getBoundingClientRect().top : 0
	return {
		left: `${dx + n.x * scale + view.tx}px`,
		top: `${dy + n.y * scale + view.ty}px`,
		width: `${Math.max(24, n.w * scale)}px`,
		height: `${Math.max(24, n.h * scale)}px`,
		fontSize: `${n.fontSize * scale}px`,
		lineHeight: String(lineHeight),
		textAlign: n.align,
		paddingTop: `${padTop * scale}px`,
		color: n.textColor,
	}
})

const startEdit = async node => {
	markPending()
	editing.value = { id: node.id, text: node.text || '' }
	await nextTick()
	editRef.value?.focus()
	editRef.value?.select()
}

const commitEdit = () => {
	if (!editing.value) return
	const n = nodes.value.find(i => i.id === editing.value.id)
	if (n) n.text = editing.value.text
	editing.value = null
	commitPending()
}

const cancelEdit = () => {
	editing.value = null
	pendingSnapshot = ''
}

const onCanvasDblClick = evt => {
	// 双击空白处新建一个矩形
	if (evt.target.tagName !== 'svg' && evt.target.tagName !== 'rect') return
	const p = toWorld(evt)
	if (nodeAt(p)) return
	pushHistory()
	const n = makeNode('rect', p.x, p.y)
	n.text = ''
	nodes.value.push(n)
	selection.value = [n.id]
	startEdit(n)
}

/* ---------------- 样式应用 ---------------- */
const styleValue = key => {
	const first = selNodes.value[0]
	return first ? first[key] : DEFAULT_NODE[key]
}
const applyStyle = (key, value) => {
	for (const n of selNodes.value) n[key] = value
}
const edgeStyle = key => (selEdges.value[0] ? selEdges.value[0][key] : DEFAULT_EDGE[key])
const applyEdgeStyle = (key, value) => {
	for (const e of selEdges.value) e[key] = value
}
const reverseEdge = () => {
	if (!selEdges.value.length) return
	pushHistory()
	for (const e of selEdges.value) {
		const from = e.from
		const fromPort = e.fromPort
		e.from = e.to
		e.fromPort = e.toPort
		e.to = from
		e.toPort = fromPort
	}
}

const handleRect = (n, h) => {
	const s = 7
	const pos = {
		nw: [n.x - s / 2 - 3, n.y - s / 2 - 3],
		n: [n.x + n.w / 2 - s / 2, n.y - s / 2 - 3],
		ne: [n.x + n.w - s / 2 + 3, n.y - s / 2 - 3],
		e: [n.x + n.w - s / 2 + 3, n.y + n.h / 2 - s / 2],
		se: [n.x + n.w - s / 2 + 3, n.y + n.h - s / 2 + 3],
		s: [n.x + n.w / 2 - s / 2, n.y + n.h - s / 2 + 3],
		sw: [n.x - s / 2 - 3, n.y + n.h - s / 2 + 3],
		w: [n.x - s / 2 - 3, n.y + n.h / 2 - s / 2],
	}
	return { x: pos[h][0], y: pos[h][1] }
}

/* ---------------- 键盘 ---------------- */
const isTyping = target => {
	const tag = (target?.tagName || '').toLowerCase()
	return tag === 'input' || tag === 'textarea' || target?.isContentEditable
}

const onKeyDown = evt => {
	if (isTyping(evt.target)) return
	const meta = evt.ctrlKey || evt.metaKey
	if (meta && evt.key.toLowerCase() === 'z') {
		evt.preventDefault()
		if (evt.shiftKey) redo()
		else undo()
		return
	}
	if (meta && evt.key.toLowerCase() === 'y') {
		evt.preventDefault()
		redo()
		return
	}
	if (meta && evt.key.toLowerCase() === 's') {
		evt.preventDefault()
		saveAsFile()
		return
	}
	if (meta && evt.key.toLowerCase() === 'a') {
		evt.preventDefault()
		selection.value = nodes.value.map(n => n.id)
		return
	}
	if (meta && evt.key.toLowerCase() === 'd') {
		evt.preventDefault()
		duplicateSelection()
		return
	}
	if (evt.key === 'Delete' || evt.key === 'Backspace') {
		if (!selection.value.length) return
		evt.preventDefault()
		removeSelection()
		return
	}
	if (evt.key === 'Escape') {
		selection.value = []
		mode.value = 'select'
		return
	}
	if (evt.key === 'F2' && selNodes.value.length === 1) {
		evt.preventDefault()
		startEdit(selNodes.value[0])
		return
	}
	if (evt.key === 'Tab' && selNodes.value.length === 1) {
		evt.preventDefault()
		addChildNode(selNodes.value[0])
		return
	}
	if (evt.key === 'Enter' && selNodes.value.length === 1) {
		evt.preventDefault()
		addSiblingNode(selNodes.value[0])
		return
	}
	if (evt.key.startsWith('Arrow') && selNodes.value.length) {
		evt.preventDefault()
		const step = evt.shiftKey ? 10 : 1
		const dx = evt.key === 'ArrowLeft' ? -step : evt.key === 'ArrowRight' ? step : 0
		const dy = evt.key === 'ArrowUp' ? -step : evt.key === 'ArrowDown' ? step : 0
		markPending()
		for (const n of selNodes.value) {
			n.x += dx
			n.y += dy
		}
		commitPending()
	}
}

/** Tab：在右侧创建一个子节点并连线 */
const addChildNode = parent => {
	pushHistory()
	const child = makeNode('roundRect', parent.x + parent.w + 90, parent.y + parent.h / 2)
	nodes.value.push(child)
	edges.value.push({
		id: `e${uid++}`,
		from: parent.id,
		fromPort: 'e',
		to: child.id,
		toPort: 'w',
		...DEFAULT_EDGE,
	})
	selection.value = [child.id]
	startEdit(child)
}

/** Enter：在下方创建一个同级节点并连线 */
const addSiblingNode = node => {
	pushHistory()
	const sib = makeNode('roundRect', node.x + node.w / 2, node.y + node.h + 50)
	sib.x = node.x
	nodes.value.push(sib)
	edges.value.push({
		id: `e${uid++}`,
		from: node.id,
		fromPort: 's',
		to: sib.id,
		toPort: 'n',
		...DEFAULT_EDGE,
	})
	selection.value = [sib.id]
	startEdit(sib)
}

/* ---------------- 持久化 ---------------- */
const serialize = () => JSON.stringify({ version: 1, nodes: nodes.value, edges: edges.value, view: { ...view } }, null, 0)

const applyDoc = text => {
	const data = JSON.parse(text)
	nodes.value = Array.isArray(data.nodes) ? data.nodes : []
	edges.value = Array.isArray(data.edges) ? data.edges : []
	// 保证 id 计数不冲突
	const maxId = [...nodes.value.map(n => n.id), ...edges.value.map(e => e.id)]
		.map(i => Number(String(i).replace(/\D/g, '')) || 0)
		.reduce((a, b) => Math.max(a, b), 0)
	uid = maxId + 1
	if (data.view) Object.assign(view, data.view)
	selection.value = []
	undoStack.length = 0
	redoStack.length = 0
}

const writeAutosave = async () => {
	try {
		await store.write(serialize())
		savedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
	} catch (err) {
		console.warn('自动保存失败', err)
	}
}
const autosave = debounce(writeAutosave, 700)

watch([nodes, edges], () => autosave(), { deep: true })

const saveAsFile = async () => {
	try {
		const path = await saveTextAs(serialize(), {
			defaultPath: '流程图.json',
			filters: [{ name: '流程图', extensions: ['json'] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const openFile = async () => {
	try {
		const files = await openFiles({ multiple: false, filters: [{ name: '流程图', extensions: ['json'] }] })
		if (!files?.length) return
		const text = await readSourceText(files[0])
		applyDoc(text)
		message.success('已打开')
	} catch (err) {
		message.error(friendlyError(err))
	}
}

/* ---------------- 导出 ---------------- */
const escapeXml = s =>
	String(s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')

const buildSvg = () => {
	if (!nodes.value.length) throw new Error('画布是空的，没有可导出的内容')
	const minX = Math.min(...nodes.value.map(n => n.x)) - 24
	const minY = Math.min(...nodes.value.map(n => n.y)) - 24
	const maxX = Math.max(...nodes.value.map(n => n.x + n.w)) + 24
	const maxY = Math.max(...nodes.value.map(n => n.y + n.h)) + 24
	const w = maxX - minX
	const h = maxY - minY

	const parts = []
	parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">`)
	parts.push(
		`<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#475569"/></marker></defs>`
	)
	parts.push(`<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#ffffff"/>`)

	for (const r of renderEdges.value) {
		const dash = r.dashed ? ' stroke-dasharray="6 4"' : ''
		const me = r.arrowEnd ? ' marker-end="url(#a)"' : ''
		const ms = r.arrowStart ? ' marker-start="url(#a)"' : ''
		parts.push(
			`<path d="${r.d}" fill="none" stroke="${r.stroke}" stroke-width="${r.strokeWidth}"${dash}${me}${ms}/>`
		)
		if (r.label) {
			parts.push(
				`<text x="${r.labelX}" y="${r.labelY + 4}" text-anchor="middle" font-size="12" fill="#475569" font-family="system-ui, sans-serif">${escapeXml(r.label)}</text>`
			)
		}
	}

	for (const n of renderNodes.value) {
		const common = `fill="${n.fill}" stroke="${n.stroke}" stroke-width="${n.strokeWidth}" opacity="${n.opacity}"`
		if (n.kind === 'rect') parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.radius}" ${common}/>`)
		else if (n.kind === 'ellipse')
			parts.push(`<ellipse cx="${n.x + n.w / 2}" cy="${n.y + n.h / 2}" rx="${n.w / 2}" ry="${n.h / 2}" ${common}/>`)
		else if (n.kind === 'polygon') parts.push(`<polygon points="${n.points}" ${common}/>`)
		else if (n.kind === 'cylinder') {
			parts.push(`<path d="${n.bodyPath}" ${common}/>`)
			parts.push(`<path d="${n.topPath}" fill="none" stroke="${n.stroke}" stroke-width="${n.strokeWidth}"/>`)
		} else if (n.kind === 'path') parts.push(`<path d="${n.bodyPath}" ${common}/>`)

		if (n.lines.length) {
			const anchor = n.align === 'left' ? 'start' : 'middle'
			const spans = n.lines
				.map((line, i) => `<tspan x="${n.textX}" y="${n.linesY[i]}">${escapeXml(line)}</tspan>`)
				.join('')
			parts.push(
				`<text text-anchor="${anchor}" fill="${n.textColor}" font-size="${n.fontSize}" font-family="system-ui, -apple-system, 'Microsoft YaHei', sans-serif">${spans}</text>`
			)
		}
	}
	parts.push('</svg>')
	return parts.join('\n')
}

const exportSvg = async () => {
	try {
		const svg = buildSvg()
		const path = await saveTextAs(svg, {
			defaultPath: '流程图.svg',
			filters: [{ name: 'SVG', extensions: ['svg'] }],
		})
		if (path) message.success(`已导出：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const exportPng = async () => {
	try {
		const svg = buildSvg()
		const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
		const url = URL.createObjectURL(blob)
		const img = new Image()
		await new Promise((resolve, reject) => {
			img.onload = resolve
			img.onerror = () => reject(new Error('渲染失败'))
			img.src = url
		})
		const scale = 2
		const canvas = document.createElement('canvas')
		canvas.width = img.width * scale
		canvas.height = img.height * scale
		const ctx = canvas.getContext('2d')
		ctx.scale(scale, scale)
		ctx.drawImage(img, 0, 0)
		URL.revokeObjectURL(url)
		const outBlob = await new Promise(res => canvas.toBlob(res, 'image/png'))
		const bytes = new Uint8Array(await outBlob.arrayBuffer())
		const path = await saveBytesAs(bytes, {
			defaultPath: '流程图.png',
			filters: [{ name: 'PNG', extensions: ['png'] }],
		})
		if (path) message.success(`已导出：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

/* ---------------- 生命周期 ---------------- */
onMounted(async () => {
	await store.resolve()
	storageLabel.value = store.state.label
	const text = await store.read()
	if (text) {
		try {
			applyDoc(text)
		} catch {
			/* 存档损坏则忽略 */
		}
	}
	if (!nodes.value.length) {
		// 首次进入给一个示例，方便直接上手
		nodes.value = [
			{ id: `n${uid++}`, type: 'roundRect', x: 120, y: 120, w: 160, h: 60, text: '开始', ...DEFAULT_NODE, fill: '#e0f2fe', stroke: '#0284c7' },
			{ id: `n${uid++}`, type: 'diamond', x: 360, y: 100, w: 160, h: 96, text: '条件判断？', ...DEFAULT_NODE, fill: '#fef9c3', stroke: '#ca8a04' },
			{ id: `n${uid++}`, type: 'rect', x: 600, y: 118, w: 150, h: 60, text: '处理', ...DEFAULT_NODE },
			{ id: `n${uid++}`, type: 'ellipse', x: 360, y: 280, w: 150, h: 70, text: '结束', ...DEFAULT_NODE, fill: '#fee2e2', stroke: '#dc2626' },
		]
		edges.value = [
			{ id: `e${uid++}`, from: nodes.value[0].id, fromPort: 'e', to: nodes.value[1].id, toPort: 'w', ...DEFAULT_EDGE },
			{ id: `e${uid++}`, from: nodes.value[1].id, fromPort: 'e', to: nodes.value[2].id, toPort: 'w', ...DEFAULT_EDGE, label: '是' },
			{ id: `e${uid++}`, from: nodes.value[1].id, fromPort: 's', to: nodes.value[3].id, toPort: 'n', ...DEFAULT_EDGE, label: '否' },
		]
		fitView()
	} else {
		nextTick(fitView)
	}
	window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
	window.removeEventListener('keydown', onKeyDown)
	window.removeEventListener('pointermove', onWindowMove)
	window.removeEventListener('pointerup', onWindowUp)
	autosave.cancel()
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.diagramEditor {
	.editor {
		display: flex;
		gap: 12px;
		align-items: stretch;
		height: 100%;
		min-height: 0;
	}
	.palette,
	.inspector {
		flex: none;
		width: 208px;
		background: var(--panel-bg);
		border-radius: 12px;
		padding: 10px 12px;
		box-sizing: border-box;
		overflow-y: auto;
	}
	.inspector {
		width: 236px;
	}
	.panel-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-color-3);
		margin: 6px 0 8px;
		letter-spacing: 0.02em;
	}
	.shape-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.shape-btn {
		display: flex;
		flex-flow: column;
		align-items: center;
		gap: 2px;
		padding: 6px 2px 4px;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		background: transparent;
		cursor: pointer;
		font-size: 11px;
		color: var(--text-color-2);
		transition: all 0.15s;
		.shape-icon {
			width: 40px;
			height: 27px;
		}
		&:hover {
			border-color: #1677ff;
			color: #1677ff;
		}
		&.active {
			background: rgba(22, 119, 255, 0.1);
			border-color: #1677ff;
			color: #1677ff;
		}
	}
	.tool-list {
		display: flex;
		flex-flow: column;
		gap: 5px;
	}
	.tool-btn {
		padding: 6px 8px;
		border: 1px solid var(--border-color);
		border-radius: 7px;
		background: transparent;
		cursor: pointer;
		font-size: 12px;
		color: var(--text-color-2);
		text-align: left;
		transition: all 0.15s;
		&:hover {
			border-color: #1677ff;
			color: #1677ff;
		}
		&.active {
			background: rgba(22, 119, 255, 0.1);
			border-color: #1677ff;
			color: #1677ff;
		}
	}
	.canvas-wrap {
		flex: 1;
		min-width: 0;
		position: relative;
		background: var(--panel-bg);
		border-radius: 12px;
		overflow: hidden;
		display: flex;
		flex-flow: column;
	}
	.canvas-toolbar {
		flex: none;
		padding: 8px 10px;
		border-bottom: 1px solid var(--border-color);
		background: var(--panel-bg);
		z-index: 2;
		.zoom-label {
			font-size: 12px;
			color: var(--text-color-3);
			padding: 0 4px;
		}
		:deep(.ant-btn.on) {
			color: #1677ff;
			border-color: #1677ff;
		}
	}
	.stage {
		flex: 1;
		width: 100%;
		min-height: 0;
		display: block;
		cursor: default;
		touch-action: none;
	}
	:deep(.edge-hit) {
		stroke: transparent;
		stroke-width: 12;
		fill: none;
		cursor: pointer;
	}
	:deep(.edge-line) {
		pointer-events: none;
	}
	:deep(.edge-line.selected) {
		filter: drop-shadow(0 0 2px rgba(22, 119, 255, 0.9));
	}
	:deep(.edge-label) {
		fill: #475569;
		font-family: system-ui, -apple-system, 'Microsoft YaHei', sans-serif;
		pointer-events: none;
	}
	:deep(.node) {
		cursor: move;
	}
	:deep(.node-text) {
		font-family: system-ui, -apple-system, 'Microsoft YaHei', sans-serif;
		user-select: none;
	}
	:deep(.port) {
		fill: #fff;
		stroke: #1677ff;
		stroke-width: 1.4;
		cursor: crosshair;
		&:hover {
			fill: #1677ff;
		}
	}
	.text-editor {
		position: absolute;
		z-index: 5;
		/* 直接叠在图形上编辑：透明无边框，看起来就是在原来的矩形里打字 */
		border: none;
		border-radius: 0;
		outline: none;
		resize: none;
		padding: 0;
		background: transparent;
		overflow: hidden;
		line-height: 1.35;
		box-shadow: none;
		caret-color: #1677ff;
		font-family: system-ui, -apple-system, 'Microsoft YaHei', sans-serif;
		&::selection {
			background: rgba(22, 119, 255, 0.25);
		}
	}
	.empty-hint {
		position: absolute;
		inset: 0;
		display: flex;
		flex-flow: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		pointer-events: none;
		.big {
			font-size: 15px;
			font-weight: 600;
			color: var(--text-color-3);
		}
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
		.label {
			font-size: 12px;
			color: var(--text-color-3);
			white-space: nowrap;
		}
		.color {
			width: 34px;
			height: 26px;
			padding: 0;
			border: 1px solid var(--panel-border, var(--border-color));
			border-radius: 6px;
			background: none;
			cursor: pointer;
		}
	}
	.doc-info {
		word-break: break-all;
		line-height: 1.6;
	}
}
</style>
