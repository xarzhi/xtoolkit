<template>
	<div class="tool baseConvert">
		<h1 class="tool-title">
			进制转换
			<span class="tip">二进制 / 八进制 / 十进制 / 十六进制 实时互转，任意一栏输入即可同步</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<div class="tool-card block">
					<div class="block-title">输入数值</div>
					<a-input
						v-model:value="input"
						class="main-input"
						placeholder="在这里输入任意进制数值，例如 255、0xFF、1010 等"
						size="large"
						@press-enter="apply"
					/>
					<a-select v-model:value="inputBase" style="width: 100%; margin-top: 10px" :options="baseOptions" />
					<a-space :size="8" style="margin-top: 10px" wrap>
						<a-button type="primary" @click="apply">转换</a-button>
						<a-button @click="clear">清空</a-button>
						<a-button @click="swap">交换（十进制 ⇄ 十六进制）</a-button>
					</a-space>
					<div class="hint" style="margin-top: 12px">
						说明：选择输入数值的进制后点击转换；也可以在下方任意一栏直接编辑，其它进制会实时同步。
					</div>
				</div>

				<div class="tool-card block">
					<div class="block-title">转换结果</div>
					<div class="fields">
						<div class="field-row" v-for="item in fieldDefs" :key="item.base">
							<span class="name">{{ item.label }}</span>
							<a-input
								v-model:value="values[item.base]"
								size="large"
								:addon-before="item.base"
								:placeholder="item.placeholder"
								@input="onFieldInput(item.base)"
								@blur="onFieldBlur(item.base)"
							/>
							<a-button type="text" size="small" @click="copyOne(item.base)">复制</a-button>
						</div>
					</div>
				</div>

				<div class="tool-card block">
					<div class="block-title">位运算结果</div>
					<div class="fields" v-if="hasValue">
						<div class="bit-row">
							<span class="name">按位取反 ~</span>
							<span class="val mono">{{ bitwise.not }}</span>
						</div>
						<div class="bit-row">
							<span class="name">左移 &lt;&lt; 1</span>
							<span class="val mono">{{ bitwise.shl1 }}</span>
						</div>
						<div class="bit-row">
							<span class="name">右移 &gt;&gt; 1</span>
							<span class="val mono">{{ bitwise.shr1 }}</span>
						</div>
						<div class="bit-row">
							<span class="name">补码（32 位）</span>
							<span class="val mono">{{ bitwise.twos }}</span>
						</div>
					</div>
					<div class="hint" v-else>输入数值后显示位运算结果（32 位有符号整数）</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">支持 2 / 8 / 10 / 16 进制，十六进制可带 0x 前缀，二进制可带 0b 前缀</span>
			<a-space>
				<a-button @click="clear">重置</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { copyText } from '@/utils/tauriIO'

const baseOptions = [
	{ label: '二进制（Base 2）', value: 2 },
	{ label: '八进制（Base 8）', value: 8 },
	{ label: '十进制（Base 10）', value: 10 },
	{ label: '十六进制（Base 16）', value: 16 },
]

const fieldDefs = [
	{ base: 2, label: '二进制', placeholder: '11111111' },
	{ base: 8, label: '八进制', placeholder: '377' },
	{ base: 10, label: '十进制', placeholder: '255' },
	{ base: 16, label: '十六进制', placeholder: 'FF' },
]

const input = ref('')
const inputBase = ref(10)
const values = reactive({ 2: '', 8: '', 10: '', 16: '' })
const lastEdited = ref(null) // 记录最近手动编辑的进制，避免循环覆盖

const hasValue = computed(() => values[10] !== '')

/** 把任意进制字符串解析成整数（去掉可选前缀） */
function parseInBase(str, base) {
	let s = String(str ?? '').trim()
	if (!s) return null
	if (base === 16) s = s.replace(/^0x/i, '')
	if (base === 2) s = s.replace(/^0b/i, '')
	if (base === 8) s = s.replace(/^0o/i, '')
	// 校验字符是否合法
	const regex = base === 2 ? /^[01]+$/ : base === 8 ? /^[0-7]+$/ : base === 10 ? /^-?\d+$/ : /^[0-9a-f]+$/i
	if (!regex.test(s)) return null
	// 负数（仅十进制）或超大数值
	if (base === 10 && s.startsWith('-')) return BigInt(s)
	return BigInt(parseInt(s, base))
}

