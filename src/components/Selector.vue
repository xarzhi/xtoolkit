<template>
	<div class="selector">
		<div class="dropzone" ref="dropzone" @click="handleOpen">
			<component :is="props.icon || FileImageOutlined" class="dz-icon" />
			<div class="title" v-if="props.title">{{ props.title }}</div>
			<div class="desc" v-if="props.desc">{{ props.desc }}</div>
		</div>
		<input
			v-if="!isTauri()"
			ref="fileInput"
			type="file"
			:multiple="props.multiple"
			:accept="acceptAttr"
			style="display: none"
			@change="handleBrowserPick"
		/>
	</div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { FileImageOutlined } from '@ant-design/icons-vue'
import { isTauri, openFiles } from '@/utils/tauriIO'

const props = defineProps({
	title: {
		type: String,
		default: '',
	},
	desc: {
		type: String,
		default: '',
	},
	/** 是否允许多选 */
	multiple: {
		type: Boolean,
		default: true,
	},
	/** Tauri 文件对话框过滤器，例如 [{ name: '图片', extensions: ['png'] }] */
	filters: {
		type: Array,
		default: null,
	},
	/** 浏览器兜底用的 accept 属性，留空则由 filters 推导 */
	accept: {
		type: String,
		default: '',
	},
	/** 自定义图标组件 */
	icon: {
		type: [Object, Function],
		default: null,
	},
})
const emit = defineEmits(['drop', 'selected'])
const unlisten = ref(null)
const dropzone = ref(null)
const fileInput = ref(null)

const acceptAttr = computed(() => {
	if (props.accept) return props.accept
	if (!props.filters?.length) return ''
	return props.filters
		.flatMap(f => f.extensions || [])
		.map(ext => `.${ext}`)
		.join(',')
})

onMounted(async () => {
	if (!isTauri()) return
	const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
	unlisten.value = await getCurrentWebviewWindow().onDragDropEvent(async event => {
		const { type, paths, position } = event.payload
		const el = dropzone.value
		// keep-alive 缓存的页面 DOM 已脱离文档，不对其响应拖拽
		if (!el || !el.isConnected) return

		if (type === 'over') {
			const rect = el.getBoundingClientRect()
			el.classList.toggle('active', isInside(position, rect))
		}

		if (type === 'drop') {
			const rect = el.getBoundingClientRect()
			const inside = isInside(position, rect)
			el.classList.remove('active')
			if (inside && paths?.length) {
				emit('drop', props.multiple ? paths : paths.slice(0, 1))
			}
		}

		if (type === 'leave' || type === 'cancel') {
			el.classList.remove('active')
		}
	})
})

onUnmounted(() => {
	if (typeof unlisten.value === 'function') unlisten.value()
})

const handleOpen = async () => {
	if (!isTauri()) {
		fileInput.value?.click()
		return
	}
	try {
		const files = await openFiles({
			multiple: props.multiple,
			title: props.title || '请选择文件',
			filters: props.filters || undefined,
		})
		if (files?.length) emit('selected', files)
	} catch (err) {
		console.error(err)
	}
}

const handleBrowserPick = event => {
	const files = Array.from(event.target.files || [])
	event.target.value = ''
	if (files.length) emit('selected', files)
}

const isInside = (point, rect) => {
	return point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height
}
</script>

<style lang="scss" scoped>
.dropzone {
	box-sizing: border-box;
	width: 100%;
	padding: 36px 24px;
	border-radius: 14px;
	border: 2.5px dashed #b0b8c1;
	background: #f7f8fa;
	color: #333;
	cursor: pointer;
	user-select: none;
	transition:
		border-color 0.25s ease,
		background 0.25s ease,
		transform 0.15s ease;

	display: flex;
	flex-flow: column;
	justify-content: center;
	align-items: center;
	.dz-icon {
		font-size: 22px;
		color: #1677ff;
	}
	&.active {
		background-color: rgba($color: #1677ff, $alpha: 0.12);
		border-color: #1677ff;
	}
	.title {
		margin-top: 14px;
	}
	.desc {
		margin-top: 10px;
		font-size: 14px;
		color: rgba(0, 0, 0, 0.45);
	}
}
</style>
