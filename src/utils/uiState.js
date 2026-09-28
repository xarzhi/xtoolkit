import { reactive, watch } from 'vue'

/**
 * 全局 UI 状态：顶部栏和侧边菜单栏都要用到的部分
 * （侧边栏折叠状态放在这里，顶部栏点 logo 就能收起/展开菜单）
 */
const STORAGE_KEY = 'xtools-menu-collapsed'

export const uiState = reactive({
	menuCollapsed: false,
})

try {
	uiState.menuCollapsed = localStorage.getItem(STORAGE_KEY) === '1'
} catch {
	/* 忽略隐私模式等异常 */
}

watch(
	() => uiState.menuCollapsed,
	value => {
		try {
			localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
		} catch {
			/* 忽略 */
		}
	}
)

export function toggleMenuCollapsed() {
	uiState.menuCollapsed = !uiState.menuCollapsed
}
