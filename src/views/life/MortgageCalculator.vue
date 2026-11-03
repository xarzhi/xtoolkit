<template>
	<div class="tool mortgage">
		<h1 class="tool-title">
			房贷计算器
			<span class="tip">商业 / 公积金 / 组合贷款，等额本息与等额本金对比，附逐年还款计划</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<div class="main-col">
					<div class="tool-card block">
						<div class="block-title">贷款信息</div>

						<div class="type-row">
							<a-radio-group v-model:value="form.type" button-style="solid">
								<a-radio-button value="commercial">商业贷款</a-radio-button>
								<a-radio-button value="fund">公积金贷款</a-radio-button>
								<a-radio-button value="mixed">组合贷款</a-radio-button>
							</a-radio-group>
						</div>

						<div class="fields">
							<label class="field">
								<span class="k">{{ form.type === 'mixed' ? '商贷金额' : '贷款金额' }}</span>
								<a-input-number v-model:value="form.amount" :min="1" :max="5000" :step="10" addon-after="万元" />
							</label>

							<label class="field" v-if="form.type === 'mixed'">
								<span class="k">公积金金额</span>
								<a-input-number v-model:value="form.fundAmount" :min="0" :max="2000" :step="10" addon-after="万元" />
							</label>

							<label class="field">
								<span class="k">贷款年限</span>
								<a-select v-model:value="form.years" :options="YEAR_OPTIONS" />
							</label>

							<label class="field" v-if="form.type !== 'fund'">
								<span class="k">商贷年利率</span>
								<a-input-number v-model:value="form.rate" :min="0" :max="24" :step="0.05" :precision="3" addon-after="%" />
							</label>

							<label class="field" v-if="form.type !== 'commercial'">
								<span class="k">公积金年利率</span>
								<a-input-number v-model:value="form.fundRate" :min="0" :max="24" :step="0.05" :precision="3" addon-after="%" />
							</label>
						</div>

						<div class="rate-tips">
							<span class="hint">参考：</span>
							<button v-for="item in RATE_PRESETS" :key="item.label" class="rate-btn" @click="applyRate(item)">
								{{ item.label }} {{ item.rate }}%
							</button>
						</div>

						<div class="method-row">
							<span class="k">还款方式</span>
							<a-radio-group v-model:value="form.method" size="small">
								<a-radio value="equalPayment">等额本息</a-radio>
								<a-radio value="equalPrincipal">等额本金</a-radio>
							</a-radio-group>
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">
							还款计划
							<a-space style="margin-left: auto" :size="8">
								<a-radio-group v-model:value="tableMode" size="small" button-style="solid">
									<a-radio-button value="year">按年</a-radio-button>
									<a-radio-button value="month">按月</a-radio-button>
								</a-radio-group>
							</a-space>
						</div>

						<div class="chart">
							<svg :viewBox="`0 0 640 190`" preserveAspectRatio="none" class="chart-svg">
								<line v-for="tick in 4" :key="tick" :x1="44" :x2="630" :y1="10 + (tick - 1) * 45" :y2="10 + (tick - 1) * 45" class="grid-line" />
								<g v-for="(item, index) in chartBars" :key="index">
									<rect :x="item.x" :y="item.yPrincipal" :width="item.w" :height="item.hPrincipal" class="bar-principal" rx="1" />
									<rect :x="item.x" :y="item.yInterest" :width="item.w" :height="item.hInterest" class="bar-interest" rx="1" />
								</g>
								<text v-for="item in chartLabels" :key="`l-${item.text}`" :x="item.x" :y="182" class="axis-text" text-anchor="middle">{{ item.text }}</text>
								<text v-for="(item, index) in chartYLabels" :key="`y-${index}`" :x="38" :y="item.y" class="axis-text" text-anchor="end">{{ item.text }}</text>
							</svg>
							<div class="legend">
								<span class="dot principal"></span>本金
								<span class="dot interest"></span>利息
								<span class="hint">（柱高为该年还款额）</span>
							</div>
						</div>

						<div class="table">
							<div class="thead">
								<span class="c-period">{{ tableMode === 'year' ? '年份' : '期数' }}</span>
								<span class="c-num">月供</span>
								<span class="c-num">本金</span>
								<span class="c-num">利息</span>
								<span class="c-num">剩余本金</span>
							</div>
							<div class="tbody">
								<div class="tr" v-for="row in tableRows" :key="row.key">
									<span class="c-period">{{ row.period }}</span>
									<span class="c-num">{{ row.pay }}</span>
									<span class="c-num">{{ row.principal }}</span>
									<span class="c-num">{{ row.interest }}</span>
									<span class="c-num">{{ row.left }}</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div class="side-col">
					<div class="tool-card block result-card">
						<div class="block-title">计算结果</div>
						<div class="big-num">
							<span class="v">{{ formatMoney(summary.firstPay) }}</span>
							<span class="u">元 / 月</span>
						</div>
						<div class="sub" v-if="form.method === 'equalPrincipal'">
							首月月供，之后每月递减约 {{ formatMoney(summary.decrease) }} 元，末月 {{ formatMoney(summary.lastPay) }} 元
						</div>
						<div class="sub" v-else>每月固定还款</div>

						<div class="kv-list">
							<div class="kv">
								<span class="k">贷款总额</span>
								<span class="v">{{ formatMoney(summary.principal) }} 元</span>
							</div>
							<div class="kv">
								<span class="k">支付利息</span>
								<span class="v warn">{{ formatMoney(summary.interest) }} 元</span>
							</div>
							<div class="kv">
								<span class="k">还款总额</span>
								<span class="v">{{ formatMoney(summary.total) }} 元</span>
							</div>
							<div class="kv">
								<span class="k">利息占本金</span>
								<span class="v">{{ summary.interestRatio }}%</span>
							</div>
						</div>

						<div class="ratio-bar">
							<span class="p" :style="{ width: `${summary.principalPercent}%` }"></span>
							<span class="i" :style="{ width: `${100 - summary.principalPercent}%` }"></span>
						</div>
						<div class="legend small">
							<span class="dot principal"></span>本金 {{ summary.principalPercent }}%
							<span class="dot interest"></span>利息 {{ (100 - summary.principalPercent).toFixed(1) }}%
						</div>
					</div>

					<div class="tool-card block" v-if="parts.length > 1">
						<div class="block-title">组合明细</div>
						<div class="part" v-for="part in parts" :key="part.name">
							<div class="part-head">
								<span class="pn">{{ part.name }}</span>
								<span class="pv">{{ formatMoney(part.principal) }} 元 · {{ part.rate }}%</span>
							</div>
							<div class="hint">
								首月 {{ formatMoney(part.firstPay) }} 元，利息合计 {{ formatMoney(part.interest) }} 元
							</div>
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">两种方式对比</div>
						<div class="compare">
							<div class="c-row head">
								<span>方式</span>
								<span>首月</span>
								<span>总利息</span>
							</div>
							<div class="c-row" v-for="item in compareList" :key="item.method">
								<span>{{ item.label }}</span>
								<span>{{ formatMoney(item.firstPay) }}</span>
								<span>{{ formatMoney(item.interest) }}</span>
							</div>
						</div>
						<div class="hint" style="margin-top: 8px">
							等额本金总利息更少，但前期月供压力大；等额本息月供平稳，适合收入稳定的人。
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">说明</div>
						<div class="hint">· 结果按「按月计息、每月还款」的标准公式计算，未考虑银行的手续费、保险、提前还款违约金</div>
						<div class="hint">· 利率是浮动参考值，实际以合同/银行为准，LPR 调整后月供会变</div>
						<div class="hint">· 组合贷款两部分分别计息，这里按相加合并成一条还款计划</div>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">等额本息：月供固定；等额本金：每月本金固定、利息递减</span>
			<a-space>
				<a-button @click="reset">恢复默认</a-button>
				<a-button type="primary" @click="copySummary">复制结果</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { copyText, friendlyError } from '@/utils/tauriIO'

