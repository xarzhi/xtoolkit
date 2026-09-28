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
		<div class="menu-head" :class="{ collapsed }">
			<a-input
				v-if="!collapsed"
				ref="searchRef"
				v-model:value="keyword"
				class="menu-search"
				placeholder="搜索菜单"
				allow-clear
			>
				<template #prefix>
					<SearchOutlined />
				</template>
			</a-input>
			<div v-else class="menu-search-btn" title="搜索菜单" @click="expandSearch">
				<SearchOutlined />
			</div>
		</div>
		<div class="menu-body">
			<a-menu
				v-model:selectedKeys="selectedKeys"
				:openKeys="openKeys"
				mode="inline"
				:inline-collapsed="collapsed"
				:items="menus"
				@click="handleClick"
				@openChange="handleOpenChange"
				theme="light"
			>
				<!-- <a-menu-item v-for="item in items" :key="item.key" :title="item.title">{{ item.label }}</a-menu-item> -->
			</a-menu>
			<div v-if="searching && !menus.length" class="menu-empty">没有匹配的菜单</div>
		</div>
	</div>
</template>

<script setup>
import { computed, reactive, watch, ref, nextTick, h, onMounted } from 'vue'
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
	SearchOutlined,
} from '@ant-design/icons-vue'
import XIcon from '@/components/XIcon.vue'
import { toggleMenuCollapsed, uiState } from '@/utils/uiState'
const selectedKeys = ref([])
const openKeys = ref([])
// 折叠状态与顶部栏共用（点顶部栏 logo 也能收起/展开）
const collapsed = computed(() => uiState.menuCollapsed)
const menuWidth = computed(() => (uiState.menuCollapsed ? 80 : 255))
const router = useRouter()
const route = useRoute()
// 全量菜单（生成一次），menus 是「搜索过滤后」真正渲染的菜单
const allMenus = ref([])
const keyword = ref('')
const searchRef = ref(null)
const searching = computed(() => !!keyword.value.trim())

onMounted(() => {
	const [realRoutes] = routes
	allMenus.value = generatorMenu(realRoutes.children)
	syncMenuFromRoute()
})

const generatorMenu = (menu, pIndex = 0, parentPath = '') => {
	if (!menu.length) return
	return menu.map((item, index) => {
		const fullPath = '/' + parentPath ? `${parentPath}/${item.path}`.replace(/\/+/g, '/') : item.path
		const obj = {
			path: fullPath,
			// 用完整路径当 key：原来的 1-0 / 1-1 在不同分组之间会重复，
			// 展开、选中会互相串台（手风琴效果也就不可靠了）
			key: fullPath,
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

/** 只留一级：把菜单摊平，顺便记住它属于哪个分组（搜索用） */
const flattenMenu = (list, group = '', acc = []) => {
	for (const item of list) {
		if (item.children && item.children.length) {
			flattenMenu(item.children, item.title, acc)
		} else {
			acc.push({ item, group })
		}
	}
	return acc
}

/** 搜索时把命中的菜单项平铺展示，其余全部过滤掉 */
const menus = computed(() => {
	const kw = keyword.value.trim().toLowerCase()
	if (!kw) return allMenus.value
	return flattenMenu(allMenus.value)
		.filter(({ item, group }) => `${group} ${item.title}`.toLowerCase().includes(kw))
		.map(({ item, group }) => ({
			...item,
			label: group ? `${group} / ${item.title}` : item.title,
		}))
})

const syncMenuFromRoute = () => {
	const current = findRecursive(allMenus.value, item => item.path === route.fullPath)
	if (current) {
		setActive(allMenus.value, current.item.key)
		selectedKeys.value = [current.item.key]
		// 搜索状态下菜单是平铺的，不去动展开项
		if (current.parent && !searching.value) openKeys.value = [current.parent.key]
	}
}

/** 手风琴：同时只展开一个一级菜单 */
const handleOpenChange = keys => {
	const opened = keys.find(key => !openKeys.value.includes(key))
	openKeys.value = opened ? [opened] : keys.slice(-1)
}

/** 搜索框在折叠状态下只显示一个图标，点了先展开菜单再聚焦 */
const expandSearch = async () => {
	if (uiState.menuCollapsed) toggleMenuCollapsed()
	await nextTick()
	const input = searchRef.value?.focus ? searchRef.value : searchRef.value?.$el?.querySelector('input')
	if (input?.focus) input.focus()
}

// 清空搜索框后菜单恢复全部显示，并回到当前页面所在分组
watch(keyword, () => {
	if (!searching.value) {
		openKeys.value = []
		syncMenuFromRoute()
	}
})

const setActive = (arr, key) => {
	if (!arr.length) return
	const current = findRecursive(allMenus.value, item => item.key === key)
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
	// 让搜索框固定、下面的菜单区域可以滚动
	height: 100%;
	display: flex;
	flex-flow: column;
	overflow: hidden;

	.menu-head {
		flex: none;
		height: var(--top-height);
		display: flex;
		align-items: center;
		box-sizing: border-box;
		padding: 0 10px;
		user-select: none;

		&.collapsed {
			justify-content: center;
			padding: 0;
		}

		.menu-search {
			width: 100%;
		}

		.menu-search-btn {
			width: 36px;
			height: 36px;
			display: flex;
			justify-content: center;
			align-items: center;
			border-radius: 6px;
			cursor: pointer;
			color: var(--text-color);
			transition: background-color 0.15s;
			&:hover {
				background-color: var(--icon-bg-color);
			}
		}
	}

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
		.menu-empty {
			padding: 16px 18px;
			font-size: 13px;
			color: var(--text-color-2);
		}
	}
}
</style>
