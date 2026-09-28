<template>
	<div class="tool iconExtraction">
		<h1 class="tool-title">
			文件 / 文件夹图标提取
			<span class="tip">选择任意文件或文件夹，提取系统为其显示的高清图标</span>
		</h1>

		<div class="tool-content">
			<Selector
				title="点击选择文件或文件夹，或拖拽到此处"
				desc="支持一次选择多个文件 / 文件夹"
				:multiple="true"
				@selected="loadIcon"
				@drop="loadIcon"
			/>

			<a-alert v-if="errors.length" type="warning" show-icon class="alert" @close="errors = []">
				<template #message>部分项目提取失败</template>
				<template #description>
					<div v-for="(err, index) in errors" :key="index">{{ err }}</div>
				</template>
			</a-alert>

			<a-spin :spinning="loading">
				<a-empty v-if="!imgList.length && !loading" description="还没有选择文件或文件夹" style="margin-top: 40px" />

				<a-table v-else class="list" :data-source="imgList" row-key="id" size="small" :pagination="false">
					<a-table-column title="图标" width="84">
						<template #default="{ record }">
							<img class="thumb" :src="record.url" :alt="record.name" />
						</template>
					</a-table-column>
					<a-table-column title="名称" ellipsis>
						<template #default="{ record }">{{ record.fullName || record.name }}</template>
					</a-table-column>
					<a-table-column title="类型" width="90">
						<template #default="{ record }">
							<a-tag :color="record.isDir ? 'blue' : record.isShortcut ? 'orange' : 'default'">
								{{ record.isDir ? '文件夹' : record.isShortcut ? '快捷方式' : '文件' }}
							</a-tag>
						</template>
					</a-table-column>
					<a-table-column title="图标来源 / 指向" ellipsis>
						<template #default="{ record }">
							<template v-if="record.isShortcut">
								<div class="target-line">
									<span class="hint">指向：</span>
									<span :title="record.target">{{ record.target || '（未解析出目标）' }}</span>
								</div>
								<div class="hint">
									<span v-if="record.usedTarget">已取原文件图标</span>
									<span v-else>未取到原文件，使用快捷方式自身图标</span>
									<span v-if="record.targetSource"> · 来源 {{ sourceLabel(record.targetSource) }}</span>
									<span v-if="record.targetVerified"> · 已确认存在</span>
								</div>
							</template>
							<span v-else class="hint">文件自身图标</span>
						</template>
					</a-table-column>
					<a-table-column title="大小" width="100">
						<template #default="{ record }">{{ record.isDir ? '-' : formatBytes(record.size) }}</template>
					</a-table-column>
					<a-table-column title="图标尺寸" width="170">
						<template #default="{ record }">
							<span>{{ record.iconSize }} px</span>
							<a-tag v-if="record.iconScaled" color="green" style="margin-left: 6px">
								原内容 {{ record.contentWidth }}×{{ record.contentHeight }} · 已放大
							</a-tag>
						</template>
					</a-table-column>
					<a-table-column title="操作" width="150">
						<template #default="{ record }">
							<a-button type="link" size="small" @click="saveOne(record)">导出</a-button>
							<a-button type="link" size="small" danger @click="removeOne(record.id)">移除</a-button>
						</template>
					</a-table-column>
				</a-table>
			</a-spin>
		</div>

		<div class="tool-footer">
			<a-form layout="inline" :model="form" class="options">
				<a-form-item label="图标尺寸">
					<a-select v-model:value="form.iconSize" style="width: 110px" :options="sizeOptions" />
				</a-form-item>
				<a-form-item label="导出格式">
					<a-select v-model:value="form.exportType" style="width: 150px" :options="exportOptions" />
				</a-form-item>
				<a-form-item>
					<a-checkbox v-model:checked="form.resolveShortcut">快捷方式取原文件图标</a-checkbox>
				</a-form-item>
				<a-form-item>
					<a-checkbox v-model:checked="form.normalizeIcon">裁掉空白边并放大</a-checkbox>
				</a-form-item>
				<span class="hint">
					勾选第一项后 .lnk 会解析指向的文件并取该文件的图标；第二项用于修掉系统返回的"大画布小图标"
				</span>
			</a-form>
			<a-space>
				<a-button :disabled="!imgList.length || busy" @click="clearAll">清空</a-button>
				<a-button type="primary" :loading="busy" :disabled="!imgList.length" @click="handleExport">
					导出{{ imgList.length ? `（${imgList.length}）` : '' }}
				</a-button>
			</a-space>
		</div>
	</div>
</template>

