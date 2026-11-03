<template>
	<div class="tool boxShadow">
		<h1 class="tool-title">
			盒子阴影
			<span class="tip">可视化调节阴影的每个参数，实时预览并一键复制 CSS 代码</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<!-- 左侧：预览 -->
				<div class="preview-col">
					<div class="preview-stage" :style="{ background: previewBg }">
						<div class="preview-box" :style="boxStyle">
							<div class="box-label">预览盒子</div>
						</div>
					</div>
					<div class="preview-controls">
						<span class="hint">预览背景</span>
						<input class="native-picker" type="color" :value="previewBg" @input="previewBg = $event.target.value" />
						<a-button size="small" @click="toggleBg">白/灰切换</a-button>
					</div>
				</div>

				<!-- 右侧：参数 + 代码 -->
				<div class="control-col">
					<div class="tool-card block">
						<div class="block-title">
							阴影列表
							<a-button size="small" type="primary" ghost style="margin-left: auto" @click="addLayer">+ 添加阴影</a-button>
						</div>

						<div v-if="!layers.length" class="hint">还没有阴影，点击「添加阴影」开始</div>

						<div v-for="(layer, index) in layers" :key="layer.id" class="layer">
							<div class="layer-head">
								<span class="layer-name">阴影 {{ index + 1 }}</span>
								<a-switch v-model:checked="layer.enabled" size="small" />
								<a-button type="text" size="small" danger :disabled="layers.length <= 1" @click="removeLayer(index)">删除</a-button>
							</div>

							<div class="param">
								<span class="label">类型</span>
								<a-radio-group v-model:value="layer.inset" size="small">
									<a-radio-button :value="false">外阴影</a-radio-button>
									<a-radio-button :value="true">内阴影</a-radio-button>
								</a-radio-group>
							</div>

							<div class="param">
								<span class="label">X 偏移</span>
								<a-slider v-model:value="layer.x" :min="-100" :max="100" :step="1" style="flex: 1" />
								<a-input-number v-model:value="layer.x" :min="-100" :max="100" style="width: 72px" />
								<span class="unit">px</span>
							</div>

							<div class="param">
								<span class="label">Y 偏移</span>
								<a-slider v-model:value="layer.y" :min="-100" :max="100" :step="1" style="flex: 1" />
								<a-input-number v-model:value="layer.y" :min="-100" :max="100" style="width: 72px" />
								<span class="unit">px</span>
							</div>

							<div class="param">
								<span class="label">模糊</span>
								<a-slider v-model:value="layer.blur" :min="0" :max="200" :step="1" style="flex: 1" />
								<a-input-number v-model:value="layer.blur" :min="0" :max="200" style="width: 72px" />
								<span class="unit">px</span>
							</div>

							<div class="param">
								<span class="label">扩散</span>
								<a-slider v-model:value="layer.spread" :min="-100" :max="100" :step="1" style="flex: 1" />
								<a-input-number v-model:value="layer.spread" :min="-100" :max="100" style="width: 72px" />
								<span class="unit">px</span>
							</div>

							<div class="param">
								<span class="label">颜色</span>
								<input class="native-picker" type="color" :value="layer.color" @input="layer.color = $event.target.value" />
								<span class="mono">{{ layer.color }}</span>
								<div class="opacity-param">
									<span class="label">不透明度</span>
									<a-slider v-model:value="layer.opacity" :min="0" :max="100" :step="1" style="flex: 1" />
									<span class="hint">{{ layer.opacity }}%</span>
								</div>
							</div>
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">
							CSS 代码
							<a-button size="small" style="margin-left: auto" @click="copyCss">复制 CSS</a-button>
						</div>
						<pre class="css-code">{{ cssCode }}</pre>
						<div class="hint" style="margin-top: 8px">复制后可直接粘贴到样式表，用于任意元素的 box-shadow</div>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">支持多重阴影（逗号分隔）、内阴影 inset、负偏移与负扩散</span>
			<a-space>
				<a-button @click="reset">重置</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { copyText } from '@/utils/tauriIO'

let uid = 0
const makeLayer = () => ({
	id: ++uid,
	enabled: true,
	inset: false,
	x: 0,
	y: 8,
	blur: 24,
	spread: -4,
	color: '#000000',
	opacity: 20,
})

const layers = reactive([makeLayer()])
const previewBg = ref('#f0f2f5')

const addLayer = () => layers.push(makeLayer())
const removeLayer = index => layers.splice(index, 1)
const toggleBg = () => {
	previewBg.value = previewBg.value === '#f0f2f5' ? '#ffffff' : '#f0f2f5'
}
const reset = () => {
	layers.splice(0, layers.length, makeLayer())
	previewBg.value = '#f0f2f5'
}

