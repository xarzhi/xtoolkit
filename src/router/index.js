import { createRouter, createWebHistory } from 'vue-router'

const routes = [
	{
		path: '/',
		component: () => import('@/layout/Layout.vue'),
		redirect: '/pictures/imgTransform',
		children: [
			{
				path: 'pictures',
				meta: { title: '图片', icon: 'icon-tupian2' },
				children: [
					{
						path: 'imgTransform',
						component: () => import('@/views/pictures/ImgTransform.vue'),
						meta: { title: '图片转换', icon: 'icon-geshizhuanhuan' },
					},
					{
						path: 'imgCrop',
						component: () => import('@/views/pictures/ImgCrop.vue'),
						meta: { title: '图片裁剪', icon: 'antd:ScissorOutlined' },
					},
					{
						path: 'imgCutout',
						component: () => import('@/views/pictures/ImgCutout.vue'),
						meta: { title: '图片智能抠图', icon: 'icon-koutu' },
					},
					{
						path: 'imgBeautify',
						component: () => import('@/views/pictures/ImgBeautify.vue'),
						meta: { title: '图片美化', icon: 'antd:BgColorsOutlined' },
					},
					{
						path: 'imgCompress',
						component: () => import('@/views/pictures/ImgCompress.vue'),
						meta: { title: '图片压缩', icon: 'icon-gongjuxiang-tupianyasuo' },
					},
					{
						path: 'imgUpscale',
						component: () => import('@/views/pictures/ImgUpscale.vue'),
						meta: { title: '图片无损放大', icon: 'antd:ZoomInOutlined' },
					},
					{
						path: 'gifCompress',
						component: () => import('@/views/pictures/GifCompress.vue'),
						meta: { title: 'GIF压缩', icon: 'antd:FileGifOutlined' },
					},
					{
						path: 'nineGrid',
						component: () => import('@/views/pictures/NineGrid.vue'),
						meta: { title: '图片切割', icon: 'icon-jiugongge' },
					},
					{
						path: 'imgBase64',
						component: () => import('@/views/pictures/ImgBase64.vue'),
						meta: { title: 'Base64', icon: 'icon-Base64bianjiema' },
					},
					{
						path: 'iconExtraction',
						component: () => import('@/views/pictures/IconExtraction.vue'),
						meta: { title: '图标提取', icon: 'icon-tiqu1' },
					},
				],
			},
			{
				path: 'video',
				meta: { title: '视频', icon: 'antd:VideoCameraOutlined' },
				children: [
					{
						path: 'videoCrop',
						component: () => import('@/views/video/VideoCrop.vue'),
						meta: { title: '视频裁剪', icon: 'icon-shipincaijian' },
					},
					{
						path: 'videoTrim',
						component: () => import('@/views/video/VideoTrim.vue'),
						meta: { title: '视频截取', icon: 'antd:ScissorOutlined' },
					},
					{
						path: 'videoConvert',
						component: () => import('@/views/video/VideoConvert.vue'),
						meta: { title: '视频格式转换', icon: 'icon-zhuanhuan1' },
					},
					{
						path: 'videoToGif',
						component: () => import('@/views/video/VideoToGif.vue'),
						meta: { title: '视频转GIF', icon: 'icon-GIF' },
					},
				],
			},
			{
				path: 'audio',
				meta: { title: '音频', icon: 'antd:AudioOutlined' },
				children: [
					{
						path: 'audioConvert',
						component: () => import('@/views/audio/AudioConvert.vue'),
						meta: { title: '音频格式转换', icon: 'icon-zhuanhuan3' },
					},
					{
						path: 'audioTrim',
						component: () => import('@/views/audio/AudioTrim.vue'),
						meta: { title: '音频截取', icon: 'antd:ScissorOutlined' },
					},
				],
			},
			{
				path: 'dev',
				meta: { title: '开发', icon: 'antd:CodeOutlined' },
				children: [
					{
						path: 'snippet',
						component: () => import('@/views/dev/SnippetGen.vue'),
						meta: { title: 'VS Code 代码片段', icon: 'antd:SnippetsOutlined' },
					},
					{
						path: 'markdown',
						component: () => import('@/views/dev/MarkdownConvert.vue'),
						meta: { title: 'Markdown 与 HTML 互转', icon: 'antd:FileMarkdownOutlined' },
					},
				],
			},
			{
				path: 'design',
				meta: { title: '设计', icon: 'antd:FormatPainterOutlined' },
				children: [
					{
						path: 'gltf',
						component: () => import('@/views/design/GltfViewer.vue'),
						meta: { title: 'GLTF 模型查看', icon: 'antd:CodeSandboxOutlined' },
					},
					{
						path: 'color',
						component: () => import('@/views/design/ColorConvert.vue'),
						meta: { title: '颜色格式互转', icon: 'antd:BgColorsOutlined' },
					},
				],
			},
			{
				path: 'json',
				meta: { title: 'JSON', icon: 'icon-json' },
				children: [
					{
						path: 'jsonFormat',
						component: () => import('@/views/json/jsonFormat.vue'),
						meta: { title: 'json格式化', icon: 'icon-jsongeshihua' },
					},
				],
			},
			{
				// 一级菜单：白板（Excelidraw 画板，React 组件，见 views/whiteboard）
				path: 'whiteboard',
				component: () => import('@/views/whiteboard/Whiteboard.vue'),
				meta: { title: '白板', icon: 'img:excalidraw' },
			},
		],
	},
]

const router = createRouter({
	history: createWebHistory(),
	routes,
})

export default router
export { routes }
