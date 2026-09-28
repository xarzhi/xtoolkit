<template>
	<div class="tool colorConvert">
		<h1 class="tool-title">
			颜色格式互转
			<span class="tip">HEX / RGB(A) / HSL(A) / HSV / CMYK / HWB 任意一行改动，其它格式实时同步</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<div class="tool-card block">
					<div class="block-title">取色 / 输入</div>
					<div class="picker-row">
						<input class="native-picker" type="color" :value="fields.hex" @input="onNativePick" />
						<div class="swatch" :style="{ background: previewColor, color: contrastTextValue }">
							{{ fields.hex }}
						</div>
					</div>
					<a-input
						v-model:value="anyInput"
						addon-before="任意格式"
						placeholder="例如 #1677ff、rgb(22,119,255)、cmyk(91%,53%,0%,0%)、hwb(212,9%,0%)"
						@press-enter="applyAny"
					/>
					<a-space :size="8" style="margin-top: 10px" wrap>
						<a-button size="small" type="primary" @click="applyAny">解析</a-button>
						<a-button size="small" @click="randomColor">随机</a-button>
						<a-button size="small" @click="copyAll">复制全部</a-button>
					</a-space>
					<div class="alpha-row">
						<span class="hint">透明度</span>
						<a-slider v-model:value="alphaPercent" :min="0" :max="100" :step="1" style="flex: 1" />
						<span class="hint">{{ alphaPercent }}%</span>
					</div>
				</div>

				<div class="tool-card block">
					<div class="block-title">各格式（可直接修改）</div>
					<div class="fields">
						<div class="field-row" v-for="item in fieldDefs" :key="item.key">
							<span class="name">{{ item.label }}</span>
							<a-input
								v-model:value="fields[item.key]"
								size="small"
								:placeholder="item.placeholder"
								@press-enter="applyField(item.key)"
								@blur="applyField(item.key)"
							/>
							<a-button type="text" size="small" @click="copyOne(item.key)">复制</a-button>
						</div>
					</div>
				</div>

				<div class="tool-card block">
					<div class="block-title">推荐配色</div>
					<div class="chips">
						<button
							v-for="(item, index) in palette"
							:key="index"
							class="chip"
							:style="{ background: item.hex, color: contrastOf(item) }"
							:title="`${item.label} ${item.hex}`"
							@click="applyRgb(item)"
						>
							{{ item.hex }}
						</button>
					</div>
					<div class="block-title" style="margin-top: 14px">最近使用</div>
					<div class="chips">
						<button
							v-for="(hex, index) in history"
							:key="index"
							class="chip"
							:style="{ background: hex, color: contrastOf(hexToRgb(hex)) }"
							@click="applyHex(hex)"
						>
							{{ hex }}
						</button>
						<span v-if="!history.length" class="hint">还没有记录</span>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">支持 3/4/6/8 位 HEX、rgb()、rgba()、hsl()、hsv()/hsb()、cmyk()、hwb()</span>
			<a-space>
				<a-button @click="reset">重置</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { buildPalette, contrastText, formatColor, hexToRgb, parseColor } from '@/utils/color'
import { copyText } from '@/utils/tauriIO'

const color = reactive({ r: 22, g: 119, b: 255, a: 1 })
const fields = reactive({ hex: '', hexAlpha: '', rgb: '', rgba: '', hsl: '', hsla: '', hsv: '', cmyk: '', hwb: '' })
const anyInput = ref('')
const history = ref([])

const fieldDefs = [
	{ key: 'hex', label: 'HEX', placeholder: '#1677ff' },
	{ key: 'hexAlpha', label: 'HEX + A', placeholder: '#1677ffff' },
	{ key: 'rgb', label: 'RGB', placeholder: 'rgb(22, 119, 255)' },
	{ key: 'rgba', label: 'RGBA', placeholder: 'rgba(22, 119, 255, 1)' },
	{ key: 'hsl', label: 'HSL', placeholder: 'hsl(216, 100%, 54.3%)' },
	{ key: 'hsla', label: 'HSLA', placeholder: 'hsla(216, 100%, 54.3%, 1)' },
	{ key: 'hsv', label: 'HSV / HSB', placeholder: 'hsv(216, 91.4%, 100%)' },
	{ key: 'cmyk', label: 'CMYK', placeholder: 'cmyk(91.4%, 53.3%, 0%, 0%)' },
	{ key: 'hwb', label: 'HWB', placeholder: 'hwb(216, 8.6%, 0%)' },
]

