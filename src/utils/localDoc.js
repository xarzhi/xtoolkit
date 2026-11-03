/**
 * 文档自动保存位置（与白板一致）：
 * - Tauri 应用内：写到 %APPDATA%/<appDataDir>/<fileName>
 * - 浏览器预览：退回 localStorage
 */
import { ensureDir, isTauri, pathExists, readSourceText, writeText } from './tauriIO'
import { joinPath } from './image'

export function createDocStore({ fileName, localKey, localLabel = '浏览器 localStorage（应用内为 %APPDATA% 目录）' }) {
	const state = { kind: '', path: '', label: '' }

	const resolve = async () => {
		if (isTauri()) {
			try {
				const { appDataDir } = await import('@tauri-apps/api/path')
				const dir = await appDataDir()
				await ensureDir(dir)
				state.kind = 'file'
				state.path = joinPath(dir, fileName)
				state.label = state.path
				return state
			} catch {
				/* 退回 localStorage */
			}
		}
		state.kind = 'local'
		state.path = `localStorage:${localKey}`
		state.label = localLabel
		return state
	}

	const read = async () => {
		try {
			if (state.kind === 'file') {
				if (!(await pathExists(state.path))) return ''
				return await readSourceText(state.path)
			}
			return localStorage.getItem(localKey) || ''
		} catch {
			return ''
		}
	}

	const write = async text => {
		if (state.kind === 'file') {
			await writeText(state.path, text)
			return
		}
		localStorage.setItem(localKey, text)
	}

	return { state, resolve, read, write }
}

/** 简单的防抖 */
export function debounce(fn, wait = 600) {
	let timer = null
	const wrapped = (...args) => {
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => {
			timer = null
			fn(...args)
		}, wait)
	}
	wrapped.cancel = () => {
		if (timer) clearTimeout(timer)
		timer = null
	}
	return wrapped
}
