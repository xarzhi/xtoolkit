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
						path: 'imgWatermark',
						component: () => import('@/views/pictures/ImgWatermark.vue'),
						meta: { title: '图片加水印', icon: 'antd:HighlightOutlined' },
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
						path: 'videoCompress',
						component: () => import('@/views/video/VideoCompress.vue'),
						meta: { title: '视频压缩', icon: 'antd:CompressOutlined' },
					},
					{
						path: 'videoFrame',
						component: () => import('@/views/video/VideoFrame.vue'),
						meta: { title: '视频截图', icon: 'antd:CameraOutlined' },
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
					{
						path: 'regex',
						component: () => import('@/views/dev/RegexTester.vue'),
						meta: { title: '正则表达式验证', icon: 'antd:ExperimentOutlined' },
					},
					{
						path: 'md5',
						component: () => import('@/views/dev/Md5Tool.vue'),
						meta: { title: 'MD5 摘要与校验', icon: 'antd:SafetyCertificateOutlined' },
					},
					{
						path: 'morse',
						component: () => import('@/views/dev/MorseCode.vue'),
						meta: { title: '摩斯密码', icon: 'antd:SoundOutlined' },
					},
					{
						path: 'unicode',
						component: () => import('@/views/dev/UnicodeCodec.vue'),
						meta: { title: 'Unicode 编解码', icon: 'antd:FontSizeOutlined' },
					},
				],
			},
			{
				path: 'design',
				meta: { title: '设计', icon: 'antd:FormatPainterOutlined' },
				children: [
					{
						path: 'color',
						component: () => import('@/views/design/ColorConvert.vue'),
						meta: { title: '颜色格式互转', icon: 'antd:BgColorsOutlined' },
					},
					{
						path: 'boxShadow',
						component: () => import('@/views/design/BoxShadow.vue'),
						meta: { title: '盒子阴影', icon: 'antd:PartitionOutlined' },
					},
					{
						path: 'diagram',
						component: () => import('@/views/design/DiagramEditor.vue'),
						meta: { title: '流程图绘制', icon: 'antd:ApartmentOutlined' },
					},
					{
						path: 'mindmap',
						component: () => import('@/views/design/MindMap.vue'),
						meta: { title: '思维导图', icon: 'antd:BranchesOutlined' },
					},
					{
						path: 'bezier',
						component: () => import('@/views/design/BezierCurve.vue'),
						meta: { title: '贝塞尔曲线', icon: 'antd:FunctionOutlined' },
					},
				],
			},
			{
				path: 'three',
				meta: { title: '3D', icon: 'antd:BlockOutlined' },
				children: [
					{
						path: 'modelViewer',
						component: () => import('@/views/three/ModelViewer.vue'),
						meta: { title: '3D 模型查看', icon: 'antd:CodeSandboxOutlined' },
					},
					{
						path: 'modelConvert',
						component: () => import('@/views/three/ModelConvert.vue'),
						meta: { title: '3D 格式转换', icon: 'antd:SwapOutlined' },
					},
				],
			},
			{
				path: 'math',
				meta: { title: '数学', icon: 'antd:CalculatorOutlined' },
				children: [
					{
						path: 'baseConvert',
						component: () => import('@/views/math/BaseConvert.vue'),
						meta: { title: '进制转换', icon: 'antd:SwapOutlined' },
					},
					{
						path: 'bmi',
						component: () => import('@/views/math/BmiCalculator.vue'),
						meta: { title: 'BMI 计算', icon: 'antd:DashboardOutlined' },
					},
				],
			},
			{
				path: 'life',
				meta: { title: '生活', icon: 'antd:CoffeeOutlined' },
				children: [
					{
						path: 'pomodoro',
						component: () => import('@/views/life/Pomodoro.vue'),
						meta: { title: '番茄时钟', icon: 'antd:ClockCircleOutlined' },
					},
					{
						path: 'mortgage',
						component: () => import('@/views/life/MortgageCalculator.vue'),
						meta: { title: '房贷计算器', icon: 'antd:HomeOutlined' },
					},
					{
						path: 'wechat',
						component: () => import('@/views/life/WechatChatGen.vue'),
						meta: { title: '微信对话生成器', icon: 'antd:WechatOutlined' },
					},
					{
						path: 'idPhoto',
						component: () => import('@/views/life/IdPhoto.vue'),
						meta: { title: '证件照换底色', icon: 'antd:IdcardOutlined' },
					},
				],
			},
			{
				path: 'game',
				meta: { title: '游戏', icon: 'antd:PlayCircleOutlined' },
				children: [
					{
						path: 'snake',
						component: () => import('@/views/game/Snake.vue'),
						meta: { title: '贪吃蛇', icon: 'antd:ThunderboltOutlined' },
					},
					{
						path: 'maze',
						component: () => import('@/views/game/Maze.vue'),
						meta: { title: '走迷宫', icon: 'antd:CompassOutlined' },
					},
					{
						path: 'sudoku',
						component: () => import('@/views/game/Sudoku.vue'),
						meta: { title: '数独', icon: 'antd:TableOutlined' },
					},
					{
						path: 'minesweeper',
						component: () => import('@/views/game/Minesweeper.vue'),
						meta: { title: '扫雷', icon: 'antd:AimOutlined' },
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
