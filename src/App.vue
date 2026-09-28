<template>
	<a-config-provider :locale="locale" :theme="antdTheme">
		<router-view />
	</a-config-provider>
</template>

<script setup>
import { computed, ref } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { theme as antdThemeToken } from 'ant-design-vue'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

import { useRouter } from 'vue-router'
import { uiState } from '@/utils/uiState'
const router = useRouter()
const locale = ref(zhCN)

// 明暗主题：顶部栏切换 uiState.theme，这里换成 antd 的算法
const antdTheme = computed(() => ({
	algorithm: uiState.theme === 'dark' ? antdThemeToken.darkAlgorithm : antdThemeToken.defaultAlgorithm,
}))

dayjs.locale('zh-cn')
</script>

<style lang="scss" scoped>
@import '@/assets/css/reset.scss';
@import '@/assets/css/vars.css';
</style>
