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
			<div class="titlebar-button" title="全屏切换" @click.stop="toggleFullscreen">
				<i class="iconfont icon-fullscreen"></i>
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
import { toggleMenuCollapsed, uiState } from '@/utils/uiState'

const collapsed = computed(() => uiState.menuCollapsed)

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

const toggleFullscreen = () =>
	withWindow(async w => {
		const full = await w.isFullscreen()
		await w.setFullscreen(!full)
	})
</script>

<style lang="scss" scoped>
.top {
	flex: none;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
	position: relative;
	z-index: 10;
	width: 100%;
	box-sizing: border-box;
}

.topbar {
	height: var(--top-height);
	background: #fff;
	border-bottom: 1px solid rgba(0, 0, 0, 0.06);
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
				background-color: rgba(0, 0, 0, 0.06);
			}
			&:active {
				transform: scale(0.96);
			}
		}
		.title {
			font-size: 14px;
			font-weight: 600;
			color: #333;
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
		color: #555;
		font-size: 15px;
	}
	&:hover {
		background: rgba(0, 0, 0, 0.06);
	}
	&:active {
		background: rgba(0, 0, 0, 0.12);
	}
	&.close:hover {
		background: #e81123;
		i {
			color: #fff;
		}
	}
}
</style>
