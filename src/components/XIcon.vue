<template>
	<img
		v-if="imageIcon"
		:src="imageIcon"
		class="icon-image"
		alt=""
		:style="{
			width: props.fontSize,
			height: props.fontSize,
		}"
	/>
	<i
		v-else-if="props.icon && !antIcon"
		:class="`iconfont ${props.icon} ${props.active ? 'active' : ''}`"
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
	AimOutlined,
	ApartmentOutlined,
	AppstoreOutlined,
	AudioOutlined,
	BgColorsOutlined,
	BlockOutlined,
	BorderOutlined,
	BranchesOutlined,
	CalculatorOutlined,
	CameraOutlined,
	ClockCircleOutlined,
	CodeOutlined,
	CodeSandboxOutlined,
	CoffeeOutlined,
	CompassOutlined,
	CompressOutlined,
	DashboardOutlined,
	ExperimentOutlined,
	FileGifOutlined,
	FileImageOutlined,
	FileMarkdownOutlined,
	FontSizeOutlined,
	FormatPainterOutlined,
	FunctionOutlined,
	GifOutlined,
	HighlightOutlined,
	HomeOutlined,
	IdcardOutlined,
	PartitionOutlined,
	PictureOutlined,
	PlayCircleOutlined,
	RetweetOutlined,
	SafetyCertificateOutlined,
	ScissorOutlined,
	SnippetsOutlined,
	SoundOutlined,
	SwapOutlined,
	TableOutlined,
	ThunderboltOutlined,
	VideoCameraOutlined,
	WechatOutlined,
	ZoomInOutlined,
} from '@ant-design/icons-vue'

/** icon 传 `antd:组件名` 时使用 ant-design 图标，否则按 iconfont 类名渲染 */
const ANT_ICONS = {
	AimOutlined,
	ApartmentOutlined,
	AppstoreOutlined,
	AudioOutlined,
	BgColorsOutlined,
	BlockOutlined,
	BorderOutlined,
	BranchesOutlined,
	CalculatorOutlined,
	CameraOutlined,
	ClockCircleOutlined,
	CodeOutlined,
	CodeSandboxOutlined,
	CoffeeOutlined,
	CompassOutlined,
	CompressOutlined,
	DashboardOutlined,
	ExperimentOutlined,
	FileGifOutlined,
	FileImageOutlined,
	FileMarkdownOutlined,
	FontSizeOutlined,
	FormatPainterOutlined,
	FunctionOutlined,
	GifOutlined,
	HighlightOutlined,
	IdcardOutlined,
	HomeOutlined,
	PartitionOutlined,
	PictureOutlined,
	PlayCircleOutlined,
	RetweetOutlined,
	SafetyCertificateOutlined,
	ScissorOutlined,
	SnippetsOutlined,
	SoundOutlined,
	SwapOutlined,
	TableOutlined,
	ThunderboltOutlined,
	VideoCameraOutlined,
	WechatOutlined,
	ZoomInOutlined,
}

const props = defineProps({
	icon: {
		type: String,
		retuired: true,
	},
	color: {
		type: String,
		// currentColor：跟随 antd 菜单文字颜色，明暗主题都不用单独适配
		default: 'currentColor',
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

/**
 * 图片图标：icon 传 `img:文件名`（不带扩展名），从 src/assets/images 里找同名图片。
 * 例如放了 excalidraw.png 就用 `img:excalidraw`。
 */
const IMAGE_ICONS = import.meta.glob('../assets/images/*.{png,svg,jpg,jpeg,webp,gif}', {
	eager: true,
	import: 'default',
})

const imageIcon = computed(() => {
	const name = String(props.icon || '')
	if (!name.startsWith('img:')) return ''
	const wanted = name.slice(4).trim().toLowerCase()
	const key = Object.keys(IMAGE_ICONS).find(path => {
		const file = path.split('/').pop() || ''
		return file.replace(/\.[^.]+$/, '').toLowerCase() === wanted
	})
	return key ? IMAGE_ICONS[key] : ''
})
</script>

<style lang="scss" scoped>
.iconfont {
	font-weight: 500;
}
.icon-image {
	object-fit: contain;
	vertical-align: middle;
}
.active {
	color: #1677ff !important;
}
</style>
