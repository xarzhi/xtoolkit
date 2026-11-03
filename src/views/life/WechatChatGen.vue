<template>
	<div class="tool wechatGen">
		<h1 class="tool-title">
			微信对话生成器
			<span class="tip">自定义双方昵称、头像与对话内容，实时预览并导出成图片</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<div class="preview-col">
					<div class="phone">
						<canvas ref="canvasRef" class="chat-canvas"></canvas>
					</div>
					<div class="hint" style="margin-top: 10px">
						预览宽度 375px，导出按 2 倍分辨率（{{ outInfo }}）
					</div>
				</div>

				<div class="edit-col">
					<div class="tool-card block">
						<div class="block-title">基本信息</div>
						<div class="fields">
							<label class="field">
								<span class="k">聊天标题</span>
								<a-input v-model:value="form.title" placeholder="对方昵称" allow-clear />
							</label>
							<label class="field">
								<span class="k">状态栏时间</span>
								<a-input v-model:value="form.statusTime" placeholder="9:41" allow-clear />
							</label>
						</div>
						<div class="avatar-row">
							<div class="avatar-item">
								<span class="k">对方头像</span>
								<button class="avatar-btn" @click="pickAvatar('left')">
									<img v-if="avatars.left.url" :src="avatars.left.url" alt="" />
									<span v-else>点击上传</span>
								</button>
								<a-button v-if="avatars.left.url" size="small" type="text" danger @click="clearAvatar('left')">
									清除
								</a-button>
							</div>
							<div class="avatar-item">
								<span class="k">我的头像</span>
								<button class="avatar-btn" @click="pickAvatar('right')">
									<img v-if="avatars.right.url" :src="avatars.right.url" alt="" />
									<span v-else>点击上传</span>
								</button>
								<a-button v-if="avatars.right.url" size="small" type="text" danger @click="clearAvatar('right')">
									清除
								</a-button>
							</div>
						</div>
						<div class="switch-row">
							<span class="label">显示底部输入栏</span>
							<a-switch v-model:checked="form.showInput" size="small" />
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">
							对话内容
							<span class="count">{{ messages.length }} 条</span>
							<a-space style="margin-left: auto" :size="8">
								<a-button size="small" @click="loadSample">载入示例</a-button>
								<a-button size="small" @click="clearMessages">清空</a-button>
							</a-space>
						</div>

						<div class="msg-list">
							<div class="msg" v-for="(item, index) in messages" :key="item.id">
								<div class="msg-head">
									<a-radio-group v-model:value="item.side" size="small" button-style="solid">
										<a-radio-button value="left">对方</a-radio-button>
										<a-radio-button value="right">我</a-radio-button>
									</a-radio-group>
									<a-input
										v-model:value="item.time"
										size="small"
										class="time-input"
										placeholder="时间标签（可选）"
										allow-clear
									/>
									<a-space :size="2" class="msg-ops">
										<a-button size="small" type="text" :disabled="index === 0" @click="moveMsg(index, -1)">↑</a-button>
										<a-button size="small" type="text" :disabled="index === messages.length - 1" @click="moveMsg(index, 1)">↓</a-button>
										<a-button size="small" type="text" danger @click="removeMsg(index)">删除</a-button>
									</a-space>
								</div>
								<a-textarea
									v-model:value="item.text"
									:rows="1"
									:auto-size="{ minRows: 1, maxRows: 4 }"
									placeholder="输入这条消息的内容，回车可换行"
									:spellcheck="false"
								/>
							</div>
							<div v-if="!messages.length" class="hint" style="padding: 12px 0">还没有消息，点下面按钮添加</div>
						</div>

						<div class="add-row">
							<a-button block @click="addMsg('left')">+ 添加对方消息</a-button>
							<a-button block type="primary" ghost @click="addMsg('right')">+ 添加我的消息</a-button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">生成的是模拟界面，请勿用于伪造他人聊天记录等用途</span>
			<a-space>
				<a-button @click="render">刷新预览</a-button>
				<a-button type="primary" :disabled="busy" :loading="busy" @click="exportImage">导出图片</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { friendlyError, isTauri, openFiles, readSourceBytes, saveBytesAs } from '@/utils/tauriIO'