<script setup>
import { onUnmounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { invoke } from '@tauri-apps/api/core'
import { icon, metadata } from 'tauri-plugin-fs-pro-api'
import Selector from '@/components/Selector.vue'
import { convertImage, formatBytes, getOutputFormat, joinPath, normalizeIconBytes, stripExt, uniqueName } from '@/utils/image'
import {
	defaultOutputDir,
	friendlyError,
	isTauri,
	pathExists,
	pickDirectory,
	readSourceBytes,
	saveBytesAs,
	writeBytes,
} from '@/utils/tauriIO'
import { expandEnvVars, extractEnvTarget, resolveShortcut } from '@/utils/lnk'

const imgList = ref([])
const errors = ref([])
const loading = ref(false)
const busy = ref(false)
let seed = 0

const form = ref({ iconSize: 512, exportType: 'png', resolveShortcut: true, normalizeIcon: true })
const sizeOptions = [16, 32, 48, 64, 128, 256, 512].map(size => ({ label: `${size} px`, value: size }))
const exportOptions = [
	{ label: 'PNG（保留透明）', value: 'png' },
	{ label: 'JPG', value: 'jpg' },
	{ label: 'ICO（多尺寸图标）', value: 'ico' },
	{ label: 'BMP', value: 'bmp' },
]

const SOURCE_LABELS = {
	linkinfo: '快捷方式记录的路径',
	idlist: '系统项目列表',
	env: '环境变量路径',
	relative: '相对路径',
	'env-unresolved': '环境变量（未能展开）',
	none: '未解析',
}

const sourceLabel = source => SOURCE_LABELS[source] || source

const isShortcutPath = path => /\.lnk$/i.test(String(path || ''))

/** 展开 %VAR%：应用内交给 Rust（环境变量最准），浏览器里用内置表兜底 */
const expandEnv = async text => {
	if (!text) return ''
	if (isTauri()) {
		try {
			return await invoke('expand_env_path', { path: text })
		} catch {
			/* 退回本地展开 */
		}
	}
	const lang = (navigator.language || '').toLowerCase()
	const systemRoot = lang.startsWith('zh') ? 'C:\\Windows' : 'C:\\Windows'
	return expandEnvVars(text, {
		windir: systemRoot,
		SystemRoot: systemRoot,
		SystemDrive: 'C:',
		ProgramFiles: 'C:\\Program Files',
		'ProgramFiles(x86)': 'C:\\Program Files (x86)',
		ProgramData: 'C:\\ProgramData',
		PUBLIC: 'C:\\Users\\Public',
		USERPROFILE: '',
	})
}

/** 逐个候选路径检查是否存在，返回 { path, verified } */
const pickExisting = async candidates => {
	for (const candidate of candidates) {
		try {
			if (await pathExists(candidate)) return { path: candidate, verified: true }
		} catch {
			/* 忽略，继续试下一个 */
		}
	}
	return candidates.length ? { path: candidates[0], verified: false } : { path: '', verified: false }
}

/** 解析 .lnk 字节流得到目标；独立出来便于单独验证 */
const resolveShortcutBytes = async (bytes, linkPath) => {
	// 环境变量形式的路径（如 %windir%\system32\magnify.exe）先展开，再交给统一解析
	const rawEnv = extractEnvTarget(bytes)
	const envOverride = rawEnv ? await expandEnv(rawEnv) : ''
	const result = resolveShortcut(bytes, { linkPath, envOverride })
	const picked = await pickExisting(result.candidates)
	return {
		target: picked.path,
		targetVerified: picked.verified,
		targetSource: result.source,
		candidates: result.candidates,
		rawEnv,
		linkInfoTarget: result.parsed?.target || '',
	}
}

/** 解析 .lnk 指向的目标：LinkInfo → 环境变量 → IDList → 相对路径，并优先选择真实存在的那个 */
const resolveShortcutTarget = async path => resolveShortcutBytes(await readSourceBytes(path), path)

/**
 * 图标缓存目录：插件按"文件名/扩展名"缓存且缓存键里不含尺寸，
 * 换过尺寸后会直接返回旧的小图，所以这里按尺寸分目录。
 */
let iconCacheRoot = ''
const iconSavePathFor = async size => {
	if (!isTauri()) return undefined
	try {
		if (!iconCacheRoot) {
			const { appDataDir } = await import('@tauri-apps/api/path')
			iconCacheRoot = joinPath(await appDataDir(), 'icon-cache')
		}
		return joinPath(iconCacheRoot, String(size))
	} catch {
		return undefined
	}
}

const loadIcon = async paths => {
	const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean)
	if (!list.length) return
	loading.value = true
	const failed = []
	try {
		for (const path of list) {
			try {
				const info = await metadata(path)
				const isShortcut = !info.isDir && isShortcutPath(path)
				// 勾选后：若为快捷方式，先解析出原文件，再取原文件的图标
				let iconSource = path
				let shortcut = null
				if (isShortcut && form.value.resolveShortcut) {
					try {
						const resolved = await resolveShortcutTarget(path)
						shortcut = resolved
						if (resolved.target) iconSource = resolved.target
					} catch (err) {
						failed.push(`${info.name}：快捷方式解析失败（${friendlyError(err)}）`)
					}
				}
				const savePath = await iconSavePathFor(form.value.iconSize)
				let iconPath
				try {
					iconPath = await icon(iconSource, { size: form.value.iconSize, savePath })
				} catch (err) {
					// 目标取图标失败时退回快捷方式自身
					if (iconSource !== path) {
						iconPath = await icon(path, { size: form.value.iconSize, savePath })
						if (shortcut) shortcut.usedTarget = false
					} else {
						throw err
					}
				}
				let bytes = await readSourceBytes(iconPath)
				let iconInfo = { scaled: false, contentWidth: 0, contentHeight: 0 }
				// 修掉"大画布小图标"：裁掉透明边并把内容放大到目标尺寸
				if (form.value.normalizeIcon) {
					try {
						const normalized = await normalizeIconBytes(bytes, form.value.iconSize)
						bytes = normalized.bytes
						iconInfo = normalized
					} catch (err) {
						console.warn('图标规整失败，改用原始图标', err)
					}
				}
				const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
				imgList.value.push({
					id: `icon_${(seed += 1)}`,
					path,
					iconPath,
					url,
					bytes,
					iconSize: form.value.iconSize,
					iconScaled: !!iconInfo.scaled,
					contentWidth: iconInfo.contentWidth,
					contentHeight: iconInfo.contentHeight,
					name: info.name,
					fullName: info.fullName || info.name,
					extname: info.extname,
					size: info.size,
					isDir: info.isDir,
					modifiedAt: info.modifiedAt,
					isShortcut,
					target: shortcut?.target || '',
					targetSource: shortcut?.targetSource || '',
					targetVerified: !!shortcut?.targetVerified,
					usedTarget: !!shortcut && iconSource !== path,
				})
			} catch (err) {
				failed.push(`${path.split(/[\\/]/).pop()}：${friendlyError(err)}`)
			}
		}
	} finally {
		loading.value = false
	}
	errors.value = failed
}

