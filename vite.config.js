import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

const host = process.env.TAURI_DEV_HOST

export default defineConfig(async () => ({
	plugins: [vue()],
	clearScreen: false,
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
			'@views': path.resolve(__dirname, 'src/views'),
			'@components': path.resolve(__dirname, 'src/components'),
			'@assets': path.resolve(__dirname, 'src/assets'),
			'@api': path.resolve(__dirname, 'src/api'),
			'@directives': path.resolve(__dirname, 'src/directives'),
			'@utils': path.resolve(__dirname, 'src/utils'),
		},
	},
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: 'ws',
					host,
					port: 1421,
				}
			: undefined,
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ['**/src-tauri/**'],
		},
	},
}))