/* ---------------- 常量 ---------------- */

const WIDTH = 375
const STATUS_H = 22
const NAV_H = 46
const PAD = 12
const AVATAR = 40
const AVATAR_GAP = 8
const BUBBLE_PAD_X = 11
const BUBBLE_PAD_Y = 9
const FONT_SIZE = 15
const LINE_HEIGHT = 21
const BUBBLE_MAX = 212

const COLORS = {
	bg: '#ededed',
	navBg: '#ededed',
	navLine: '#d9d9d9',
	title: '#111111',
	leftBubble: '#ffffff',
	rightBubble: '#95ec69',
	text: '#111111',
	time: '#b2b2b2',
	inputBg: '#f7f7f7',
	inputLine: '#dcdcdc',
}

const DEFAULT_TITLE = '微信'
const DEFAULT_STATUS = '9:41'

let idSeq = 0
const nextId = () => {
	idSeq += 1
	return `m${idSeq}`
}

const form = reactive({ title: '小助手', statusTime: DEFAULT_STATUS, showInput: true })
const messages = ref([
	{ id: nextId(), side: 'left', text: '周末有空吗？想约你一起去看展', time: '昨天 20:15' },
	{ id: nextId(), side: 'right', text: '有空呀，几点？', time: '' },
	{ id: nextId(), side: 'left', text: '下午两点，我把地址发你\n在地铁 2 号线附近', time: '' },
	{ id: nextId(), side: 'right', text: '好嘞，那我准时到 👌', time: '' },
])
const avatars = reactive({ left: { url: '', img: null }, right: { url: '', img: null } })

const canvasRef = ref(null)
const busy = ref(false)
const outHeight = ref(0)
const outInfo = computed(() => `${WIDTH} × ${outHeight.value || 0}`)

/* ---------------- 绘制 ---------------- */

const wrapText = (ctx, text, maxWidth) => {
	const lines = []
	for (const paragraph of String(text ?? '').split('\n')) {
		if (!paragraph) {
			lines.push('')
			continue
		}
		let line = ''
		for (const char of paragraph) {
			const test = line + char
			if (line && ctx.measureText(test).width > maxWidth) {
				// 英文尽量在空格处断行，中文按字断
				const spaceIndex = line.lastIndexOf(' ')
				if (spaceIndex > 0 && /[A-Za-z0-9]/.test(char)) {
					lines.push(line.slice(0, spaceIndex))
					line = `${line.slice(spaceIndex + 1)}${char}`
				} else {
					lines.push(line)
					line = char
				}
			} else {
				line = test
			}
		}
		lines.push(line)
	}
	return lines.length ? lines : ['']
}

const roundRect = (ctx, x, y, w, h, r) => {
	ctx.beginPath()
	if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r)
	else {
		ctx.moveTo(x + r, y)
		ctx.arcTo(x + w, y, x + w, y + h, r)
		ctx.arcTo(x + w, y + h, x, y + h, r)
		ctx.arcTo(x, y + h, x, y, r)
		ctx.arcTo(x, y, x + w, y, r)
		ctx.closePath()
	}
}

const drawAvatar = (ctx, img, x, y, fallbackText, bgColor) => {
	ctx.save()
	roundRect(ctx, x, y, AVATAR, AVATAR, 6)
	ctx.clip()
	if (img) {
		// 等比裁切填满
		const scale = Math.max(AVATAR / img.width, AVATAR / img.height)
		const w = img.width * scale
		const h = img.height * scale
		ctx.drawImage(img, x - (w - AVATAR) / 2, y - (h - AVATAR) / 2, w, h)
	} else {
		ctx.fillStyle = bgColor
		ctx.fillRect(x, y, AVATAR, AVATAR)
		ctx.fillStyle = '#ffffff'
		ctx.font = '600 18px "PingFang SC","Microsoft YaHei",sans-serif'
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		ctx.fillText(fallbackText, x + AVATAR / 2, y + AVATAR / 2 + 1)
	}
	ctx.restore()
}

