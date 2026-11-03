<template>
	<div class="tool bmiCalc">
		<h1 class="tool-title">
			BMI 计算
			<span class="tip">按中国成人标准计算体质指数，并给出健康体重区间与每日热量参考</span>
		</h1>

		<div class="tool-content">
			<div class="layout">
				<!-- 左：输入 -->
				<div class="input-col">
					<div class="tool-card block">
						<div class="block-title">身体数据</div>

						<div class="field">
							<span class="label">身高</span>
							<a-input-number v-model:value="height" :min="80" :max="250" :step="1" :precision="1" style="flex: 1" />
							<span class="unit">cm</span>
						</div>

						<div class="field">
							<span class="label">体重</span>
							<a-input-number v-model:value="weight" :min="20" :max="300" :step="0.1" :precision="1" style="flex: 1" />
							<span class="unit">kg</span>
						</div>

						<div class="field">
							<span class="label">性别</span>
							<a-radio-group v-model:value="gender" size="small">
								<a-radio-button value="male">男</a-radio-button>
								<a-radio-button value="female">女</a-radio-button>
							</a-radio-group>
						</div>

						<div class="field">
							<span class="label">年龄</span>
							<a-input-number v-model:value="age" :min="10" :max="100" :step="1" style="flex: 1" />
							<span class="unit">岁</span>
						</div>

						<div class="field">
							<span class="label">活动量</span>
							<a-select v-model:value="activity" :options="ACTIVITY_OPTIONS" style="flex: 1" size="small" />
						</div>

						<div class="slider-row">
							<span class="hint">快速拖动体重</span>
							<a-slider v-model:value="weight" :min="30" :max="150" :step="0.5" />
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">判定标准</div>
						<div class="std-list">
							<div v-for="s in STANDARD" :key="s.label" class="std-row" :class="{ on: category.key === s.key }">
								<span class="dot" :style="{ background: s.color }"></span>
								<span class="std-name">{{ s.label }}</span>
								<span class="std-range">{{ s.range }}</span>
							</div>
						</div>
						<div class="hint" style="margin-top: 8px">
							中国成人标准（WS/T 428-2013）。BMI 只是筛查指标，肌肉量大的健身人群可能被高估，孕期与未成年人需另作评估。
						</div>
					</div>
				</div>

				<!-- 右：结果 -->
				<div class="result-col">
					<div class="tool-card block result-card">
						<div class="bmi-value">
							<span class="num" :style="{ color: category.color }">{{ bmi ? bmi.toFixed(1) : '--' }}</span>
							<div class="unit-col">
								<span class="unit">kg/m²</span>
								<span class="badge" :style="{ background: category.soft, color: category.color }">{{ category.label }}</span>
							</div>
						</div>

						<!-- 刻度条 -->
						<div class="gauge">
							<div class="bar">
								<span v-for="s in STANDARD" :key="s.key" class="seg" :style="{ flex: s.to - s.from, background: s.color }"></span>
								<span v-if="bmi" class="pointer" :style="{ left: pointerLeft }"></span>
							</div>
							<div class="ticks">
								<span v-for="t in TICKS" :key="t" class="tick" :style="{ left: pct(t) + '%' }">{{ t }}</span>
							</div>
						</div>

						<div class="compare" :style="{ background: category.soft }">
							<span class="cmp-text">{{ advice }}</span>
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">健康体重区间</div>
						<div class="range-cards">
							<div class="rc">
								<span class="rc-label">正常范围（18.5 ~ 23.9）</span>
								<span class="rc-value">{{ healthyRange }}</span>
							</div>
							<div class="rc">
								<span class="rc-label">当前{{ inRange ? '处于区间内' : diffText.direction }}</span>
								<span class="rc-value" :style="{ color: diffText.color }">{{ diffText.value }}</span>
							</div>
						</div>
					</div>

					<div class="tool-card block">
						<div class="block-title">
							每日热量参考
							<span class="hint" style="margin-left: auto">Mifflin-St Jeor 公式</span>
						</div>
						<div class="energy">
							<div class="en-item">
								<span class="en-label">基础代谢 BMR</span>
								<span class="en-value">{{ bmr ? Math.round(bmr) : '--' }} <small>kcal</small></span>
							</div>
							<div class="en-item">
								<span class="en-label">维持体重 TDEE</span>
								<span class="en-value">{{ tdee ? Math.round(tdee) : '--' }} <small>kcal</small></span>
							</div>
						</div>
						<div class="energy-sub">
							<span v-for="g in goals" :key="g.label" class="goal">
								{{ g.label }}
								<b>{{ g.value }}</b>
							</span>
						</div>
						<div class="hint" style="margin-top: 8px">减重建议每周 0.25~0.5 kg，对应每日 250~500 kcal 缺口；过低热量需在专业人士指导下进行。</div>
					</div>
				</div>
			</div>
		</div>

		<div class="tool-footer">
			<span class="hint">BMI = 体重(kg) ÷ 身高(m)²，结果仅供参考，不作为医学诊断依据</span>
			<a-space>
				<a-button @click="reset">重置</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const STANDARD = [
	{ key: 'thin', label: '偏瘦', range: '< 18.5', from: 14, to: 18.5, color: '#3b82f6', soft: 'rgba(59, 130, 246, 0.12)' },
	{ key: 'normal', label: '正常', range: '18.5 ~ 23.9', from: 18.5, to: 24, color: '#22c55e', soft: 'rgba(34, 197, 94, 0.14)' },
	{ key: 'over', label: '超重', range: '24.0 ~ 27.9', from: 24, to: 28, color: '#f59e0b', soft: 'rgba(245, 158, 11, 0.14)' },
	{ key: 'obese', label: '肥胖', range: '≥ 28.0', from: 28, to: 36, color: '#ef4444', soft: 'rgba(239, 68, 68, 0.14)' },
]