/** 把 8 位 hex 颜色 + 不透明度转成 rgba */
const colorWithOpacity = (hex, opacity) => {
	const raw = String(hex || '#000000').replace('#', '')
	let r, g, b
	if (raw.length === 3) {
		r = parseInt(raw[0] + raw[0], 16)
		g = parseInt(raw[1] + raw[1], 16)
		b = parseInt(raw[2] + raw[2], 16)
	} else {
		r = parseInt(raw.slice(0, 2), 16)
		g = parseInt(raw.slice(2, 4), 16)
		b = parseInt(raw.slice(4, 6), 16)
	}
	const a = Math.max(0, Math.min(1, opacity / 100))
	return `rgba(${r}, ${g}, ${b}, ${a})`
}

const cssCode = computed(() => {
	const list = layers
		.filter(l => l.enabled)
		.map(l => {
			const inset = l.inset ? 'inset ' : ''
			const color = colorWithOpacity(l.color, l.opacity)
			return `${inset}${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${color}`
		})
	if (!list.length) return 'box-shadow: none;'
	return `box-shadow: ${list.join(', ')};`
})

const boxStyle = computed(() => ({
	boxShadow: layers.filter(l => l.enabled).length
		? layers
				.filter(l => l.enabled)
				.map(l => `${l.inset ? 'inset ' : ''}${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${colorWithOpacity(l.color, l.opacity)}`)
				.join(', ')
		: 'none',
}))

const copyCss = async () => {
	const ok = await copyText(cssCode.value)
	message[ok ? 'success' : 'error'](ok ? 'CSS 已复制到剪贴板' : '复制失败')
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.boxShadow {
	.layout {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.preview-col {
		flex: 1;
		min-width: 340px;
		display: flex;
		flex-flow: column;
		gap: 12px;
		.preview-stage {
			height: 360px;
			border-radius: 12px;
			border: 1px solid var(--border-color);
			display: flex;
			align-items: center;
			justify-content: center;
			overflow: hidden;
			.preview-box {
				width: 200px;
				height: 160px;
				background: #fff;
				border-radius: 12px;
				display: flex;
				align-items: center;
				justify-content: center;
				transition: box-shadow 0.2s;
				.box-label {
					font-size: 14px;
					color: var(--text-color-3);
				}
			}
		}
		.preview-controls {
			display: flex;
			align-items: center;
			gap: 10px;
			.native-picker {
				width: 44px;
				height: 30px;
				padding: 0;
				border: 1px solid var(--panel-border);
				border-radius: 6px;
				background: none;
				cursor: pointer;
			}
		}
	}
	.control-col {
		flex: 1.2;
		min-width: 360px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.block {
		.block-title {
			font-weight: 600;
			color: var(--text-color);
			margin-bottom: 12px;
			display: flex;
			align-items: center;
			gap: 8px;
		}
	}
	.layer {
		padding: 12px;
		border: 1px solid var(--border-color);
		border-radius: 10px;
		margin-bottom: 12px;
		&:last-child {
			margin-bottom: 0;
		}
		.layer-head {
			display: flex;
			align-items: center;
			gap: 10px;
			margin-bottom: 10px;
			.layer-name {
				font-size: 13px;
				font-weight: 600;
				color: var(--text-color);
			}
			.ant-btn {
				margin-left: auto;
			}
		}
		.param {
			display: flex;
			align-items: center;
			gap: 10px;
			margin-bottom: 8px;
			.label {
				width: 56px;
				font-size: 13px;
				color: var(--text-color-3);
				white-space: nowrap;
			}
			.unit {
				width: 20px;
				font-size: 12px;
				color: var(--text-color-2);
			}
			.native-picker {
				width: 40px;
				height: 28px;
				padding: 0;
				border: 1px solid var(--panel-border);
				border-radius: 6px;
				background: none;
				cursor: pointer;
			}
			.mono {
				font-family: Consolas, Monaco, monospace;
				font-size: 13px;
				color: var(--text-color);
			}
			.opacity-param {
				display: flex;
				align-items: center;
				gap: 8px;
				flex: 1;
				margin-left: 8px;
				.label {
					width: auto;
				}
			}
		}
	}
	.css-code {
		background: var(--panel-bg);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 12px;
		font-family: Consolas, Monaco, monospace;
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-color);
		white-space: pre-wrap;
		word-break: break-all;
		margin: 0;
	}
}
</style>
