<template>
	<div class="tool mindMap">
		<h1 class="tool-title">
			思维导图
			<span class="tip">Tab 加子节点 · Enter 加同级 · 双击改文字 · 拖动节点可调整层级，自动保存在本地</span>
		</h1>

		<div class="tool-content">
			<div class="editor">
				<div class="canvas-wrap" ref="wrapRef">
					<div class="canvas-toolbar">
						<a-space :size="4" wrap>
							<a-button size="small" type="primary" ghost :disabled="!selectedId" @click="addChild">+ 子节点</a-button>
							<a-button size="small" :disabled="!selectedId || isRoot(selectedId)" @click="addSibling">+ 同级</a-button>
							<a-button size="small" :disabled="!selectedId" @click="toggleCollapse">折叠/展开</a-button>
							<a-button size="small" danger :disabled="!selectedId || isRoot(selectedId)" @click="removeNode">删除</a-button>
							<a-button size="small" :disabled="!undoStack.length" @click="undo">撤销</a-button>
							<a-button size="small" :disabled="!redoStack.length" @click="redo">重做</a-button>
							<a-button size="small" @click="fitView">适应</a-button>
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
					>
						<defs>
							<pattern
								id="mm-grid"
								patternUnits="userSpaceOnUse"
								:width="24 * view.scale"
								:height="24 * view.scale"
								:x="view.tx % (24 * view.scale)"
								:y="view.ty % (24 * view.scale)"
							>
								<circle :cx="1" :cy="1" :r="Math.max(0.6, 1 * view.scale)" fill="#c9d2de" />
							</pattern>
						</defs>

						<rect width="100%" height="100%" fill="url(#mm-grid)" />

						<g :transform="`translate(${view.tx} ${view.ty}) scale(${view.scale})`">
							<!-- 连线 -->
							<path
								v-for="c in connectors"
								:key="c.id"
								:d="c.d"
								fill="none"
								:stroke="c.color"
								:stroke-width="c.width"
								stroke-linecap="round"
							/>

							<!-- 节点 -->
							<g
								v-for="n in laidNodes"
								:key="n.id"
								class="mm-node"
								@pointerdown.stop="onNodeDown(n, $event)"
								@dblclick.stop="startEdit(n)"
							>
								<rect
									:x="n.x"
									:y="n.y"
									:width="n.w"
									:height="n.h"
									:rx="n.depth === 0 ? 12 : 9"
									:fill="n.bg"
									:stroke="n.border"
									:stroke-width="n.depth === 0 ? 2 : 1.4"
									:class="{ selected: selectedId === n.id, 'drop-target': dropTargetId === n.id }"
								/>
								<text
									v-if="editing?.id !== n.id"
									text-anchor="middle"
									:fill="n.color"
									:font-size="n.fontSize"
									:font-weight="n.depth === 0 ? 600 : 500"
									class="mm-text"
								>
									<tspan v-for="(line, i) in n.lines" :key="i" :x="n.x + n.w / 2" :y="n.textY[i]">{{ line }}</tspan>
								</text>

								<!-- 折叠标记 -->
								<g v-if="hasChildren(n.node) && !n.node.collapsed" class="toggle" @pointerdown.stop @click.stop="toggleCollapseOf(n.node)">
									<circle :cx="n.x + n.w + 2" :cy="n.y + n.h / 2" r="6.5" fill="#fff" stroke="#94a3b8" stroke-width="1.2" />
									<path :d="`M ${n.x - 1.5 + n.w} ${n.y + n.h / 2} h 7`" stroke="#64748b" stroke-width="1.4" />
								</g>
								<g v-if="hasChildren(n.node) && n.node.collapsed" class="toggle" @pointerdown.stop @click.stop="toggleCollapseOf(n.node)">
									<circle :cx="n.x + n.w + 2" :cy="n.y + n.h / 2" r="7.5" fill="#1677ff" />
									<text :x="n.x + n.w + 2" :y="n.y + n.h / 2 + 3.6" text-anchor="middle" font-size="9" fill="#fff" class="count">
										{{ countDescendants(n.node) }}
									</text>
								</g>
							</g>
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
				</div>

				<aside class="inspector">
					<div class="panel-title">节点</div>
					<div class="row">
						<span class="label">填充</span>
						<input type="color" class="color" :value="selectedNode?.bg || '#e0f2fe'" @pointerdown="markPending" @input="applyNode('bg', $event.target.value)" />
						<span class="label">边框</span>
						<input type="color" class="color" :value="selectedNode?.border || '#0284c7'" @pointerdown="markPending" @input="applyNode('border', $event.target.value)" />
					</div>
					<div class="row">
						<span class="label">文字</span>
						<input type="color" class="color" :value="selectedNode?.color || '#0f172a'" @pointerdown="markPending" @input="applyNode('color', $event.target.value)" />
						<a-button size="small" :disabled="!selectedNode" @click="resetNodeStyle">恢复主题色</a-button>
					</div>

					<div class="panel-title" style="margin-top: 14px">外观</div>
					<div class="row">
						<span class="label">配色</span>
						<a-select :value="themeKey" size="small" style="flex: 1" :options="THEME_OPTIONS" @change="v => (themeKey = v)" />
					</div>
					<div class="row">
						<span class="label">方向</span>
						<a-radio-group :value="direction" size="small" @change="e => (direction = e.target.value)">
							<a-radio-button value="right">单向</a-radio-button>
							<a-radio-button value="both">两侧</a-radio-button>
						</a-radio-group>
					</div>
					<div class="row">
						<span class="label">字号</span>
						<a-slider :value="fontSize" :min="11" :max="22" :step="1" style="flex: 1" @change="v => (fontSize = v)" />
						<span class="hint">{{ fontSize }}</span>
					</div>

					<div class="panel-title" style="margin-top: 14px">文档</div>
					<div class="doc-info hint">{{ storageLabel }}</div>
					<div class="row" style="margin-top: 8px; gap: 8px; flex-wrap: wrap">
						<a-button size="small" @click="saveAsFile">另存为</a-button>
						<a-button size="small" @click="openFile">打开</a-button>
						<a-button size="small" @click="exportSvg">导出 SVG</a-button>
						<a-button size="small" @click="exportPng">导出 PNG</a-button>
						<a-button size="small" @click="exportMarkdown">导出大纲</a-button>
					</div>

					<div class="panel-title" style="margin-top: 14px">统计</div>
					<div class="hint">共 {{ totalCount }} 个节点 · 最大深度 {{ maxDepth }} 层</div>
				</aside>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">空白处拖动平移 · 滚轮缩放 · 拖动节点到另一个节点上可改变父子关系</span>
			<a-space>
				<span v-if="savedAt" class="hint">已自动保存 {{ savedAt }}</span>
				<a-button danger @click="resetAll">清空重来</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { friendlyError, openFiles, readSourceText, saveBytesAs, saveTextAs } from '@/utils/tauriIO'
