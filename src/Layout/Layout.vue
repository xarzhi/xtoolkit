<template>
	<div class="layout">
		<Top />
		<div class="body">
			<Menu />
			<div class="main">
				<div class="router-content">
					<router-view v-slot="{ Component }">
						<transition name="slide" mode="out-in">
							<keep-alive>
								<component :is="Component" :key="$route.fullPath" />
							</keep-alive>
						</transition>
					</router-view>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import Menu from './conponents/Menu.vue'
import Top from './conponents/Top.vue'
</script>

<style lang="scss" scoped>
.layout {
	width: 100%;
	height: 100vh;
	display: flex;
	flex-flow: column;
	overflow: hidden;
	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		overflow: hidden;
	}
	.main {
		overflow: hidden;
		width: 100%;
		flex: 1;
		background-color: #fafafa;
		box-sizing: border-box;
		.router-content {
			overflow: hidden;
			margin: auto;
			width: 100%;
			padding: 10px;
			box-sizing: border-box;
			height: 100%;
		}
	}
}
.slide-enter-active,
.slide-leave-active {
	transition: all 0.2s ease;
}

.slide-enter-from {
	opacity: 0;
	transform: translateY(20px);
}

.slide-leave-to {
	opacity: 0;
	transform: translateY(-20px);
}
</style>