const TICKS = [14, 18.5, 24, 28, 36]
const GAUGE_MIN = 14
const GAUGE_MAX = 36

const ACTIVITY_OPTIONS = [
	{ label: '久坐（几乎不运动）', value: 1.2 },
	{ label: '轻度（每周 1~3 次）', value: 1.375 },
	{ label: '中度（每周 3~5 次）', value: 1.55 },
	{ label: '高度（每周 6~7 次）', value: 1.725 },
	{ label: '极高（体力工作 / 一天两练）', value: 1.9 },
]

const DEFAULT = { height: 172, weight: 68, gender: 'male', age: 28, activity: 1.375 }

const height = ref(DEFAULT.height)
const weight = ref(DEFAULT.weight)
const gender = ref(DEFAULT.gender)
const age = ref(DEFAULT.age)
const activity = ref(DEFAULT.activity)

/* 计算 BMI：只在输入有效时返回数值 */
const bmi = computed(() => {
	const h = (height.value || 0) / 100
	const w = weight.value || 0
	if (!h || !w) return 0
	const v = w / (h * h)
	return Number.isFinite(v) ? v : 0
})

const category = computed(() => {
	const v = bmi.value
	if (!v) return { key: '', label: '待输入', color: '#8c8c8c', soft: 'rgba(140, 140, 140, 0.12)' }
	if (v < 18.5) return STANDARD[0]
	if (v < 24) return STANDARD[1]
	if (v < 28) return STANDARD[2]
	return STANDARD[3]
})