const drawStatusBar = ctx => {
	ctx.fillStyle = '#000000'
	ctx.font = '600 13px "PingFang SC","Microsoft YaHei",sans-serif'
	ctx.textAlign = 'left'
	ctx.textBaseline = 'middle'
	ctx.fillText(form.statusTime || DEFAULT_STATUS, 16, STATUS_H / 2 + 2)

	// 右侧：信号格 + 电池
	const right = WIDTH - 16
	ctx.fillStyle = '#000000'
	for (let i = 0; i < 4; i += 1) {
		const h = 3 + i * 2
		ctx.fillRect(right - 46 + i * 5, STATUS_H / 2 + 4 - h, 3, h)
	}
	// 电池外框
	ctx.strokeStyle = '#000000'
	ctx.lineWidth = 1
	roundRect(ctx, right - 24, STATUS_H / 2 - 4, 20, 9, 2)
	ctx.stroke()
	ctx.fillStyle = '#000000'
	ctx.fillRect(right - 22, STATUS_H / 2 - 2, 12, 5)
	ctx.fillRect(right - 3, STATUS_H / 2 - 1, 2, 3)
}

const drawNavBar = ctx => {
	ctx.fillStyle = COLORS.navBg
	ctx.fillRect(0, STATUS_H, WIDTH, NAV_H)
	ctx.strokeStyle = COLORS.navLine
	ctx.lineWidth = 1
	ctx.beginPath()
	ctx.moveTo(0, STATUS_H + NAV_H + 0.5)
	ctx.lineTo(WIDTH, STATUS_H + NAV_H + 0.5)
	ctx.stroke()

	// 返回箭头
	ctx.strokeStyle = '#111111'
	ctx.lineWidth = 2
	ctx.lineCap = 'round'
	ctx.beginPath()
	const cy = STATUS_H + NAV_H / 2
	ctx.moveTo(24, cy - 8)
	ctx.lineTo(16, cy)
	ctx.lineTo(24, cy + 8)
	ctx.stroke()

	// 标题
	ctx.fillStyle = COLORS.title
	ctx.font = '600 17px "PingFang SC","Microsoft YaHei",sans-serif'
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText(form.title || DEFAULT_TITLE, WIDTH / 2, cy + 1)

	// 右侧更多
	ctx.fillStyle = '#111111'
	for (let i = 0; i < 3; i += 1) {
		ctx.beginPath()
		ctx.arc(WIDTH - 30 + i * 6, cy, 1.6, 0, Math.PI * 2)
		ctx.fill()
	}
}