const convertOne = async item => {
	const fmt = getOutputFormat(form.value.exportType)
	if (fmt.value === 'png') {
		return { bytes: item.bytes, format: 'png' }
	}
	return await convertImage(item.bytes, { format: fmt.value, quality: 0.95, sourceMime: 'image/png' })
}

const outputName = item => `${stripExt(item.fullName || item.name || 'icon')}.${getOutputFormat(form.value.exportType).ext}`

const saveOne = async item => {
	try {
		const out = await convertOne(item)
		const path = await saveBytesAs(out.bytes, {
			defaultPath: outputName(item),
			filters: [{ name: form.value.exportType.toUpperCase(), extensions: [getOutputFormat(form.value.exportType).ext] }],
		})
		if (path) message.success(`已保存：${path}`)
	} catch (err) {
		message.error(friendlyError(err))
	}
}

const handleExport = async () => {
	const dir = await pickDirectory({ title: '选择图标导出文件夹', defaultPath: (await defaultOutputDir()) || undefined })
	if (!dir) return
	busy.value = true
	const used = new Set()
	let ok = 0
	try {
		for (const item of imgList.value) {
			try {
				const out = await convertOne(item)
				const name = uniqueName(used, outputName(item))
				await writeBytes(joinPath(dir, name), out.bytes)
				ok += 1
			} catch (err) {
				message.error(`${item.name} 导出失败：${friendlyError(err)}`)
			}
		}
	} finally {
		busy.value = false
	}
	if (ok) message.success(`已导出 ${ok} 个图标到 ${dir}`)
}

const removeOne = id => {
	const target = imgList.value.find(i => i.id === id)
	if (target?.url) URL.revokeObjectURL(target.url)
	imgList.value = imgList.value.filter(i => i.id !== id)
}

const clearAll = () => {
	imgList.value.forEach(i => i.url && URL.revokeObjectURL(i.url))
	imgList.value = []
}

// 开发期暴露解析函数，便于用真实 .lnk 做校验（生产构建不会包含）
if (import.meta.env.DEV) {
	window.__iconExtractionTest = { resolveShortcutBytes, expandEnv, normalizeIconBytes }
}
onUnmounted(() => {
	clearAll()
	if (import.meta.env.DEV && typeof window !== 'undefined') delete window.__iconExtractionTest
})
</script>

<style lang="scss" scoped>
@use '../../assets/css/tool.scss' as *;

.iconExtraction {
	.alert {
		margin-top: 12px;
	}
	.list {
		margin-top: 16px;
	}
	.target-line {
		display: flex;
		gap: 4px;
		max-width: 100%;
		span:last-child {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}
	.options {
		flex: 1;
		:deep(.ant-form-item) {
			margin-bottom: 4px;
		}
	}
}
</style>
