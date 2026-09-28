/**
 * Windows 快捷方式（.lnk）解析（纯前端，按 MS-SHLLINK 规范读取关键字段）
 *
 * 目的：拿到"快捷方式指向的原文件路径"，从而去取原文件的图标。
 * 只解析解析路径所需的最小部分：ShellLinkHeader → LinkTargetIDList(跳过) → LinkInfo → StringData。
 */

const HEADER_SIZE = 0x4c

const FLAG = {
	HasLinkTargetIDList: 0x01,
	HasLinkInfo: 0x02,
	HasName: 0x04,
	HasRelativePath: 0x08,
	HasWorkingDir: 0x10,
	HasArguments: 0x20,
	HasIconLocation: 0x40,
	IsUnicode: 0x80,
}

const LINK_INFO_FLAG = {
	VolumeIDAndLocalBasePath: 0x01,
	CommonNetworkRelativeLinkAndPathSuffix: 0x02,
}

function readAnsiRaw(bytes, offset, limit) {
	// 先定位字符串结束位置，再整体按代码页解码（中文字符是双字节，不能逐字节转字符）
	let end = offset
	while (end < limit && end < bytes.length && bytes[end] !== 0) end += 1
	return bytes.subarray(offset, end)
}

/**
 * 快捷方式里的 ANSI 路径是按"系统 ANSI 代码页"写的（中文系统是 GBK）。
 * 这里按语言环境优先尝试对应代码页，失败再退回其它常见代码页。
 */
function createAnsiDecoders() {
	const names = []
	const lang = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : '').toLowerCase()
	if (lang.startsWith('zh-tw') || lang.startsWith('zh-hk') || lang.startsWith('zh-mo')) names.push('big5')
	else if (lang.startsWith('zh')) names.push('gbk')
	else if (lang.startsWith('ja')) names.push('shift_jis')
	else if (lang.startsWith('ko')) names.push('euc-kr')
	names.push('gbk', 'big5', 'shift_jis', 'euc-kr')

	const decoders = []
	for (const name of names) {
		try {
			decoders.push(new TextDecoder(name, { fatal: true }))
		} catch {
			/* 该环境不支持这个代码页，跳过 */
		}
	}
	try {
		decoders.push(new TextDecoder('windows-1252'))
	} catch {
		/* 忽略 */
	}
	return decoders
}

let cachedDecoders = null

function readAnsi(bytes, offset, limit) {
	if (offset <= 0 || offset >= limit) return ''
	const slice = readAnsiRaw(bytes, offset, limit)
	if (!slice.length) return ''
	if (!cachedDecoders) cachedDecoders = createAnsiDecoders()
	// 纯 ASCII 时所有代码页结果一致，直接快速返回
	let ascii = true
	for (let i = 0; i < slice.length; i += 1) {
		if (slice[i] > 0x7f) {
			ascii = false
			break
		}
	}
	if (ascii) return String.fromCharCode.apply(null, slice)
	for (const decoder of cachedDecoders) {
		try {
			return decoder.decode(slice)
		} catch {
			/* 换下一个代码页 */
		}
	}
	return String.fromCharCode.apply(null, slice)
}

function readUtf16(bytes, offset, limit) {
	let out = ''
	for (let i = offset; i + 1 < limit && i + 1 < bytes.length; i += 2) {
		const code = bytes[i] | (bytes[i + 1] << 8)
		if (code === 0) break
		out += String.fromCharCode(code)
	}
	return out
}

/** 读取一段 StringData：2 字节字符数 + 内容（按 IsUnicode 决定宽窄） */
function readStringData(view, bytes, pos, isUnicode) {
	if (pos + 2 > bytes.length) return { value: '', next: pos }
	const count = view.getUint16(pos, true)
	const start = pos + 2
	const byteLength = count * (isUnicode ? 2 : 1)
	const limit = start + byteLength
	const value = isUnicode ? readUtf16(bytes, start, limit) : readAnsi(bytes, start, limit)
	return { value, next: limit }
}

