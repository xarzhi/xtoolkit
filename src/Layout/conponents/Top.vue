<template>
	<!-- 双击最大化由 Tauri 的 data-tauri-drag-region 内置处理（见 tauri/src/window/scripts/drag.js），
	     这里不要再绑 @dblclick，否则会与内置行为互相抵消 -->
	<div class="topbar top" data-tauri-drag-region>
		<div class="left">
			<div class="logo_box" v-if="!collapsed">
				<div class="logo" @click.stop="toggleMenuCollapsed">
					<img src="/logo.png" alt="" />
				</div>
				<div class="title" @click.stop="toggleMenuCollapsed">XToolKit</div>
			</div>
			<div class="logo_box collapsed" v-else>
				<div class="logo" @click.stop="toggleMenuCollapsed" title="展开菜单">
					<img src="/logo.png" alt="" />
				</div>
			</div>
		</div>

		<div class="right">
			<div
				class="titlebar-button theme"
				:title="isDark ? '切换到浅色主题' : '切换到深色主题'"
				@click.stop="toggleTheme"
			>
				<!-- 太阳（当前是深色，点了变浅色） -->
					<i v-if="isDark" class="iconfont icon-light"></i>
					<i v-else class="iconfont icon-dark"></i>

				
				<!-- 月亮（当前是浅色，点了变深色） -->
				
			</div>
			<div class="titlebar-button" id="titlebar-minimize" title="最小化" @click.stop="minimize">
				<i class="iconfont icon-minimize"></i>
			</div>
			<div class="titlebar-button" id="titlebar-maximize" title="最大化 / 还原" @click.stop="toggleMaximize">
				<i class="iconfont icon-maximize"></i>
			</div>
			<div class="titlebar-button close" id="titlebar-close" title="关闭" @click.stop="close">
				<i class="iconfont icon-close"></i>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed } from 'vue'
import { isTauri } from '@/utils/tauriIO'
import { toggleMenuCollapsed, toggleTheme, uiState } from '@/utils/uiState'

const collapsed = computed(() => uiState.menuCollapsed)
const isDark = computed(() => uiState.theme === 'dark')

/** 浏览器里（pnpm dev）没有 Tauri API，统一走 withWindow 兜底 */
const withWindow = async action => {
	if (!isTauri()) return
	try {
		const { getCurrentWindow } = await import('@tauri-apps/api/window')
		await action(getCurrentWindow())
	} catch (err) {
		console.warn('窗口操作失败', err)
	}
}

const minimize = () => withWindow(w => w.minimize())
const toggleMaximize = () => withWindow(w => w.toggleMaximize())
const close = () => withWindow(w => w.close())
</script>

<style lang="scss" scoped>
.top {
	flex: none;
	box-shadow: var(--top-shadow);
	position: relative;
	z-index: 10;
	width: 100%;
	box-sizing: border-box;
}

.topbar {
	height: var(--top-height);
	background: var(--top-bg-color);
	border-bottom: 1px solid var(--top-border-color);
	user-select: none;
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.left {
	display: flex;
	align-items: center;
	box-sizing: border-box;
	flex-shrink: 0;
	.logo_box {
		display: flex;
		align-items: center;
		height: var(--top-height);
		padding: 0 12px;
		.logo {
			width: 32px;
			height: 32px;
			margin-right: 10px;
			border-radius: 6px;
			overflow: hidden;
			display: flex;
			justify-content: center;
			align-items: center;
			cursor: pointer;
			transition: background-color 0.15s;
			img {
				width: 26px;
				height: 26px;
			}
			&:hover {
				background-color: var(--icon-bg-color);
			}
			&:active {
				transform: scale(0.96);
			}
		}
		.title {
			font-size: 14px;
			font-weight: 600;
			color: var(--text-color);
			cursor: pointer;
			white-space: nowrap;
		}
	}
}

.right {
	display: flex;
	align-items: center;
	height: 100%;
}

.titlebar-button {
	display: flex;
	justify-content: center;
	align-items: center;
	width: 42px;
	height: 100%;
	cursor: pointer;
	transition: background-color 0.15s;
	i {
		color: var(--text-color);
		font-size: 15px;
	}
	svg {
		color: var(--text-color);
	}
	&:hover {
		background: var(--icon-bg-color);
	}
	&:active {
		background: var(--icon-bg-color-strong);
	}
	&.close:hover {
		background: #e81123;
		i {
			color: #fff;
		}
	}
}
</style>