const YEAR_OPTIONS = Array.from({ length: 30 }, (_, index) => ({ label: `${index + 1} 年`, value: index + 1 }))
const RATE_PRESETS = [
	{ label: '商贷', rate: 3.05, field: 'rate' },
	{ label: '商贷', rate: 3.55, field: 'rate' },
	{ label: '公积金', rate: 2.85, field: 'fundRate' },
	{ label: '公积金', rate: 3.1, field: 'fundRate' },
]

const DEFAULTS = { type: 'commercial', amount: 100, fundAmount: 40, years: 30, rate: 3.05, fundRate: 2.85, method: 'equalPayment' }

const form = reactive({ ...DEFAULTS })
const tableMode = ref('year')

const applyRate = item => {
	form[item.field] = item.rate
}

const reset = () => {
	Object.assign(form, DEFAULTS)
}

/* ---------------- 计算 ---------------- */

/** 生成一条还款计划（按月） */
const buildSchedule = (principal, annualRate, months, method) => {
	const rows = []
	if (principal <= 0 || months <= 0) return rows
	const i = annualRate / 100 / 12
	if (method === 'equalPayment') {
		const factor = Math.pow(1 + i, months)
		const pay = i === 0 ? principal / months : (principal * i * factor) / (factor - 1)
		let left = principal
		for (let m = 1; m <= months; m += 1) {
			const interest = left * i
			const principalPart = m === months ? left : Math.min(pay - interest, left)
			left = Math.max(0, left - principalPart)
			rows.push({ month: m, pay: principalPart + interest, principal: principalPart, interest, left })
		}
	} else {
		const perPrincipal = principal / months
		let left = principal
		for (let m = 1; m <= months; m += 1) {
			const interest = left * i
			const principalPart = m === months ? left : perPrincipal
			left = Math.max(0, left - principalPart)
			rows.push({ month: m, pay: principalPart + interest, principal: principalPart, interest, left })
		}
	}
	return rows
}

