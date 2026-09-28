<template>
	<div class="waveform" :style="{ height: height + 'px' }">
		<canvas ref="canvasRef" @mousedown="onDown" @mousemove="onHover" @mouseleave="hover = null"></canvas>
		<div class="hint scale">
			<span>{{ formatTime(0) }}</span>
			<span>{{ formatTime(duration) }}</span>
		</div>
	</div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { formatDuration } from '@/utils/video'

const props = defineProps({
	peaks: { type: Object, default: null },
	duration: { type: Number, default: 0 },
	start: { type: Number, default: 0 },
	end: { type: Number, default: 0 },
	height: { type: Number, default: 96 },
	editable: { type: Boolean, default: true },
	playhead: { type: Number, default: -1 },
})
const emit = defineEmits(['update:start', 'update:end', 'seek'])

const canvasRef = ref(null)
const hover = ref(null)
let dragging = null

const formatTime = seconds => {
	const value = Number.isFinite(seconds) ? seconds : 0
	return value >= 60 ? formatDuration(value) : `${value.toFixed(2)}s`
}

const draw = () => {
	const canvas = canvasRef.value
	if (!canvas) return
	const width = canvas.parentElement?.clientWidth || 600
	const ratio = window.devicePixelRatio || 1
	canvas.width = width * ratio
	canvas.height = props.height * ratio
	canvas.style.width = `${width}px`
	canvas.style.height = `${props.height}px`
	const ctx = canvas.getContext('2d')
	ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
	ctx.clearRect(0, 0, width, props.height)

	const mid = props.height / 2
	const total = props.duration || 1
	const startX = (props.start / total) * width
	const endX = (props.end / total) * width

	// 背景
	ctx.fillStyle = '#fafafa'
	ctx.fillRect(0, 0, width, props.height)

	// 选中区域高亮
	ctx.fillStyle = 'rgba(22, 119, 255, 0.08)'
	ctx.fillRect(startX, 0, Math.max(0, endX - startX), props.height)

	// 波形
	const peaks = props.peaks
	if (peaks) {
		const buckets = peaks.buckets
		ctx.fillStyle = '#1677ff'
		for (let i = 0; i < buckets; i += 1) {
			const x = (i / buckets) * width
			const w = Math.max(1, width / buckets - 0.5)
			const top = mid - peaks.maxs[i] * mid
			const bottom = mid - peaks.mins[i] * mid
			ctx.fillRect(x, top, w, Math.max(1, bottom - top))
		}
	}

	// 中线
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)'
	ctx.beginPath()
	ctx.moveTo(0, mid)
	ctx.lineTo(width, mid)
	ctx.stroke()

	// 起点/终点标记
	const marker = (x, color) => {
		ctx.fillStyle = color
		ctx.fillRect(x - 1, 0, 2, props.height)
		ctx.beginPath()
		ctx.arc(x, 8, 5, 0, Math.PI * 2)
		ctx.fill()
	}
	marker(startX, '#52c41a')
	marker(endX, '#f5222d')

	// 播放头
	if (props.playhead >= 0) {
		const x = (props.playhead / total) * width
		ctx.strokeStyle = '#faad14'
		ctx.beginPath()
		ctx.moveTo(x, 0)
		ctx.lineTo(x, props.height)
		ctx.stroke()
	}

	// 悬停时间
	if (hover.value != null) {
		const x = (hover.value / total) * width
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'
		ctx.beginPath()
		ctx.moveTo(x, 0)
		ctx.lineTo(x, props.height)
		ctx.stroke()
		ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
		const label = formatTime(hover.value)
		const textWidth = ctx.measureText(label).width + 10
		const boxX = Math.min(width - textWidth, Math.max(0, x - textWidth / 2))
		ctx.fillRect(boxX, props.height - 18, textWidth, 16)
		ctx.fillStyle = '#fff'
		ctx.fillText(label, boxX + 5, props.height - 6)
	}
}

const pointToTime = event => {
	const canvas = canvasRef.value
	const rect = canvas.getBoundingClientRect()
	const ratio = (event.clientX - rect.left) / rect.width
	return Math.max(0, Math.min(1, ratio)) * (props.duration || 0)
}

const onDown = event => {
	if (!props.editable) return
	const time = pointToTime(event)
	const startDistance = Math.abs(time - props.start)
	const endDistance = Math.abs(time - props.end)
	if (startDistance < (props.duration || 1) * 0.02 || startDistance <= endDistance) {
		dragging = 'start'
	} else {
		dragging = 'end'
	}
	applyDrag(time)
	window.addEventListener('mousemove', onMove)
	window.addEventListener('mouseup', onUp)
}

const onMove = event => {
	if (!dragging) return
	applyDrag(pointToTime(event))
}

const applyDrag = time => {
	if (dragging === 'start') emit('update:start', Math.min(time, Math.max(0, props.end - 0.05)))
	else emit('update:end', Math.max(time, Math.min(props.duration, props.start + 0.05)))
}

const onUp = () => {
	dragging = null
	window.removeEventListener('mousemove', onMove)
	window.removeEventListener('mouseup', onUp)
}

const onHover = event => {
	hover.value = pointToTime(event)
	if (event.buttons === 0) draw()
}

watch(
	() => [props.peaks, props.start, props.end, props.playhead, props.duration],
	() => draw()
)

onMounted(() => {
	draw()
	window.addEventListener('resize', draw)
})

onUnmounted(() => {
	window.removeEventListener('resize', draw)
	window.removeEventListener('mousemove', onMove)
	window.removeEventListener('mouseup', onUp)
})
</script>

<style lang="scss" scoped>
.waveform {
	position: relative;
	width: 100%;
	canvas {
		display: block;
		width: 100%;
		border-radius: 6px;
		cursor: ew-resize;
		background: #fafafa;
	}
	.scale {
		display: flex;
		justify-content: space-between;
		margin-top: 4px;
	}
}
</style>