import { createDocStore, debounce } from '@/utils/localDoc'

/* ---------------- 主题 ---------------- */
const THEMES = {
	blue: { name: '海蓝', levels: ['#0c4a6e|#0284c7|#ffffff', '#e0f2fe|#0284c7|#0c4a6e', '#f0f9ff|#38bdf8|#0c4a6e', '#f8fafc|#94a3b8|#334155'] },
	green: { name: '森林', levels: ['#14532d|#16a34a|#ffffff', '#dcfce7|#16a34a|#14532d', '#f0fdf4|#4ade80|#14532d', '#f8fafc|#94a3b8|#334155'] },
	purple: { name: '紫罗兰', levels: ['#4c1d95|#8b5cf6|#ffffff', '#ede9fe|#8b5cf6|#4c1d95', '#f5f3ff|#a78bfa|#4c1d95', '#f8fafc|#94a3b8|#334155'] },
	orange: { name: '暖橙', levels: ['#7c2d12|#ea580c|#ffffff', '#ffedd5|#ea580c|#7c2d12', '#fff7ed|#fb923c|#7c2d12', '#f8fafc|#94a3b8|#334155'] },
	dark: { name: '深色', levels: ['#1e293b|#38bdf8|#f8fafc', '#334155|#64748b|#f1f5f9', '#1e293b|#475569|#e2e8f0', '#0f172a|#334155|#cbd5e1'] },
}
const THEME_OPTIONS = Object.entries(THEMES).map(([value, t]) => ({ value, label: t.name }))