/**
 * 解析 .lnk
 * @returns {{
 *   target: string,            // 最佳猜测的目标路径（可能是本地路径或网络路径）
 *   localBasePath: string, commonPathSuffix: string,
 *   netName: string, relativePath: string, workingDir: string,
 *   name: string, iconLocation: string, arguments: string,
 *   isUnicode: boolean, hasLinkInfo: boolean, flags: number
 * }}
 */
export function parseShellLink(input) {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
	if (bytes.length < HEADER_SIZE + 4) throw new Error('不是有效的快捷方式文件')
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	if (view.getUint32(0, true) !== HEADER_SIZE) throw new Error('不是有效的快捷方式文件')

	const flags = view.getUint32(0x14, true)
	const isUnicode = (flags & FLAG.IsUnicode) !== 0
	let pos = HEADER_SIZE

	// LinkTargetIDList（这里不需要它的内容，按长度跳过）
	if (flags & FLAG.HasLinkTargetIDList) {
		if (pos + 2 > bytes.length) throw new Error('快捷方式数据不完整')
		const idListSize = view.getUint16(pos, true)
		pos += 2 + idListSize
	}

	let localBasePath = ''
	let commonPathSuffix = ''
	let netName = ''
	let hasLinkInfo = false

	if (flags & FLAG.HasLinkInfo) {
		if (pos + 0x1c > bytes.length) throw new Error('快捷方式数据不完整')
		const infoStart = pos
		const infoSize = view.getUint32(infoStart, true)
		const infoHeaderSize = view.getUint32(infoStart + 4, true)
		const infoFlags = view.getUint32(infoStart + 8, true)
		const localBasePathOffset = view.getUint32(infoStart + 0x10, true)
		const commonNetworkOffset = view.getUint32(infoStart + 0x14, true)
		const commonPathSuffixOffset = view.getUint32(infoStart + 0x18, true)
		const infoEnd = Math.min(bytes.length, infoStart + infoSize)
		hasLinkInfo = true

		let unicodeLocalOffset = 0
		let unicodeSuffixOffset = 0
		if (infoHeaderSize >= 0x24 && infoStart + 0x24 <= bytes.length) {
			unicodeLocalOffset = view.getUint32(infoStart + 0x1c, true)
			unicodeSuffixOffset = view.getUint32(infoStart + 0x20, true)
		}

		if (infoFlags & LINK_INFO_FLAG.VolumeIDAndLocalBasePath) {
			if (unicodeLocalOffset && infoStart + unicodeLocalOffset < infoEnd) {
				localBasePath = readUtf16(bytes, infoStart + unicodeLocalOffset, infoEnd)
			}
			if (!localBasePath && localBasePathOffset && infoStart + localBasePathOffset < infoEnd) {
				localBasePath = readAnsi(bytes, infoStart + localBasePathOffset, infoEnd)
			}
		}

		if (unicodeSuffixOffset && infoStart + unicodeSuffixOffset < infoEnd) {
			commonPathSuffix = readUtf16(bytes, infoStart + unicodeSuffixOffset, infoEnd)
		}
		if (!commonPathSuffix && commonPathSuffixOffset && infoStart + commonPathSuffixOffset < infoEnd) {
			commonPathSuffix = readAnsi(bytes, infoStart + commonPathSuffixOffset, infoEnd)
		}

		if (infoFlags & LINK_INFO_FLAG.CommonNetworkRelativeLinkAndPathSuffix && commonNetworkOffset) {
			const netStart = infoStart + commonNetworkOffset
			if (netStart + 0x0c <= infoEnd) {
				const nameOffset = view.getUint32(netStart, true)
				let unicodeNameOffset = 0
				if (nameOffset > 0x14 && netStart + 0x14 <= infoEnd) {
					unicodeNameOffset = view.getUint32(netStart + 0x0c, true)
				}
				if (unicodeNameOffset && netStart + unicodeNameOffset < infoEnd) {
					netName = readUtf16(bytes, netStart + unicodeNameOffset, infoEnd)
				}
				if (!netName && nameOffset && netStart + nameOffset < infoEnd) {
					netName = readAnsi(bytes, netStart + nameOffset, infoEnd)
				}
			}
		}

		pos = infoStart + (infoSize || 0x1c)
	}

	// 后面的 StringData（顺序固定）
	let name = ''
	let relativePath = ''
	let workingDir = ''
	let args = ''
	let iconLocation = ''
	if (flags & FLAG.HasName) {
		const parsed = readStringData(view, bytes, pos, isUnicode)
		name = parsed.value
		pos = parsed.next
	}
	if (flags & FLAG.HasRelativePath) {
		const parsed = readStringData(view, bytes, pos, isUnicode)
		relativePath = parsed.value
		pos = parsed.next
	}
	if (flags & FLAG.HasWorkingDir) {
		const parsed = readStringData(view, bytes, pos, isUnicode)
		workingDir = parsed.value
		pos = parsed.next
	}
	if (flags & FLAG.HasArguments) {
		const parsed = readStringData(view, bytes, pos, isUnicode)
		args = parsed.value
		pos = parsed.next
	}
	if (flags & FLAG.HasIconLocation) {
		const parsed = readStringData(view, bytes, pos, isUnicode)
		iconLocation = parsed.value
		pos = parsed.next
	}

	let target = ''
	if (netName) target = netName + commonPathSuffix
	else if (localBasePath) target = localBasePath + commonPathSuffix

	return {
		target,
		localBasePath,
		commonPathSuffix,
		netName,
		relativePath,
		workingDir,
		name,
		arguments: args,
		iconLocation,
		isUnicode,
		hasLinkInfo,
		flags,
	}
}

