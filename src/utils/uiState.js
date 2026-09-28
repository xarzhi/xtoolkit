import { reactive, watch } from 'vue'

/**
 * 全局 UI 状态：顶部栏和侧边菜单栏都要用到的部分
 * - menuCollapsed：侧边栏折叠状态（顶部栏点 logo 就能收起/展开菜单）
 * - theme：明暗主题（顶部栏右侧按钮切换，存在 localStorage 里）
 */
const COLLAPSE_KEY = 'xtools-menu-collapsed'
const THEME_KEY = 'xtools-theme'

export const uiState = reactive({
	menuCollapsed: false,
	theme: 'light',
})

/** 把主题写到 <html data-theme>，CSS 变量与 antd 都按它切换 */
function applyTheme(theme) {
	if (typeof document === 'undefined') return
	const dark = theme === 'dark'
	document.documentElement.dataset.theme = dark ? 'dark' : 'light'
	// 让原生滚动条 / 表单控件也跟着变
	document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

try {
	uiState.menuCollapsed = localStorage.getItem(COLLAPSE_KEY) === '1'
	const savedTheme = localStorage.getItem(THEME_KEY)
	if (savedTheme === 'dark' || savedTheme === 'light') uiState.theme = savedTheme
} catch {
	/* 忽略隐私模式等异常 */
}

applyTheme(uiState.theme)

watch(
	() => uiState.menuCollapsed,
	value => {
		try {
			localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0')
		} catch {
			/* 忽略 */
		}
	}
)

watch(
	() => uiState.theme,
	value => {
		applyTheme(value)
		try {
			localStorage.setItem(THEME_KEY, value)
		} catch {
			/* 忽略 */
		}
	}
)

export function toggleMenuCollapsed() {
	uiState.menuCollapsed = !uiState.menuCollapsed
}

export function toggleTheme() {
	uiState.theme = uiState.theme === 'dark' ? 'light' : 'dark'
}