const themeKey = ref('blue')
const direction = ref('right')
const fontSize = ref(13)

const palette = level => {
	const conf = (THEMES[themeKey.value] || THEMES.blue).levels
	const row = conf[Math.min(level, conf.length - 1)]
	const [bg, border, color] = row.split('|')
	return { bg, border, color }
}

/* ---------------- 状态 ---------------- */
let uid = 1
const makeTree = () => ({
	id: `m${uid++}`,
	text: '中心主题',
	children: [],
	collapsed: false,
	style: null,
})
const root = ref(makeTree())
const selectedId = ref('')
const editing = ref(null)
const dropTargetId = ref('')
const view = reactive({ scale: 1, tx: 0, ty: 0 })
const savedAt = ref('')
const storageLabel = ref('')

const wrapRef = ref(null)
const svgRef = ref(null)
const editRef = ref(null)

const undoStack = reactive([])
const redoStack = reactive([])
let pendingSnapshot = ''

const store = createDocStore({ fileName: 'mindmap-autosave.json', localKey: 'xtools-mindmap-autosave' })

/* ---------------- 树工具 ---------------- */
const hasChildren = n => Array.isArray(n.children) && n.children.length > 0
const isRoot = id => root.value.id === id

const walk = (node, fn, parent = null, depth = 0) => {
	fn(node, parent, depth)
	if (hasChildren(node)) for (const child of node.children) walk(child, fn, node, depth + 1)
}

const findNode = id => {
	let found = null
	walk(root.value, n => {
		if (n.id === id) found = n
	})
	return found
}
const findParent = id => {
	let found = null
	walk(root.value, (n, p) => {
		if (n.id === id) found = p
	})
	return found
}
const countDescendants = node => {
	let count = 0
	walk(node, (n, p) => {
		if (p) count += 1
	})
	// 只统计未展开时的全部后代（包含已折叠的）
	return count
}

const totalCount = computed(() => {
	let c = 0
	walk(root.value, () => {
		c += 1
	})
	return c
})
const maxDepth = computed(() => {
	let d = 0
	walk(root.value, (n, p, depth) => {
		d = Math.max(d, depth)
	})
	return d + 1
})

const selectedNode = computed(() => (selectedId.value ? findNode(selectedId.value) : null))

