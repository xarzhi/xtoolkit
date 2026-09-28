<template>
	<div class="top_box">
		<div class="top">
			<div class="top_box left"></div>
			<div class="top_box center"></div>
			<div class="top_box right">
				<div class="welcome">欢迎您：{{ userinfo.username }}</div>
				<div class="logout" @click="logout">
					<i class="iconfont icon-dengchu-circle-r-xian"></i>
					<div class="text">退出登录</div>
				</div>
			</div>
		</div>
		<div class="breadcrumb_box">
			<a-breadcrumb>
				<a-breadcrumb-item v-for="(item, index) in breadcrumbs" :href="item.path" :key="index">
					<div class="label_box">
						<div class="label" @click="jump(item)">{{ item.label }}</div>
						<div class="close" @click="handleDelete(index)" v-if="index !== 0">
							<CloseOutlined style="font-size: 12px" />
						</div>
					</div>
				</a-breadcrumb-item>
			</a-breadcrumb>
		</div>
	</div>
</template>

<script setup>
import { onMounted, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CloseOutlined } from '@ant-design/icons-vue'
import { useUserStore } from '@/store/users'

const route = useRoute()
const router = useRouter()
const userinfo = JSON.parse(localStorage.getItem('userinfo'))
const userStore = useUserStore()

const breadcrumbs = ref([
	{
		path: '/',
		label: '首页',
	},
])

onMounted(() => {})

watch(route, newV => {
	const index = breadcrumbs.value.findIndex(item => item.path === newV.path)
	if (index !== -1) {
		breadcrumbs.value.splice(index, 1)
	}
	breadcrumbs.value.push({
		path: newV.path,
		label: newV.meta.name,
	})
})

const handleDelete = index => {
	breadcrumbs.value.splice(index, 1)
}

const jump = item => {
	router.push(item.path)
}

const punch = () => {
	store.open()
}
const logout = async () => {
	const res = await userStore.LOGOUT()
	if (res) {
		router.push('/login')
	}
}
const onFold = () => {
	if (store.width == 64) {
		store.setWidth(200)
	} else {
		store.setWidth(64)
	}
}
</script>

<style lang="scss" scoped>
.top_box {
	margin-bottom: 10px;

	.top {
		height: var(--top-height);
		box-shadow: 0 1px 2px #ccc;
		display: flex;
		justify-content: space-between;
		.top_box {
			overflow: hidden;
			flex: 1 1 33.33%;
			display: flex;
			align-items: center;
			height: 100%;
		}
		.right {
			justify-content: end;
			.logout {
				display: flex;
				align-items: center;
				margin-left: 20px;
				margin-right: 30px;
				padding: 5px 10px;
				border-radius: 5px;
				transition: background-color 0.3s;
				cursor: pointer;
				.text {
					margin-left: 8px;
				}
				&:hover {
					background-color: rgba($color: #000000, $alpha: 0.2);
				}
			}
		}
	}
	.breadcrumb_box {
		box-sizing: border-box;
		padding-left: 10px;
		padding-top: 5px;
		.label_box {
			display: flex;
			&:hover {
				.close {
					opacity: 1;
					width: 10px;
				}
			}
			.label {
				margin-right: 5px;
			}
			.close {
				width: 0;
				opacity: 0;
				transition:
					opacity,
					width 0.2s;
			}
		}
	}
}
</style>
