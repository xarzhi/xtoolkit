<template>
	<div
		:style="{
			width: menuWidth + 'px',
		}"
		:class="{
			menu: true,
			collapsed: collapsed,
		}"
	>
		<div class="logo_box" @click="toggleCollapsed">
			<div
				class="logo"
				:style="{
					marginRight: collapsed ? '0px' : '15px',
				}"
			>
				<img src="/logo.png" alt="" />
			</div>
			<div class="title" v-if="!collapsed">XTools</div>
		</div>
		<div class="menu-body">
			<a-menu
				v-model:openKeys="openKeys"
				v-model:selectedKeys="selectedKeys"
				mode="inline"
				:inline-collapsed="collapsed"
				:items="menus"
				@click="handleClick"
				theme="light"
			>
				<!-- <a-menu-item v-for="item in items" :key="item.key" :title="item.title">{{ item.label }}</a-menu-item> -->
			</a-menu>
		</div>
	</div>
</template>

<script setup>
import { computed, reactive, watch, ref, h, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { routes } from '../../router/index'
import {
	MenuFoldOutlined,
	MenuUnfoldOutlined,
	PieChartOutlined,
	MailOutlined,
	DesktopOutlined,
	InboxOutlined,
	AppstoreOutlined,
} from '@ant-design/icons-vue'
import XIcon from '@/components/XIcon.vue'
import { toggleMenuCollapsed, uiState } from '@/utils/uiState'
const selectedKeys = ref(['1-0'])
const openKeys = ref(['0-0'])
// 折叠状态与顶部栏共用（点顶部栏 logo 也能收起/展开）
const collapsed = computed(() => uiState.menuCollapsed)
const menuWidth = computed(() => (uiState.menuCollapsed ? 80 : 255))
const router = useRouter()
const route = useRoute()
const menus = ref([])

onMounted(() => {
	const [realRoutes] = routes
	menus.value = generatorMenu(realRoutes.children)
	syncMenuFromRoute()

	// console.log(menus.value)
})

const generatorMenu = (menu, pIndex = 0, parentPath = '') => {
	if (!menu.length) return
	return menu.map((item, index) => {
		const fullPath = '/' + parentPath ? `${parentPath}/${item.path}`.replace(/\/+/g, '/') : item.path
		const obj = {
			path: fullPath,
			key: pIndex + '-' + index,
			title: item.meta.title,
			label: item.meta.title,
			icon: () => h(XIcon, { icon: item.meta.icon }),
			meta: item.meta,
		}
		if (item.children && item.children.length) {
			obj.children = generatorMenu(item.children ?? [], index + 1, fullPath)
		}
		return obj
	})
}

const syncMenuFromRoute = () => {
	const current = findRecursive(menus.value, item => item.path === route.fullPath)
	if (current) {
		setActive(menus.value, current.item.key)
		selectedKeys.value = [current.item.key]
		if (current.parent) openKeys.value = [current.parent.key]
	}
}

const setActive = (arr, key) => {
	if (!arr.length) return
	const current = findRecursive(menus.value, item => item.key === key)
	const parentKey = current?.parent?.key
	arr.forEach(item => {
		item.icon = () =>
			h(XIcon, {
				icon: item?.meta?.icon,
				active: item.key === key || (parentKey !== undefined && item.key === parentKey),
			})
		if (item.children && item.children.length) {
			setActive(item.children, key)
		}
	})
}

function findRecursive(list, predicate, parent = null, childrenKey = 'children') {
	for (const item of list) {
		if (predicate(item)) return { item, parent }

		const children = item[childrenKey]
		if (Array.isArray(children)) {
			const found = findRecursive(children, predicate, item, childrenKey)
			if (found) return found
		}
	}
	return undefined
}
watch(
	route,
	newV => {
		syncMenuFromRoute()
	},
	{
		immediate: true,
	}
)
const handleClick = ({ item }) => {
	router.push(item.path)
}
const toggleCollapsed = () => {
	toggleMenuCollapsed()
}

// watch(
// 	route,
// 	newData => {
// 		menuList.forEach((oneMenu, oneIndex) => {
// 			if (oneMenu.children) {
// 				oneMenu.children.forEach((twoMenu, twoIndex) => {
// 					if (twoMenu.link == newData.fullPath) {
// 						defaultMenuActive.value = `${oneIndex}-${twoIndex}`
// 					}
// 				})
// 			}
// 		})
// 	},
// 	{
// 		immediate: true,
// 	}
// )
</script>

<style lang="scss" scoped>
.menu {
	border: none;
	// background-color: #001529;
	user-select: none;
	transition: width 0.3s cubic-bezier(0.2, 0, 0, 1) 0s;
	// 让 logo 固定、下面的菜单区域可以滚动
	height: 100%;
	display: flex;
	flex-flow: column;
	overflow: hidden;

	.menu-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		// 仍然可以滚动，但不显示滚动条
		scrollbar-width: none;
		-ms-overflow-style: none;
		&::-webkit-scrollbar {
			width: 0;
			height: 0;
			display: none;
		}
		:deep(.ant-menu) {
			border-inline-end: none;
		}
	}

	&.collapsed {
		.logo_box {
			justify-content: center;
			padding-left: 0;
			// .fade-enter-active,
			// .fade-leave-active {
			// 	transition: opacity 0.1s;
			// }
			// .fade-enter-from,
			// .fade-leave-to {
			// 	opacity: 0;
			// }
		}
	}
	.logo_box {
		width: 100%;
		height: var(--top-height);
		flex: none;
		user-select: none;
		display: flex;
		align-items: center;
		box-sizing: border-box;
		cursor: pointer;
		padding-left: 28px;

		.logo {
			width: 40px;
			height: 100%;
			overflow: hidden;
			display: flex;
			justify-content: center;
			align-items: center;
			img {
				border-radius: 5px;
				width: 40px;
				height: 40px;
			}
		}
		.title {
			font-weight: 600;
			color: #333;
			opacity: 1;
			white-space: nowrap;
			transition: opacity 0.1s;
		}
	}
}
</style>