/* ---------------- 文本测量与布局 ---------------- */
let measureCtx = null
const measureText = (text, size) => {
	if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
	measureCtx.font = `500 ${size}px system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif`
	return measureCtx.measureText(text).width
}
const wrapText = (text, maxWidth, size) => {
	const out = []
	for (const para of String(text ?? '').split('\n')) {
		if (!para) {
			out.push('')
			continue
		}
		let line = ''
		for (const ch of para) {
			const test = line + ch
			if (line && measureText(test, size) > maxWidth) {
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

const GAP_X = 58
const GAP_Y = 16

/** 节点尺寸：根据文字换行计算 */
const nodeSize = (node, depth) => {
	const size = depth === 0 ? fontSize.value + 3 : fontSize.value
	const lines = wrapText(node.text, 190, size)
	const textW = Math.max(...lines.map(l => measureText(l, size)), 40)
	const w = Math.min(250, Math.max(76, textW + 26))
	const lineH = size * 1.4
	const h = Math.max(34, lines.length * lineH + 15)
	return { w, h, lines, size, lineH }
}

const laidNodes = computed(() => {
	const list = []
	const sizeCache = new Map()

	const getSize = (node, depth) => {
		const key = `${node.id}:${depth}`
		if (!sizeCache.has(key)) sizeCache.set(key, nodeSize(node, depth))
		return sizeCache.get(key)
	}

	let cursor = 0
	const place = (node, x, depth) => {
		const s = getSize(node, depth)
		const kids = node.collapsed ? [] : node.children || []
		if (!kids.length) {
			const y = cursor
			cursor += s.h + GAP_Y
			list.push({ node, x, y, w: s.w, h: s.h, depth, lines: s.lines, size: s.size, lineH: s.lineH })
			return { top: y, bottom: y + s.h }
		}
		const spans = kids.map(k => place(k, x + s.w + GAP_X, depth + 1))
		const top = spans[0].top
		const bottom = spans[spans.length - 1].bottom
		const center = (top + bottom) / 2
		const y = center - s.h / 2
		list.push({ node, x, y, w: s.w, h: s.h, depth, lines: s.lines, size: s.size, lineH: s.lineH })
		return { top: Math.min(top, y), bottom: Math.max(bottom, y + s.h) }
	}

	if (direction.value === 'both' && hasChildren(root.value)) {
		// 两侧布局：根节点居中，子节点分左右
		const rightKids = root.value.children.filter((_, i) => i % 2 === 0)
		const leftKids = root.value.children.filter((_, i) => i % 2 === 1)
		const rootSize = getSize(root.value, 0)

		// 右侧
		cursor = 0
		const rightSpans = rightKids.length ? rightKids.map(k => place(k, rootSize.w + GAP_X, 1)) : []
		const rightTop = rightSpans.length ? rightSpans[0].top : 0
		const rightBottom = rightSpans.length ? rightSpans[rightSpans.length - 1].bottom : 0

		// 左侧：先按正常逻辑排，再镜像 x
		const leftStart = list.length
		cursor = 0
		const leftSpans = leftKids.length ? leftKids.map(k => place(k, rootSize.w + GAP_X, 1)) : []
		for (let i = leftStart; i < list.length; i += 1) {
			const e = list[i]
			e.x = -(e.x + e.w)
		}
		const leftTop = leftSpans.length ? leftSpans[0].top : 0
		const leftBottom = leftSpans.length ? leftSpans[leftSpans.length - 1].bottom : 0

		const totalTop = Math.min(rightTop, leftTop, 0)
		const totalBottom = Math.max(rightBottom, leftBottom, 0)
		const shift = (totalTop + totalBottom) / 2
		for (const e of list) e.y -= shift
		list.push({
			node: root.value,
			x: 0,
			y: -rootSize.h / 2,
			w: rootSize.w,
			h: rootSize.h,
			depth: 0,
			lines: rootSize.lines,
			size: rootSize.size,
			lineH: rootSize.lineH,
		})
	} else {
		cursor = 0
		const span = place(root.value, 0, 0)
		const shift = (span.top + span.bottom) / 2
		for (const e of list) e.y -= shift
	}

	// 补上颜色与文字基线
	return list.map(e => {
		const custom = e.node.style
		const pal = palette(e.depth)
		const bg = custom?.bg || pal.bg
		const border = custom?.border || pal.border
		const color = custom?.color || pal.color
		const totalH = e.lines.length * e.lineH
		const startY = e.y + e.h / 2 - totalH / 2 + e.lineH * 0.76
		return {
			...e,
			bg,
			border,
			color,
			fontSize: e.size,
			textY: e.lines.map((_, i) => startY + i * e.lineH),
		}
	})
})

const byId = computed(() => {
	const map = new Map()
	for (const e of laidNodes.value) map.set(e.node.id, e)
	return map
})

const connectors = computed(() => {
	const out = []
	for (const e of laidNodes.value) {
		const node = e.node
		if (node.collapsed || !hasChildren(node)) continue
		const pe = e
		for (const child of node.children) {
			const ce = byId.value.get(child.id)
			if (!ce) continue
			const goingRight = ce.x > pe.x
			const x1 = goingRight ? pe.x + pe.w : pe.x
			const y1 = pe.y + pe.h / 2
			const x2 = goingRight ? ce.x : ce.x + ce.w
			const y2 = ce.y + ce.h / 2
			const mx = (x1 + x2) / 2
			const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
			const pal = palette(ce.depth)
			out.push({
				id: `${node.id}-${child.id}`,
				d,
				color: pal.border,
				width: ce.depth <= 1 ? 2.2 : 1.5,
			})
		}
	}
	return out
})

/* ---------------- 操作 ---------------- */
const snapshot = () =>
	JSON.stringify({
		root: root.value,
		themeKey: themeKey.value,
		direction: direction.value,
		fontSize: fontSize.value,
	})
const pushHistory = () => {
	undoStack.push(snapshot())
	if (undoStack.length > 80) undoStack.shift()
	redoStack.length = 0
}
const restore = s => {
	const data = JSON.parse(s)
	root.value = data.root
	themeKey.value = data.themeKey || 'blue'
	direction.value = data.direction || 'right'
	fontSize.value = data.fontSize || 13
	selectedId.value = ''
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

const addChild = () => {
	const node = selectedNode.value || root.value
	pushHistory()
	if (node.collapsed) node.collapsed = false
	const child = { id: `m${uid++}`, text: '新节点', children: [], collapsed: false, style: null }
	node.children.push(child)
	selectedId.value = child.id
	nextTick(() => startEditById(child.id))
}

const addSibling = () => {
	const node = selectedNode.value
	if (!node || node === root.value) return
	const parent = findParent(node.id)
	if (!parent) return
	pushHistory()
	const idx = parent.children.findIndex(c => c.id === node.id)
	const sib = { id: `m${uid++}`, text: '新节点', children: [], collapsed: false, style: null }
	parent.children.splice(idx + 1, 0, sib)
	selectedId.value = sib.id
	nextTick(() => startEditById(sib.id))
}

const removeNode = () => {
	const node = selectedNode.value
	if (!node || node === root.value) return
	const parent = findParent(node.id)
	if (!parent) return
	pushHistory()
	parent.children = parent.children.filter(c => c.id !== node.id)
	selectedId.value = parent.id
}

const toggleCollapseOf = node => {
	pushHistory()
	node.collapsed = !node.collapsed
}
const toggleCollapse = () => {
	if (selectedNode.value) toggleCollapseOf(selectedNode.value)
}

const applyNode = (key, value) => {
	const node = selectedNode.value
	if (!node) return
	if (!node.style) node.style = {}
	node.style[key] = value
}
const resetNodeStyle = () => {
	if (!selectedNode.value) return
	markPending()
	selectedNode.value.style = null
	commitPending()
}

const resetAll = () => {
	pushHistory()
	uid = 1
	root.value = {
		id: `m${uid++}`,
		text: '中心主题',
		children: [
			{ id: `m${uid++}`, text: '主题一', children: [], collapsed: false, style: null },
			{ id: `m${uid++}`, text: '主题二', children: [], collapsed: false, style: null },
			{ id: `m${uid++}`, text: '主题三', children: [], collapsed: false, style: null },
		],
		collapsed: false,
		style: null,
	}
	selectedId.value = ''
	nextTick(fitView)
}

/* ---------------- 文字编辑 ---------------- */
const startEditById = id => {
	const entry = byId.value.get(id)
	if (entry) startEdit(entry)
}

const startEdit = entry => {
	markPending()
	editing.value = { id: entry.node.id, text: entry.node.text }
	nextTick(() => {
		editRef.value?.focus()
		editRef.value?.select()
	})
}

const editStyle = computed(() => {
	if (!editing.value) return {}
	const e = byId.value.get(editing.value.id)
	if (!e) return {}
	const lineHeight = 1.35
	const lines = Math.max(1, String(editing.value.text || '').split('\n').length)
	// 垂直居中到节点框内，和原来的文字位置重合
	const padTop = Math.max(2, (e.h - lines * e.fontSize * lineHeight) / 2)
	const boxW = Math.max(30, e.w * view.scale)
	const boxH = Math.max(24, e.h * view.scale)
	// 输入框相对 .canvas-wrap 定位，坐标却是 svg 内部坐标，需要补上 svg 的偏移（工具栏高度）
	const dx = svgRef.value && wrapRef.value ? svgRef.value.getBoundingClientRect().left - wrapRef.value.getBoundingClientRect().left : 0
	const dy = svgRef.value && wrapRef.value ? svgRef.value.getBoundingClientRect().top - wrapRef.value.getBoundingClientRect().top : 0
	return {
		left: `${dx + e.x * view.scale + view.tx}px`,
		top: `${dy + e.y * view.scale + view.ty}px`,
		width: `${boxW}px`,
		height: `${boxH}px`,
		fontSize: `${e.fontSize * view.scale}px`,
		lineHeight: String(lineHeight),
		paddingTop: `${padTop * view.scale}px`,
		color: e.color,
		fontWeight: e.depth === 0 ? 600 : 500,
	}
})

const commitEdit = () => {
	if (!editing.value) return
	const node = findNode(editing.value.id)
	if (node) node.text = editing.value.text || '未命名'
	editing.value = null
	commitPending()
}
const cancelEdit = () => {
	editing.value = null
	pendingSnapshot = ''
}

/* ---------------- 指针交互 ---------------- */
let drag = null

const toWorld = evt => {
	const rect = wrapRef.value.getBoundingClientRect()
	return {
		x: (evt.clientX - rect.left - view.tx) / view.scale,
		y: (evt.clientY - rect.top - view.ty) / view.scale,
	}
}

const entryAt = p => {
	const list = laidNodes.value
	for (let i = list.length - 1; i >= 0; i -= 1) {
		const e = list[i]
		if (p.x >= e.x && p.x <= e.x + e.w && p.y >= e.y && p.y <= e.y + e.h) return e
	}
	return null
}

const onCanvasDown = evt => {
	if (evt.button !== 0) return
	selectedId.value = ''
	drag = { type: 'pan', startX: evt.clientX, startY: evt.clientY, tx: view.tx, ty: view.ty }
	window.addEventListener('pointermove', onWindowMove)
	window.addEventListener('pointerup', onWindowUp)
}

const onNodeDown = (entry, evt) => {
	if (evt.button !== 0) return
	selectedId.value = entry.node.id
	drag = {
		type: 'node',
		id: entry.node.id,
		start: toWorld(evt),
		moved: false,
		startX: evt.clientX,
		startY: evt.clientY,
		tx: view.tx,
		ty: view.ty,
	}
	window.addEventListener('pointermove', onWindowMove)
	window.addEventListener('pointerup', onWindowUp)
}

const onWindowMove = evt => {
	if (!drag) return
	if (drag.type === 'pan') {
		view.tx = drag.tx + (evt.clientX - drag.startX)
		view.ty = drag.ty + (evt.clientY - drag.startY)
		return
	}
	if (drag.type === 'node') {
		if (!drag.moved && Math.hypot(evt.clientX - drag.startX, evt.clientY - drag.startY) < 4) return
		drag.moved = true
		const p = toWorld(evt)
		const target = entryAt(p)
		dropTargetId.value = target && target.node.id !== drag.id && !isDescendantOf(target.node, drag.id) ? target.node.id : ''
	}
}

const isDescendantOf = (node, ancestorId) => {
	let found = false
	walk(node, (n, p) => {
		if (p && p.id === ancestorId) found = true
		// 也排除 node 自身作为祖先链的一环
	})
	if (node.id === ancestorId) return true
	return found
}

const onWindowUp = () => {
	if (drag?.type === 'node' && drag.moved && dropTargetId.value) {
		const node = findNode(drag.id)
		const target = findNode(dropTargetId.value)
		if (node && target && node !== root.value) {
			pushHistory()
			const parent = findParent(node.id)
			if (parent) parent.children = parent.children.filter(c => c.id !== node.id)
			target.children.push(node)
			if (target.collapsed) target.collapsed = false
		}
		dropTargetId.value = ''
	}
	drag = null
	window.removeEventListener('pointermove', onWindowMove)
	window.removeEventListener('pointerup', onWindowUp)
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
	const list = laidNodes.value
	if (!list.length) return
	const minX = Math.min(...list.map(e => e.x))
	const maxX = Math.max(...list.map(e => e.x + e.w))
	const minY = Math.min(...list.map(e => e.y))
	const maxY = Math.max(...list.map(e => e.y + e.h))
	const rect = wrapRef.value.getBoundingClientRect()
	const pad = 60
	const scale = Math.min((rect.width - pad * 2) / (maxX - minX || 1), (rect.height - pad * 2) / (maxY - minY || 1), 1.4)
	view.scale = Math.max(0.2, scale)
	view.tx = pad + (rect.width - pad * 2 - (maxX - minX) * view.scale) / 2 - minX * view.scale
	view.ty = pad + (rect.height - pad * 2 - (maxY - minY) * view.scale) / 2 - minY * view.scale
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
	if (evt.key === 'Tab') {
		evt.preventDefault()
		addChild()
		return
	}
	if (evt.key === 'Enter') {
		evt.preventDefault()
		if (selectedId.value === root.value.id || !selectedId.value) addChild()
		else addSibling()
		return
	}
	if (evt.key === 'F2' && selectedId.value) {
		evt.preventDefault()
		startEditById(selectedId.value)
		return
	}
	if ((evt.key === 'Delete' || evt.key === 'Backspace') && selectedId.value) {
		evt.preventDefault()
		removeNode()
		return
	}
	if (evt.key === ' ' && selectedId.value) {
		evt.preventDefault()
		toggleCollapse()
		return
	}
	if (evt.key === 'Escape') selectedId.value = ''
}

/* ---------------- 持久化 ---------------- */
const serialize = () =>
	JSON.stringify({ version: 1, root: root.value, themeKey: themeKey.value, direction: direction.value, fontSize: fontSize.value })

const applyDoc = text => {
	const data = JSON.parse(text)
	if (!data?.root) throw new Error('文件格式不正确')
	root.value = data.root
	themeKey.value = data.themeKey || 'blue'
	direction.value = data.direction || 'right'
	fontSize.value = data.fontSize || 13
	const ids = []
	walk(root.value, n => ids.push(n.id))
	uid = ids.map(i => Number(String(i).replace(/\D/g, '')) || 0).reduce((a, b) => Math.max(a, b), 0) + 1
	selectedId.value = ''
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

watch([root, themeKey, direction, fontSize], () => autosave(), { deep: true })

const saveAsFile = async () => {
	try {
		const path = await saveTextAs(serialize(), {
			defaultPath: '思维导图.json',
			filters: [{ name: '思维导图', extensions: ['json'] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const openFile = async () => {
	try {
		const files = await openFiles({ multiple: false, filters: [{ name: '思维导图', extensions: ['json'] }] })
		if (!files?.length) return
		applyDoc(await readSourceText(files[0]))
		nextTick(fitView)
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
	const list = laidNodes.value
	if (!list.length) throw new Error('没有可导出的内容')
	const minX = Math.min(...list.map(e => e.x)) - 30
	const maxX = Math.max(...list.map(e => e.x + e.w)) + 30
	const minY = Math.min(...list.map(e => e.y)) - 30
	const maxY = Math.max(...list.map(e => e.y + e.h)) + 30
	const w = maxX - minX
	const h = maxY - minY
	const parts = []
	parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">`)
	parts.push(`<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#ffffff"/>`)
	for (const c of connectors.value) {
		parts.push(`<path d="${c.d}" fill="none" stroke="${c.color}" stroke-width="${c.width}" stroke-linecap="round"/>`)
	}
	for (const e of list) {
		const rx = e.depth === 0 ? 12 : 9
		parts.push(
			`<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${rx}" fill="${e.bg}" stroke="${e.border}" stroke-width="${e.depth === 0 ? 2 : 1.4}"/>`
		)
		const spans = e.lines
			.map((line, i) => `<tspan x="${e.x + e.w / 2}" y="${e.textY[i]}">${escapeXml(line)}</tspan>`)
			.join('')
		parts.push(
			`<text text-anchor="middle" fill="${e.color}" font-size="${e.fontSize}" font-weight="${e.depth === 0 ? 600 : 500}" font-family="system-ui, -apple-system, 'Microsoft YaHei', sans-serif">${spans}</text>`
		)
	}
	parts.push('</svg>')
	return parts.join('\n')
}

const exportSvg = async () => {
	try {
		const path = await saveTextAs(buildSvg(), { defaultPath: '思维导图.svg', filters: [{ name: 'SVG', extensions: ['svg'] }] })
		if (path) message.success(`已导出：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const exportPng = async () => {
	try {
		const svg = buildSvg()
		const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
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
		const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
		const bytes = new Uint8Array(await blob.arrayBuffer())
		const path = await saveBytesAs(bytes, { defaultPath: '思维导图.png', filters: [{ name: 'PNG', extensions: ['png'] }] })
		if (path) message.success(`已导出：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const exportMarkdown = async () => {
	const lines = []
	const walkMd = (node, depth) => {
		lines.push(`${'  '.repeat(depth)}- ${node.text}`)
		if (hasChildren(node)) for (const c of node.children) walkMd(c, depth + 1)
	}
	walkMd(root.value, 0)
	try {
		const path = await saveTextAs(lines.join('\n'), {
			defaultPath: '思维导图.md',
			filters: [{ name: 'Markdown', extensions: ['md'] }],
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
			/* 忽略损坏存档 */
		}
	} else {
		resetAll()
		undoStack.length = 0
		redoStack.length = 0
	}
	nextTick(fitView)
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

.mindMap {
	.editor {
		display: flex;
		gap: 12px;
		align-items: stretch;
		height: 100%;
		min-height: 0;
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
		z-index: 2;
		.zoom-label {
			font-size: 12px;
			color: var(--text-color-3);
			padding: 0 4px;
		}
	}
	.stage {
		flex: 1;
		width: 100%;
		min-height: 0;
		display: block;
		touch-action: none;
	}
	:deep(.mm-node) {
		cursor: pointer;
	}
	:deep(.mm-node rect) {
		transition: filter 0.15s;
	}
	:deep(.mm-node rect.selected) {
		filter: drop-shadow(0 0 4px rgba(22, 119, 255, 0.85));
	}
	:deep(.mm-node rect.drop-target) {
		stroke: #1677ff !important;
		stroke-width: 2.6 !important;
	}
	:deep(.mm-text) {
		font-family: system-ui, -apple-system, 'Microsoft YaHei', sans-serif;
		user-select: none;
	}
	:deep(.toggle) {
		cursor: pointer;
	}
	.text-editor {
		position: absolute;
		z-index: 5;
		/* 叠在节点上直接编辑：透明无边框，看起来就是在原来的矩形里打字 */
		border: none;
		border-radius: 0;
		outline: none;
		resize: none;
		padding: 0;
		background: transparent;
		overflow: hidden;
		line-height: 1.35;
		text-align: center;
		box-shadow: none;
		caret-color: #1677ff;
		font-family: system-ui, -apple-system, 'Microsoft YaHei', sans-serif;
		&::selection {
			background: rgba(22, 119, 255, 0.25);
		}
	}
	.inspector {
		flex: none;
		width: 240px;
		background: var(--panel-bg);
		border-radius: 12px;
		padding: 10px 12px;
		box-sizing: border-box;
		overflow-y: auto;
	}
	.panel-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-color-3);
		margin: 6px 0 8px;
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
			border: 1px solid var(--border-color);
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