/** 目标路径的候选列表（按可信度排序），交给调用方逐个校验是否存在 */
export function shortcutTargetCandidates(parsed, linkPath = '') {
	const candidates = []
	const push = value => {
		if (!value) return
		const normalized = value.replace(/\//g, '\\').replace(/\\+$/, '')
		if (normalized && !candidates.includes(normalized)) candidates.push(normalized)
	}
	push(parsed.target)
	if (parsed.workingDir && parsed.relativePath) {
		const name = parsed.relativePath.split(/[\\/]/).pop()
		if (name) {
			const sep = parsed.workingDir.includes('\\') ? '\\' : '/'
			push(`${parsed.workingDir.replace(/[\\/]+$/, '')}${sep}${name}`)
		}
	}
	if (linkPath && parsed.relativePath && !/^[a-zA-Z]:/.test(parsed.relativePath) && !parsed.relativePath.startsWith('\\\\')) {
		const dir = linkPath.replace(/[\\/][^\\/]*$/, '')
		const sep = dir.includes('\\') ? '\\' : '/'
		push(`${dir}${sep}${parsed.relativePath.replace(/\//g, sep === '\\' ? '\\' : '/')}`)
	}
	return candidates
}

/* ------------------------------------------------------------------ *
 * LinkTargetIDList：快捷方式里另一处存放目标的地方（安装类快捷方式常见）
 * ------------------------------------------------------------------ */

/** “我的电脑”根节点的 GUID */
const MY_COMPUTER_GUID = '20d04fe0-3aea-1069-a2d8-08002b30309d'

function readGuid(bytes, offset) {
	if (offset + 16 > bytes.length) return ''
	const hex = []
	for (let i = 0; i < 16; i += 1) hex.push(bytes[offset + i].toString(16).padStart(2, '0'))
	// 前 4/2/2 字节是小端
	const part1 = `${hex[3]}${hex[2]}${hex[1]}${hex[0]}`
	const part2 = `${hex[5]}${hex[4]}`
	const part3 = `${hex[7]}${hex[6]}`
	const part4 = `${hex[8]}${hex[9]}`
	const part5 = hex.slice(10).join('')
	return `${part1}-${part2}-${part3}-${part4}-${part5}`
}

function joinPath(base, name) {
	if (!base) return name
	if (/^[a-zA-Z]:$/.test(base)) return `${base}\\${name}`
	return `${base.replace(/[\\/]+$/, '')}\\${name}`
}

/**
 * 从 IDList 重建目标路径（只处理“我的电脑”根开始的普通文件系统路径）
 * @returns {string} 失败返回空串
 */
export function resolveIdListPath(bytes, start, end, view) {
	const parts = []
	let base = ''
	let p = start
	let guard = 0
	while (p + 3 <= end && guard < 64) {
		guard += 1
		const itemSize = view.getUint16(p, true)
		if (!itemSize) break
		const type = bytes[p + 2]
		const itemEnd = Math.min(p + itemSize, end)
		if (type === 0x1f) {
			// 根节点：只认“我的电脑”，其它（回收站/网络等虚拟目录）放弃
			if (readGuid(bytes, p + 4) !== MY_COMPUTER_GUID) return ''
		} else if (type === 0x2f) {
			// 文件系统项：名字紧跟在类型字节之后，可能是整条绝对路径，也可能只是 "D:\"
			const name = readAnsi(bytes, p + 3, itemEnd) || readUtf16(bytes, p + 3, itemEnd)
			if (!name) return ''
			if (/^[a-zA-Z]:/.test(name) || name.startsWith('\\\\')) {
				base = name.replace(/\\+$/, '')
				parts.length = 0
			} else {
				base = joinPath(base, name)
			}
		} else if (type === 0x31 || type === 0x32) {
			// BEEF0004 目录/文件项：ANSI 名字在偏移 14，空终止
			const name = readAnsi(bytes, p + 14, itemEnd) || readUtf16(bytes, p + 14, itemEnd)
			if (!name) return ''
			base = joinPath(base, name)
		} else {
			// 不认识的节点类型，放弃（避免拼出错误路径）
			return ''
		}
		p += itemSize
	}
	return base
}

/* ------------------------------------------------------------------ *
 * ExtraData：环境变量路径（Windows 自带快捷方式常见）
 * ------------------------------------------------------------------ */

const SIG_ENVIRONMENT = 0xa0000001

export function resolveEnvTarget(bytes, start, end, view) {
	let p = start
	let guard = 0
	while (p + 8 <= end && guard < 64) {
		guard += 1
		const blockSize = view.getUint32(p, true)
		if (!blockSize) break
		const signature = view.getUint32(p + 4, true)
		const blockEnd = Math.min(p + blockSize, end)
		if (signature === SIG_ENVIRONMENT) {
			const payload = p + 8
			// TargetAnsi[260] + TargetUnicode[260]
			const ansi = readAnsi(bytes, payload, Math.min(payload + 260, blockEnd))
			const unicode = readUtf16(bytes, payload + 260, Math.min(payload + 260 + 520, blockEnd))
			const value = unicode || ansi
			if (value) return value
		}
		p += blockSize
	}
	return ''
}

/** 展开 %VAR%（大小写不敏感），未知变量保持原样 */
export function expandEnvVars(text, env = {}) {
	if (!text || !text.includes('%')) return text
	return text.replace(/%([^%]+)%/g, (match, name) => {
		const key = String(name).toLowerCase()
		for (const [envKey, envValue] of Object.entries(env)) {
			if (envKey.toLowerCase() === key && envValue) return String(envValue).replace(/[\\/]+$/, '')
		}
		return match
	})
}

/** 只取出环境变量数据块里的原始目标（可能形如 %windir%\system32\notepad.exe） */
export function extractEnvTarget(input) {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const flags = view.getUint32(0x14, true)
	const isUnicode = (flags & FLAG.IsUnicode) !== 0
	let pos = HEADER_SIZE
	if (flags & FLAG.HasLinkTargetIDList) {
		if (pos + 2 > bytes.length) return ''
		pos += 2 + view.getUint16(pos, true)
	}
	if (flags & FLAG.HasLinkInfo) {
		if (pos + 4 > bytes.length) return ''
		pos += view.getUint32(pos, true)
	}
	for (const bit of [FLAG.HasName, FLAG.HasRelativePath, FLAG.HasWorkingDir, FLAG.HasArguments, FLAG.HasIconLocation]) {
		if (flags & bit) {
			if (pos + 2 > bytes.length) return ''
			const count = view.getUint16(pos, true)
			pos += 2 + count * (isUnicode ? 2 : 1)
		}
	}
	return resolveEnvTarget(bytes, pos, bytes.length, view)
}

/**
 * 综合解析出快捷方式的目标路径
 * @param {Uint8Array} input .lnk 文件内容
 * @param {{ linkPath?: string, env?: Record<string,string>, envOverride?: string }} options
 *        envOverride：调用方已经展开好的环境变量路径（例如由 Rust 侧展开），优先级最高
 * @returns {{ target: string, source: string, raw: string, candidates: string[], parsed: object }}
 */
export function resolveShortcut(input, { linkPath = '', env = {}, envOverride = '' } = {}) {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const flags = view.getUint32(0x14, true)
	const isUnicode = (flags & FLAG.IsUnicode) !== 0
	let pos = HEADER_SIZE

	let idListRange = null
	if (flags & FLAG.HasLinkTargetIDList) {
		const idListSize = view.getUint16(pos, true)
		idListRange = [pos + 2, Math.min(pos + 2 + idListSize, bytes.length)]
		pos += 2 + idListSize
	}

	const parsed = parseShellLink(bytes)

	// StringData 之后就是 ExtraData
	if (flags & FLAG.HasLinkInfo) {
		pos += view.getUint32(pos, true)
	}
	for (const bit of [FLAG.HasName, FLAG.HasRelativePath, FLAG.HasWorkingDir, FLAG.HasArguments, FLAG.HasIconLocation]) {
		if (flags & bit) {
			const count = view.getUint16(pos, true)
			pos += 2 + count * (isUnicode ? 2 : 1)
		}
	}

	const candidates = []
	const push = (value, source) => {
		if (!value) return
		const normalized = value.replace(/\//g, '\\').replace(/\\+$/, '')
		if (normalized) candidates.push({ target: normalized, source })
	}

	// 1) LinkInfo（最可靠）
	push(parsed.target, 'linkinfo')
	// 2) 环境变量数据块（Windows 自带快捷方式，如 %windir%\system32\notepad.exe）
	const envRaw = resolveEnvTarget(bytes, pos, bytes.length, view)
	if (envRaw) {
		const expanded = envOverride || expandEnvVars(envRaw, env)
		if (expanded && !expanded.includes('%')) push(expanded, 'env')
		else if (expanded) candidates.push({ target: expanded, source: 'env-unresolved' })
	}
	// 3) LinkTargetIDList
	if (idListRange) {
		const fromIdList = resolveIdListPath(bytes, idListRange[0], idListRange[1], view)
		if (fromIdList) push(fromIdList, 'idlist')
	}
	// 4) 相对路径 / 工作目录
	for (const candidate of shortcutTargetCandidates(parsed, linkPath)) push(candidate, 'relative')

	const seen = new Set()
	const unique = candidates.filter(item => {
		const key = item.target.toLowerCase()
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
	const best = unique.find(item => item.source !== 'env-unresolved') || unique[0] || { target: '', source: 'none' }
	return {
		target: best.target,
		source: best.source,
		raw: envRaw || '',
		parsed,
		candidates: unique.map(item => item.target),
		detailed: unique,
	}
}