const pct = v => Math.min(100, Math.max(0, ((v - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100))
const pointerLeft = computed(() => `${pct(bmi.value)}%`)

/* 健康体重区间 */
const healthyRange = computed(() => {
	const h = (height.value || 0) / 100
	if (!h) return '--'
	const lo = 18.5 * h * h
	const hi = 23.9 * h * h
	return `${lo.toFixed(1)} ~ ${hi.toFixed(1)} kg`
})

const inRange = computed(() => bmi.value >= 18.5 && bmi.value < 24)

const diffText = computed(() => {
	const h = (height.value || 0) / 100
	const w = weight.value || 0
	if (!h || !w) return { direction: '', value: '--', color: 'inherit' }
	const lo = 18.5 * h * h
	const hi = 23.9 * h * h
	if (w < lo) return { direction: '偏轻', value: `建议增重 ${(lo - w).toFixed(1)} kg`, color: '#3b82f6' }
	if (w > hi) return { direction: '偏重', value: `建议减重 ${(w - hi).toFixed(1)} kg`, color: '#ef4444' }
	return { direction: '正常', value: '保持当前体重', color: '#22c55e' }
})

const advice = computed(() => {
	if (!bmi.value) return '请输入身高与体重'
	const v = bmi.value
	if (v < 18.5) return `BMI ${v.toFixed(1)}，低于正常范围。建议增加优质蛋白与总热量摄入，配合力量训练增肌。`
	if (v < 24) return `BMI ${v.toFixed(1)}，处于正常范围。保持规律饮食与每周 150 分钟中等强度运动即可。`
	if (v < 28) return `BMI ${v.toFixed(1)}，已进入超重区间。建议控制精制碳水与含糖饮料，每周有氧 3 次以上。`
	return `BMI ${v.toFixed(1)}，达到肥胖标准。建议就医评估代谢指标，循序渐进减重并监测血压血糖。`
})

/* 基础代谢 / 每日消耗 */
const bmr = computed(() => {
	const h = height.value || 0
	const w = weight.value || 0
	const a = age.value || 0
	if (!h || !w || !a) return 0
	const base = 10 * w + 6.25 * h - 5 * a
	return gender.value === 'male' ? base + 5 : base - 161
})

const tdee = computed(() => (bmr.value ? bmr.value * (activity.value || 1.2) : 0))

const goals = computed(() => {
	if (!tdee.value) return []
	const t = Math.round(tdee.value)
	return [
		{ label: '稳妥减重', value: `${t - 400} kcal` },
		{ label: '维持', value: `${t} kcal` },
		{ label: '增肌', value: `${t + 300} kcal` },
	]
})

const reset = () => {
	height.value = DEFAULT.height
	weight.value = DEFAULT.weight
	gender.value = DEFAULT.gender
	age.value = DEFAULT.age
	activity.value = DEFAULT.activity
}

/* 输入框被清空时回退到上一个有效值，避免结果整块消失 */
watch(height, v => {
	if (v == null) height.value = DEFAULT.height
})
watch(weight, v => {
	if (v == null) weight.value = DEFAULT.weight
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.bmiCalc {
	.layout {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.input-col {
		flex: 1;
		min-width: 320px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.result-col {
		flex: 1.4;
		min-width: 380px;
		display: flex;
		flex-flow: column;
		gap: 12px;
	}
	.block-title {
		font-weight: 600;
		color: var(--text-color);
		margin-bottom: 12px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}
	.field {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 10px;
		.label {
			width: 48px;
			flex: none;
			font-size: 13px;
			color: var(--text-color-2);
		}
		.unit {
			font-size: 12px;
			color: var(--text-color-3);
			width: 22px;
			flex: none;
		}
	}
	.slider-row {
		margin-top: 4px;
		:deep(.ant-slider) {
			margin: 6px 0 0;
		}
	}
	.std-list {
		display: flex;
		flex-flow: column;
		gap: 4px;
		.std-row {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 6px 10px;
			border-radius: 8px;
			border: 1px solid transparent;
			font-size: 12px;
			color: var(--text-color-2);
			.dot {
				width: 8px;
				height: 8px;
				border-radius: 50%;
				flex: none;
			}
			.std-name {
				flex: none;
				width: 44px;
			}
			.std-range {
				font-family: Consolas, Monaco, monospace;
			}
			&.on {
				border-color: var(--border-color);
				background: rgba(127, 127, 127, 0.08);
				color: var(--text-color);
				font-weight: 600;
			}
		}
	}
	.result-card {
		padding-bottom: 16px;
	}
	.bmi-value {
		display: flex;
		align-items: flex-end;
		gap: 14px;
		.num {
			font-size: 56px;
			font-weight: 700;
			line-height: 1;
			font-variant-numeric: tabular-nums;
			transition: color 0.2s;
		}
		.unit-col {
			display: flex;
			flex-flow: column;
			gap: 6px;
			padding-bottom: 6px;
		}
		.unit {
			font-size: 12px;
			color: var(--text-color-3);
		}
		.badge {
			display: inline-block;
			padding: 2px 10px;
			border-radius: 10px;
			font-size: 12px;
			font-weight: 600;
			width: fit-content;
		}
	}
	.gauge {
		margin: 22px 0 6px;
		.bar {
			position: relative;
			display: flex;
			height: 10px;
			border-radius: 5px;
			overflow: visible;
			.seg {
				height: 100%;
				&:first-child {
					border-radius: 5px 0 0 5px;
				}
				&:last-of-type {
					border-radius: 0 5px 5px 0;
				}
			}
			.pointer {
				position: absolute;
				top: -6px;
				width: 4px;
				height: 22px;
				border-radius: 2px;
				background: var(--text-color);
				box-shadow: 0 0 0 2px var(--panel-bg);
				transform: translateX(-50%);
				transition: left 0.2s ease;
			}
		}
		.ticks {
			position: relative;
			height: 18px;
			.tick {
				position: absolute;
				top: 6px;
				transform: translateX(-50%);
				font-size: 11px;
				color: var(--text-color-3);
				font-variant-numeric: tabular-nums;
			}
		}
	}
	.compare {
		margin-top: 12px;
		padding: 10px 14px;
		border-radius: 10px;
		.cmp-text {
			font-size: 13px;
			line-height: 1.7;
			color: var(--text-color);
		}
	}
	.range-cards {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		.rc {
			flex: 1;
			min-width: 150px;
			display: flex;
			flex-flow: column;
			gap: 4px;
			padding: 10px 12px;
			border-radius: 10px;
			background: rgba(127, 127, 127, 0.09);
			.rc-label {
				font-size: 11px;
				color: var(--text-color-3);
			}
			.rc-value {
				font-size: 15px;
				font-weight: 600;
				color: var(--text-color);
				font-variant-numeric: tabular-nums;
			}
		}
	}
	.energy {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		.en-item {
			flex: 1;
			min-width: 140px;
			display: flex;
			flex-flow: column;
			gap: 4px;
			padding: 10px 12px;
			border-radius: 10px;
			background: rgba(127, 127, 127, 0.09);
			.en-label {
				font-size: 11px;
				color: var(--text-color-3);
			}
			.en-value {
				font-size: 18px;
				font-weight: 700;
				color: #1677ff;
				font-variant-numeric: tabular-nums;
				small {
					font-size: 11px;
					font-weight: 400;
					color: var(--text-color-3);
				}
			}
		}
	}
	.energy-sub {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 18px;
		margin-top: 10px;
		.goal {
			font-size: 12px;
			color: var(--text-color-2);
			b {
				margin-left: 6px;
				color: var(--text-color);
				font-variant-numeric: tabular-nums;
			}
		}
	}
}
</style>