/** 组合贷款：把几部分按月相加 */
const combineSchedules = list => {
	const longest = Math.max(0, ...list.map(item => item.schedule.length))
	const rows = []
	for (let m = 0; m < longest; m += 1) {
		let pay = 0
		let principal = 0
		let interest = 0
		let left = 0
		for (const item of list) {
			const row = item.schedule[m]
			if (!row) continue
			pay += row.pay
			principal += row.principal
			interest += row.interest
			left += row.left
		}
		rows.push({ month: m + 1, pay, principal, interest, left })
	}
	return rows
}

const months = computed(() => form.years * 12)

const parts = computed(() => {
	const list = []
	if (form.type === 'commercial' || form.type === 'mixed') {
		const principal = Math.max(0, form.amount) * 10000
		list.push({ name: '商业贷款', principal, rate: form.rate })
	}
	if (form.type === 'fund' || form.type === 'mixed') {
		const principal = (form.type === 'fund' ? Math.max(0, form.amount) : Math.max(0, form.fundAmount)) * 10000
		list.push({ name: '公积金贷款', principal, rate: form.fundRate })
	}
	return list.map(item => {
		const schedule = buildSchedule(item.principal, item.rate, months.value, form.method)
		return {
			...item,
			schedule,
			firstPay: schedule[0]?.pay || 0,
			interest: schedule.reduce((sum, row) => sum + row.interest, 0),
		}
	})
})

const schedule = computed(() => combineSchedules(parts.value))

const summary = computed(() => {
	const rows = schedule.value
	const principal = rows.reduce((sum, row) => sum + row.principal, 0)
	const interest = rows.reduce((sum, row) => sum + row.interest, 0)
	const total = principal + interest
	const firstPay = rows[0]?.pay || 0
	const lastPay = rows[rows.length - 1]?.pay || 0
	const decrease = rows.length > 1 ? rows[0].pay - rows[1].pay : 0
	return {
		principal,
		interest,
		total,
		firstPay,
		lastPay,
		decrease,
		interestRatio: principal ? ((interest / principal) * 100).toFixed(1) : '0.0',
		principalPercent: total ? Number(((principal / total) * 100).toFixed(1)) : 0,
	}
})

/** 两种还款方式对比（同样金额与利率） */
const compareList = computed(() =>
	[
		{ method: 'equalPayment', label: '等额本息' },
		{ method: 'equalPrincipal', label: '等额本金' },
	].map(item => {
		const rows = combineSchedules(
			parts.value.map(part => ({
				schedule: buildSchedule(part.principal, part.rate, months.value, item.method),
			}))
		)
		return {
			...item,
			firstPay: rows[0]?.pay || 0,
			interest: rows.reduce((sum, row) => sum + row.interest, 0),
		}
	})
)

/* ---------------- 表格与图表 ---------------- */

const yearlyRows = computed(() => {
	const rows = schedule.value
	const result = []
	for (let index = 0; index < rows.length; index += 12) {
		const slice = rows.slice(index, index + 12)
		result.push({
			year: index / 12 + 1,
			pay: slice.reduce((sum, row) => sum + row.pay, 0),
			principal: slice.reduce((sum, row) => sum + row.principal, 0),
			interest: slice.reduce((sum, row) => sum + row.interest, 0),
			left: slice[slice.length - 1].left,
		})
	}
	return result
})

const tableRows = computed(() => {
	if (tableMode.value === 'month') {
		return schedule.value.map(row => ({
			key: `m-${row.month}`,
			period: `第 ${row.month} 期`,
			pay: formatMoney(row.pay),
			principal: formatMoney(row.principal),
			interest: formatMoney(row.interest),
			left: formatMoney(row.left),
		}))
	}
	return yearlyRows.value.map(row => ({
		key: `y-${row.year}`,
		period: `第 ${row.year} 年`,
		pay: formatMoney(row.pay),
		principal: formatMoney(row.principal),
		interest: formatMoney(row.interest),
		left: formatMoney(row.left),
	}))
})