const drawInputBar = (ctx, y) => {
	const height = 56
	ctx.fillStyle = COLORS.inputBg
	ctx.fillRect(0, y, WIDTH, height)
	ctx.strokeStyle = COLORS.inputLine
	ctx.beginPath()
	ctx.moveTo(0, y + 0.5)
	ctx.lineTo(WIDTH, y + 0.5)
	ctx.stroke()

	// 语音按钮
	ctx.strokeStyle = '#575757'
	ctx.lineWidth = 1.6
	ctx.beginPath()
	ctx.arc(28, y + 28, 9, -Math.PI * 0.75, Math.PI * 0.75)
	ctx.stroke()
	ctx.beginPath()
	ctx.moveTo(28, y + 37)
	ctx.lineTo(28, y + 41)
	ctx.stroke()

	// 输入框
	const boxX = 48
	const boxW = WIDTH - boxX - 82
	ctx.fillStyle = '#ffffff'
	roundRect(ctx, boxX, y + 12, boxW, 32, 6)
	ctx.fill()
	ctx.fillStyle = '#c0c0c0'
	ctx.font = '14px "PingFang SC","Microsoft YaHei",sans-serif'
	ctx.textAlign = 'left'
	ctx.textBaseline = 'middle'
	ctx.fillText('', boxX + 10, y + 28)

	// 表情 / 加号
	ctx.strokeStyle = '#575757'
	ctx.lineWidth = 1.6
	ctx.beginPath()
	ctx.arc(WIDTH - 62, y + 28, 9, 0, Math.PI * 2)
	ctx.stroke()
	ctx.beginPath()
	ctx.arc(WIDTH - 58, y + 25, 1.2, 0, Math.PI * 2)
	ctx.arc(WIDTH - 66, y + 25, 1.2, 0, Math.PI * 2)
	ctx.fillStyle = '#575757'
	ctx.fill()
	ctx.beginPath()
	ctx.arc(WIDTH - 62, y + 28, 5, 0.2, Math.PI - 0.2)
	ctx.stroke()

	ctx.beginPath()
	ctx.arc(WIDTH - 28, y + 28, 10, 0, Math.PI * 2)
	ctx.stroke()
	ctx.beginPath()
	ctx.moveTo(WIDTH - 33, y + 28)
	ctx.lineTo(WIDTH - 23, y + 28)
	ctx.moveTo(WIDTH - 28, y + 23)
	ctx.lineTo(WIDTH - 28, y + 33)
	ctx.stroke()
	return height
}

/** 先排版，再绘制；返回总高度 */
const layoutChat = (ctx, draw) => {
	ctx.font = `${FONT_SIZE}px "PingFang SC","Microsoft YaHei",sans-serif`
	ctx.textBaseline = 'top'

	let y = STATUS_H + NAV_H + PAD + 4
	const maxTextWidth = BUBBLE_MAX - BUBBLE_PAD_X * 2

	if (draw) {
		drawStatusBar(ctx)
		drawNavBar(ctx)
	}

	for (const item of messages.value) {
		if (item.time) {
			if (draw) {
				ctx.fillStyle = COLORS.time
				ctx.font = '11px "PingFang SC","Microsoft YaHei",sans-serif'
				ctx.textAlign = 'center'
				ctx.textBaseline = 'middle'
				ctx.fillText(item.time, WIDTH / 2, y + 8)
			}
			y += 22
		}

		ctx.font = `${FONT_SIZE}px "PingFang SC","Microsoft YaHei",sans-serif`
		const lines = wrapText(ctx, item.text || ' ', maxTextWidth)
		const textWidth = Math.min(
			maxTextWidth,
			Math.max(...lines.map(line => ctx.measureText(line).width), 0)
		)
		const bubbleW = textWidth + BUBBLE_PAD_X * 2
		const bubbleH = lines.length * LINE_HEIGHT + BUBBLE_PAD_Y * 2
		const rowH = Math.max(AVATAR, bubbleH)

		const isLeft = item.side === 'left'
		const avatarX = isLeft ? PAD : WIDTH - PAD - AVATAR
		const bubbleX = isLeft ? PAD + AVATAR + AVATAR_GAP : WIDTH - PAD - AVATAR - AVATAR_GAP - bubbleW

		if (draw) {
			const avatar = isLeft ? avatars.left : avatars.right
			const fallback = isLeft ? (form.title || '对')[0] : '我'
			drawAvatar(ctx, avatar.img, avatarX, y + 2, fallback, isLeft ? '#7c8ba1' : '#4a90d9')

			ctx.fillStyle = isLeft ? COLORS.leftBubble : COLORS.rightBubble
			roundRect(ctx, bubbleX, y, bubbleW, bubbleH, 6)
			ctx.fill()

			// 小尖角
			ctx.beginPath()
			if (isLeft) {
				ctx.moveTo(bubbleX + 1, y + 12)
				ctx.lineTo(bubbleX - 5, y + 18)
				ctx.lineTo(bubbleX + 1, y + 24)
			} else {
				ctx.moveTo(bubbleX + bubbleW - 1, y + 12)
				ctx.lineTo(bubbleX + bubbleW + 5, y + 18)
				ctx.lineTo(bubbleX + bubbleW - 1, y + 24)
			}
			ctx.closePath()
			ctx.fill()

			ctx.fillStyle = COLORS.text
			ctx.font = `${FONT_SIZE}px "PingFang SC","Microsoft YaHei",sans-serif`
			ctx.textAlign = 'left'
			ctx.textBaseline = 'top'
			lines.forEach((line, index) => {
				ctx.fillText(line, bubbleX + BUBBLE_PAD_X, y + BUBBLE_PAD_Y + index * LINE_HEIGHT + 2)
			})
		}

		y += rowH + 16
	}

	const bottom = y + 6
	const inputH = form.showInput ? 56 : 0
	if (draw && form.showInput) drawInputBar(ctx, bottom)
	return bottom + inputH
}