/** 把整数格式化为指定进制字符串（支持 BigInt，负数用补码表示） */
function formatInBase(big, base) {
	let n = big
	let negative = n < 0n
	if (negative) n = -n
	let digits
	if (base === 2) {
		digits = n.toString(2)
	} else if (base === 8) {
		digits = n.toString(8)
	} else if (base === 16) {
		digits = n.toString(16).toUpperCase()
	} else {
		return (negative ? '-' : '') + n.toString()
	}
	if (negative) digits = '-' + digits
	return digits
}

/** 从某个进制更新所有字段 */
function updateFrom(base, raw) {
	const big = parseInBase(raw, base)
	if (big === null) return false
	values[2] = formatInBase(big, 2)
	values[8] = formatInBase(big, 8)
	values[10] = formatInBase(big, 10)
	values[16] = formatInBase(big, 16)
	return true
}

const apply = () => {
	if (!input.value.trim()) return
	if (!updateFrom(inputBase.value, input.value)) {
		message.warning(`「${input.value}」不是合法的 ${inputBase.value} 进制数值`)
		return
	}
}

const onFieldInput = base => {
	// 标记当前编辑的字段，实时同步其它字段
	lastEdited.value = base
	updateFrom(base, values[base])
}

const onFieldBlur = base => {
	// 失焦时校验并刷新（保证非法输入被纠正）
	const ok = updateFrom(base, values[base])
	if (!ok && values[base]) {
		message.warning(`「${values[base]}」不是合法的 ${base} 进制数值`)
	}
	lastEdited.value = null
}

const copyOne = async base => {
	if (!values[base]) return
	const ok = await copyText(values[base])
	message[ok ? 'success' : 'error'](ok ? `已复制 ${values[base]}` : '复制失败')
}

const clear = () => {
	input.value = ''
	Object.assign(values, { 2: '', 8: '', 10: '', 16: '' })
}

const swap = () => {
	// 把十进制与十六进制互换显示（方便快速对照）
	const tmp = values[10]
	values[10] = values[16]
	values[16] = tmp
}

const bitwise = computed(() => {
	if (!hasValue.value) return { not: '-', shl1: '-', shr1: '-', twos: '-' }
	const n = Number(values[10])
	if (!Number.isFinite(n)) return { not: '-', shl1: '-', shr1: '-', twos: '-' }
	const not = ~n
	const shl1 = n << 1
	const shr1 = n >> 1
	const twos = n < 0 ? (~(-n) + 1) >>> 0 : n >>> 0
	return {
		not: String(not) + ` (0x${(not >>> 0).toString(16).toUpperCase()})`,
		shl1: String(shl1),
		shr1: String(shr1),
		twos: `0x${twos.toString(16).toUpperCase()} (${twos})`,
	}
})

// 输入框内容变化时自动转换
watch(input, value => {
	if (!value.trim()) return
	apply()
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.baseConvert {
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
			color: var(--text-color);
			margin-bottom: 10px;
		}
	}
	.main-input {
		font-family: Consolas, Monaco, monospace;
	}
	.fields {
		display: flex;
		flex-flow: column;
		gap: 10px;
		.field-row {
			display: flex;
			align-items: center;
			gap: 8px;
			.name {
				width: 70px;
				font-size: 13px;
				color: var(--text-color-3);
			}
			:deep(.ant-input) {
				font-family: Consolas, Monaco, monospace;
			}
		}
		.bit-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 6px 0;
			border-bottom: 1px dashed var(--border-color);
			&:last-child {
				border-bottom: none;
			}
			.name {
				font-size: 13px;
				color: var(--text-color-3);
			}
			.val {
				font-size: 14px;
				color: var(--text-color);
			}
		}
	}
	.mono {
		font-family: Consolas, Monaco, monospace;
	}
}
</style>