const yearlyForChart = computed(() => {
	const list = yearlyRows.value
	// 年限太长时按 2 年合并，柱子不至于挤成一条线
	if (list.length <= 20) return list.map(item => ({ ...item, span: 1 }))
	const merged = []
	for (let index = 0; index < list.length; index += 2) {
		const slice = list.slice(index, index + 2)
		merged.push({
			pay: slice.reduce((sum, row) => sum + row.pay, 0),
			principal: slice.reduce((sum, row) => sum + row.principal, 0),
			interest: slice.reduce((sum, row) => sum + row.interest, 0),
			left: slice[slice.length - 1].left,
			span: 2,
			year: slice[0].year,
		})
	}
	return merged
})

const chartBars = computed(() => {
	const list = yearlyForChart.value
	if (!list.length) return []
	const max = Math.max(...list.map(item => item.pay)) || 1
	const plotLeft = 44
	const plotRight = 630
	const plotTop = 10
	const plotBottom = 160
	const plotHeight = plotBottom - plotTop
	const slot = (plotRight - plotLeft) / list.length
	const barWidth = Math.max(2, Math.min(18, slot * 0.62))
	return list.map((item, index) => {
		const x = plotLeft + slot * index + (slot - barWidth) / 2
		const hTotal = (item.pay / max) * plotHeight
		const hPrincipal = (item.principal / max) * plotHeight
		const hInterest = hTotal - hPrincipal
		return {
			x,
			w: barWidth,
			yPrincipal: plotBottom - hPrincipal,
			hPrincipal,
			yInterest: plotBottom - hPrincipal - hInterest,
			hInterest,
		}
	})
})

const chartLabels = computed(() => {
	const list = yearlyForChart.value
	if (!list.length) return []
	const plotLeft = 44
	const plotRight = 630
	const slot = (plotRight - plotLeft) / list.length
	const step = Math.max(1, Math.ceil(list.length / 8))
	const labels = []
	list.forEach((item, index) => {
		if (index % step !== 0 && index !== list.length - 1) return
		labels.push({ x: plotLeft + slot * index + slot / 2, text: `${item.year}年` })
	})
	return labels
})

const chartYLabels = computed(() => {
	const max = Math.max(...yearlyForChart.value.map(item => item.pay), 1)
	return [0, 1, 2, 3].map(index => ({
		y: 160 - (index * 150) / 3 + 4,
		text: formatCompact((max * index) / 3),
	}))
})

/* ---------------- 工具 ---------------- */