const render = () => {
	const canvas = canvasRef.value
	if (!canvas) return
	const ctx = canvas.getContext('2d')

	// 第一遍：用临时上下文量高度（不落 DOM，避免闪烁）
	const probe = document.createElement('canvas').getContext('2d')
	const height = layoutChat(probe, false)

	const scale = height > 6000 ? 1 : 2
	canvas.width = WIDTH * scale
	canvas.height = Math.max(120, Math.ceil(height)) * scale
	ctx.setTransform(scale, 0, 0, scale, 0, 0)
	ctx.clearRect(0, 0, WIDTH, height)

	// 生成的图片始终用浅色聊天界面，不受 App 明暗主题影响（成品就是一张截图）
	ctx.fillStyle = COLORS.bg
	ctx.fillRect(0, 0, WIDTH, height)

	layoutChat(ctx, true)

	outHeight.value = Math.ceil(height)
}

let rafId = 0
const scheduleRender = () => {
	if (rafId) return
	rafId = requestAnimationFrame(() => {
		rafId = 0
		render()
	})
}

watch([messages, form, avatars], scheduleRender, { deep: true })

onBeforeUnmount(() => {
	if (rafId) cancelAnimationFrame(rafId)
})

/* ---------------- 消息编辑 ---------------- */

const addMsg = side => {
	messages.value.push({ id: nextId(), side, text: '', time: '' })
}

const removeMsg = index => {
	messages.value.splice(index, 1)
}

const moveMsg = (index, delta) => {
	const target = index + delta
	if (target < 0 || target >= messages.value.length) return
	const list = messages.value
	const [item] = list.splice(index, 1)
	list.splice(target, 0, item)
}

const clearMessages = () => {
	messages.value = []
}

const loadSample = () => {
	form.title = '小助手'
	messages.value = [
		{ id: nextId(), side: 'left', text: '周末有空吗？想约你一起去看展', time: '昨天 20:15' },
		{ id: nextId(), side: 'right', text: '有空呀，几点？', time: '' },
		{ id: nextId(), side: 'left', text: '下午两点，我把地址发你\n在地铁 2 号线附近', time: '' },
		{ id: nextId(), side: 'right', text: '好嘞，那我准时到 👌', time: '' },
	]
}

/* ---------------- 头像 ---------------- */

const loadImage = url =>
	new Promise(resolve => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = () => resolve(null)
		img.src = url
	})