const alphaPercent = ref(100)

const syncFields = () => {
	const formatted = formatColor({ ...color })
	delete formatted.parts
	Object.assign(fields, formatted)
}
watch(color, syncFields, { deep: true, immediate: true })
watch(alphaPercent, value => {
	color.a = Math.round(value) / 100
})

const previewColor = computed(() => `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`)
const contrastTextValue = computed(() => contrastText(color))
const palette = computed(() => buildPalette(color))
const contrastOf = item => (item ? contrastText(item) : '#000')

const pushHistory = () => {
	const hex = formatColor({ ...color }).hex
	history.value = [hex, ...history.value.filter(item => item !== hex)].slice(0, 12)
}

const applyRgb = rgb => {
	Object.assign(color, { r: rgb.r, g: rgb.g, b: rgb.b, a: color.a })
	pushHistory()
}

const applyHex = hex => {
	const rgb = hexToRgb(hex)
	if (!rgb) return
	Object.assign(color, { r: rgb.r, g: rgb.g, b: rgb.b })
	pushHistory()
}

const onNativePick = event => {
	const rgb = hexToRgb(event.target.value)
	if (rgb) applyRgb(rgb)
}

const applyAny = () => {
	const parsed = parseColor(anyInput.value)
	if (!parsed) {
		message.warning('无法识别，支持 HEX / rgb() / hsl() / hsv() / cmyk() / hwb()')
		return
	}
	Object.assign(color, parsed)
	alphaPercent.value = Math.round((parsed.a ?? 1) * 100)
	pushHistory()
}

const applyField = key => {
	const raw = String(fields[key] ?? '').trim()
	if (!raw) return
	const parsed = parseColor(raw)
	if (!parsed) {
		message.warning(`无法识别「${raw}」`)
		syncFields()
		return
	}
	// 6 位 HEX 不带透明度信息，保留当前透明度
	if (key === 'hex' && raw.replace(/^#/, '').length <= 6) parsed.a = color.a
	Object.assign(color, parsed)
	if (key !== 'hex') alphaPercent.value = Math.round((parsed.a ?? 1) * 100)
	pushHistory()
}

const copyOne = async key => {
	const ok = await copyText(fields[key])
	message[ok ? 'success' : 'error'](ok ? `已复制 ${fields[key]}` : '复制失败')
}

const copyAll = async () => {
	const lines = fieldDefs.map(item => `${item.label}: ${fields[item.key]}`)
	const ok = await copyText(lines.join('\n'))
	message[ok ? 'success' : 'error'](ok ? '已复制全部格式' : '复制失败')
}

const randomColor = () => {
	applyRgb({
		r: Math.floor(Math.random() * 256),
		g: Math.floor(Math.random() * 256),
		b: Math.floor(Math.random() * 256),
	})
}

const reset = () => {
	Object.assign(color, { r: 22, g: 119, b: 255, a: 1 })
	alphaPercent.value = 100
	anyInput.value = ''
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.colorConvert {
	.layout {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.block {
		min-width: 320px;
		flex: 1;
		.block-title {
			font-weight: 600;
			color: #262626;
			margin-bottom: 10px;
		}
	}
	.picker-row {
		display: flex;
		gap: 12px;
		align-items: center;
		margin-bottom: 10px;
		.native-picker {
			width: 56px;
			height: 40px;
			padding: 0;
			border: 1px solid #d9d9d9;
			border-radius: 8px;
			background: none;
			cursor: pointer;
		}
		.swatch {
			flex: 1;
			height: 40px;
			border-radius: 8px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-family: Consolas, Monaco, monospace;
			font-size: 13px;
			border: 1px solid rgba(0, 0, 0, 0.08);
		}
	}
	.alpha-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 10px;
	}
	.fields {
		display: flex;
		flex-flow: column;
		gap: 8px;
		.field-row {
			display: flex;
			align-items: center;
			gap: 8px;
			.name {
				width: 74px;
				font-size: 13px;
				color: rgba(0, 0, 0, 0.65);
			}
		}
	}
	.chips {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		.chip {
			min-width: 84px;
			height: 34px;
			padding: 0 10px;
			border-radius: 8px;
			border: 1px solid rgba(0, 0, 0, 0.08);
			font-family: Consolas, Monaco, monospace;
			font-size: 12px;
			cursor: pointer;
		}
	}
}
</style>