function formatMoney(value) {
	const num = Number(value)
	if (!Number.isFinite(num)) return '0.00'
	return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatCompact(value) {
	if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`
	return Math.round(value).toString()
}

const copySummary = async () => {
	const lines = [
		`贷款方式：${form.type === 'commercial' ? '商业贷款' : form.type === 'fund' ? '公积金贷款' : '组合贷款'}`,
		`贷款金额：${formatMoney(summary.value.principal)} 元，期限 ${form.years} 年`,
		`还款方式：${form.method === 'equalPayment' ? '等额本息' : '等额本金'}`,
		`月供：${formatMoney(summary.value.firstPay)} 元${form.method === 'equalPrincipal' ? `（每月递减 ${formatMoney(summary.value.decrease)} 元，末月 ${formatMoney(summary.value.lastPay)} 元）` : ''}`,
		`支付利息：${formatMoney(summary.value.interest)} 元`,
		`还款总额：${formatMoney(summary.value.total)} 元`,
	]
	try {
		await copyText(lines.join('\n'))
		message.success('已复制计算结果')
	} catch (err) {
		message.error(friendlyError(err))
	}
}

if (import.meta.env.DEV) {
	window.__mortgageTest = {
		set: patch => Object.assign(form, patch),
		state: () => ({
			principal: Math.round(summary.value.principal),
			interest: Math.round(summary.value.interest),
			firstPay: Number(summary.value.firstPay.toFixed(2)),
			lastPay: Number(summary.value.lastPay.toFixed(2)),
			months: schedule.value.length,
			years: yearlyRows.value.length,
			compare: compareList.value.map(item => ({ method: item.method, interest: Math.round(item.interest) })),
		}),
	}
}
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.mortgage {
	.layout {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.main-col {
		flex: 1.6;
		min-width: 420px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.side-col {
		flex: 1;
		min-width: 300px;
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
		margin-bottom: 12px;
	}
	.type-row {
		margin-bottom: 14px;
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 12px;
	}
	.field {
		display: flex;
		align-items: center;
		gap: 10px;
		.k {
			flex: none;
			width: 84px;
			font-size: 12px;
			color: var(--text-color-3);
			text-align: right;
		}
		:deep(.ant-input-number) {
			width: 100%;
		}
		:deep(.ant-select) {
			width: 100%;
		}
	}
	.rate-tips {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 12px;
	}
	.rate-btn {
		border: 1px solid var(--border-color);
		background: transparent;
		border-radius: 20px;
		padding: 2px 10px;
		font-size: 12px;
		color: var(--text-color-2);
		cursor: pointer;
		transition: all 0.15s;
		&:hover {
			color: #1677ff;
			border-color: #1677ff;
		}
	}
	.method-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 14px;
		padding-top: 12px;
		border-top: 1px solid var(--border-color);
		.k {
			font-size: 12px;
			color: var(--text-color-3);
		}
	}
	.chart {
		margin-bottom: 12px;
	}
	.chart-svg {
		width: 100%;
		height: 170px;
		overflow: visible;
	}
	.grid-line {
		stroke: var(--border-color);
		stroke-width: 1;
		stroke-dasharray: 3 4;
	}
	.bar-principal {
		fill: #1677ff;
	}
	.bar-interest {
		fill: #faad14;
	}
	.axis-text {
		font-size: 10px;
		fill: var(--text-color-3);
	}
	.legend {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--text-color-2);
		&.small {
			font-size: 11px;
			margin-top: 8px;
		}
		.dot {
			width: 8px;
			height: 8px;
			border-radius: 2px;
			display: inline-block;
			&.principal {
				background: #1677ff;
			}
			&.interest {
				background: #faad14;
			}
		}
	}
	.table {
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid var(--border-color);
	}
	.thead,
	.tr {
		display: grid;
		grid-template-columns: 1fr 1.2fr 1.2fr 1.2fr 1.3fr;
		gap: 8px;
		padding: 7px 12px;
		font-size: 12px;
	}
	.thead {
		font-weight: 600;
		color: var(--text-color-2);
		background: rgba(127, 127, 127, 0.08);
	}
	.tbody {
		max-height: 260px;
		overflow: auto;
	}
	.tr {
		color: var(--text-color);
		& + .tr {
			border-top: 1px solid var(--border-color);
		}
		&:nth-child(even) {
			background: rgba(127, 127, 127, 0.04);
		}
	}
	.c-period {
		color: var(--text-color-2);
	}
	.c-num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.result-card {
		.big-num {
			display: flex;
			align-items: baseline;
			gap: 6px;
			.v {
				font-size: 30px;
				font-weight: 700;
				color: #1677ff;
				font-variant-numeric: tabular-nums;
				line-height: 1.1;
			}
			.u {
				font-size: 12px;
				color: var(--text-color-3);
			}
		}
		.sub {
			font-size: 12px;
			color: var(--text-color-3);
			margin-top: 6px;
			line-height: 1.6;
		}
	}
	.kv-list {
		margin-top: 14px;
		padding-top: 12px;
		border-top: 1px solid var(--border-color);
		.kv {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 5px 0;
			font-size: 13px;
			.k {
				color: var(--text-color-3);
			}
			.v {
				font-weight: 600;
				color: var(--text-color);
				font-variant-numeric: tabular-nums;
				&.warn {
					color: #fa8c16;
				}
			}
		}
	}
	.ratio-bar {
		display: flex;
		height: 8px;
		border-radius: 4px;
		overflow: hidden;
		margin-top: 14px;
		.p {
			background: #1677ff;
		}
		.i {
			background: #faad14;
		}
	}
	.part {
		& + .part {
			margin-top: 10px;
			padding-top: 10px;
			border-top: 1px dashed var(--border-color);
		}
		.part-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			font-size: 13px;
			.pn {
				font-weight: 600;
				color: var(--text-color);
			}
			.pv {
				color: var(--text-color-2);
				font-variant-numeric: tabular-nums;
			}
		}
	}
	.compare {
		font-size: 12px;
		.c-row {
			display: grid;
			grid-template-columns: 1fr 1fr 1fr;
			gap: 8px;
			padding: 6px 0;
			& + .c-row {
				border-top: 1px solid var(--border-color);
			}
			span {
				text-align: right;
				font-variant-numeric: tabular-nums;
				color: var(--text-color);
				&:first-child {
					text-align: left;
					color: var(--text-color-2);
				}
			}
			&.head span {
				font-weight: 600;
				color: var(--text-color-2);
			}
		}
	}
	.hint {
		line-height: 1.7;
	}
}
</style>