const setAvatar = async (side, file) => {
	try {
		const bytes = await readSourceBytes(file)
		const url = URL.createObjectURL(new Blob([bytes]))
		const img = await loadImage(url)
		if (!img) throw new Error('图片无法解析')
		if (avatars[side].url) URL.revokeObjectURL(avatars[side].url)
		avatars[side] = { url, img }
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const pickAvatar = async side => {
	if (!isTauri()) {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = 'image/*'
		input.onchange = () => setAvatar(side, input.files?.[0])
		input.click()
		return
	}
	try {
		const files = await openFiles({
			multiple: false,
			title: '选择头像图片',
			filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
		})
		if (files?.length) await setAvatar(side, files[0])
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const clearAvatar = side => {
	if (avatars[side].url) URL.revokeObjectURL(avatars[side].url)
	avatars[side] = { url: '', img: null }
}

/* ---------------- 导出 ---------------- */

const exportImage = async () => {
	const canvas = canvasRef.value
	if (!canvas) return
	busy.value = true
	try {
		render()
		const dataUrl = canvas.toDataURL('image/png')
		const binary = atob(dataUrl.split(',')[1])
		const bytes = new Uint8Array(binary.length)
		for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
		const path = await saveBytesAs(bytes, {
			defaultPath: `chat-${Date.now()}.png`,
			filters: [{ name: 'PNG', extensions: ['png'] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	} finally {
		busy.value = false
	}
}

onMounted(render)

if (import.meta.env.DEV) {
	window.__wechatTest = {
		set: patch => Object.assign(form, patch),
		setMessages: list => {
			messages.value = list.map(item => ({ id: nextId(), ...item }))
		},
		state: () => ({
			count: messages.value.length,
			width: canvasRef.value?.width || 0,
			height: canvasRef.value?.height || 0,
			title: form.title,
			rects: messages.value.map(item => ({ side: item.side, len: (item.text || '').length })),
		}),
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.wechatGen {
	.layout {
		display: flex;
		gap: 18px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.preview-col {
		flex: none;
		display: flex;
		flex-flow: column;
		align-items: center;
	}
	.phone {
		width: 375px;
		max-width: 100%;
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.16);
		background: #ededed;
	}
	.chat-canvas {
		display: block;
		width: 100%;
		height: auto;
	}
	.edit-col {
		flex: 1;
		min-width: 380px;
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
	.fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.field {
		display: flex;
		align-items: center;
		gap: 8px;
		.k {
			flex: none;
			width: 72px;
			font-size: 12px;
			color: var(--text-color-3);
			text-align: right;
		}
	}
	.avatar-row {
		display: flex;
		gap: 24px;
		margin-top: 12px;
		flex-wrap: wrap;
	}
	.avatar-item {
		display: flex;
		align-items: center;
		gap: 8px;
		.k {
			font-size: 12px;
			color: var(--text-color-3);
		}
	}
	.avatar-btn {
		width: 46px;
		height: 46px;
		border: 1px dashed var(--border-color);
		border-radius: 8px;
		background: transparent;
		cursor: pointer;
		padding: 0;
		overflow: hidden;
		font-size: 10px;
		color: var(--text-color-3);
		img {
			width: 100%;
			height: 100%;
			object-fit: cover;
			display: block;
		}
		&:hover {
			border-color: #1677ff;
			color: #1677ff;
		}
	}
	.switch-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 14px;
		padding-top: 12px;
		border-top: 1px solid var(--border-color);
		.label {
			font-size: 12px;
			color: var(--text-color-2);
		}
	}
	.msg-list {
		display: flex;
		flex-flow: column;
		gap: 10px;
		max-height: 420px;
		overflow: auto;
		padding-right: 4px;
	}
	.msg {
		padding: 10px;
		border-radius: 10px;
		background: rgba(127, 127, 127, 0.06);
		.msg-head {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 8px;
		}
		.time-input {
			width: 130px;
		}
		.msg-ops {
			margin-left: auto;
		}
	}
	.add-row {
		display: flex;
		gap: 10px;
		margin-top: 12px;
	}
	.hint {
		line-height: 1.7;
	}
}
</style>
