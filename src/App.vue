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
/* reset.scss 和 vars.css 都改到 main.js 里全局引入了。
   原因：这里是 scoped，Vue 会给每条选择器补上 [data-v-xxx]，
   于是 `html, body, #app { height: 100vh; overflow: hidden }` 会变成
   `html[data-v-xxx], body[data-v-xxx], #app[data-v-xxx]`——这三个元素身上
   根本没有 data-v 属性，规则永远不生效（:root 变量同理）。 */

// @import '@/assets/iconfont/iconfont.css';
// @import '@/assets/common/iconfont.css';
</style>
