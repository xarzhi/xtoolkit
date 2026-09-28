<template>
	<i
		:class="`iconfont ${props.icon} ${props.active ? 'active' : ''}`"
		v-if="props.icon && !antIcon"
		:style="{
			color: props.active ? '#1677ff' : props.color,
			fontSize: props.fontSize,
		}"
	></i>
	<component
		v-else-if="antIcon"
		:is="antIcon"
		:style="{
			color: props.active ? '#1677ff' : props.color,
			fontSize: props.fontSize,
		}"
	/>
</template>

<script setup>
import { computed } from 'vue'
import {
	AppstoreOutlined,
	AudioOutlined,
	BgColorsOutlined,
	BorderOutlined,
	CodeOutlined,
	CodeSandboxOutlined,
	CompressOutlined,
	FileGifOutlined,
	FileImageOutlined,
	FileMarkdownOutlined,
	FormatPainterOutlined,
	GifOutlined,
	HighlightOutlined,
	PictureOutlined,
	RetweetOutlined,
	ScissorOutlined,
	SnippetsOutlined,
	SwapOutlined,
	TableOutlined,
	VideoCameraOutlined,
	ZoomInOutlined,
} from '@ant-design/icons-vue'

/** icon 传 `antd:组件名` 时使用 ant-design 图标，否则按 iconfont 类名渲染 */
const ANT_ICONS = {
	AppstoreOutlined,
	AudioOutlined,
	BgColorsOutlined,
	BorderOutlined,
	CodeOutlined,
	CodeSandboxOutlined,
	CompressOutlined,
	FileGifOutlined,
	FileImageOutlined,
	FileMarkdownOutlined,
	FormatPainterOutlined,
	GifOutlined,
	HighlightOutlined,
	PictureOutlined,
	RetweetOutlined,
	ScissorOutlined,
	SnippetsOutlined,
	SwapOutlined,
	TableOutlined,
	VideoCameraOutlined,
	ZoomInOutlined,
}

const props = defineProps({
	icon: {
		type: String,
		retuired: true,
	},
	color: {
		type: String,
		default: '#333',
	},
	fontSize: {
		type: String,
		default: '18px',
	},
	active: {
		type: Boolean,
		default: false,
	},
})

const antIcon = computed(() => {
	const name = String(props.icon || '')
	if (!name.startsWith('antd:')) return null
	return ANT_ICONS[name.slice(5)] || null
})
</script>

<style lang="scss" scoped>
.iconfont {
	font-weight: 500;
}
.active {
	color: #1677ff !important;
}
</style>
