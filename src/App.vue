<template>
	<a-config-provider :locale="locale">
		<router-view />
	</a-config-provider>
</template>

<script setup>
import { ref } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

import { useRouter } from 'vue-router'
const router = useRouter()
const locale = ref(zhCN)

dayjs.locale('zh-cn')
</script>

<style lang="scss" scoped>
@import '@/assets/css/reset.scss';
@import '@/assets/css/vars.css';
</style>
