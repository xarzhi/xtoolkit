/**
 * 纯 JS 的 MD5 实现（不引第三方库）
 *
 * 说明：MD5 是单向散列，不存在"解密"，本工具提供的是
 * 计算摘要 + 与已知摘要比对校验 + 内置常见口令反查。
 */

const SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]

/** K[i] = floor(abs(sin(i+1)) * 2^32) */
const K = new Int32Array(64)
for (let i = 0; i < 64; i += 1) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)

const toUtf8 = input => {
	if (input instanceof Uint8Array) return input
	return new TextEncoder().encode(String(input ?? ''))
}

const int32ToHexLE = value => {
	let out = ''
	for (let i = 0; i < 4; i += 1) {
		out += ((value >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')
	}
	return out
}

/**
 * 计算字节数组的 MD5
 * @param {Uint8Array} input
 * @returns {string} 32 位小写十六进制
 */
export function md5Bytes(input) {
	const bytes = toUtf8(input)
	const len = bytes.length
	// 填充：0x80 + 若干 0，使长度 ≡ 56 (mod 64)，末尾 8 字节放原始比特长度
	const padded = new Uint8Array((((len + 8) >> 6) + 1) * 64)
	padded.set(bytes)
	padded[len] = 0x80

	const view = new DataView(padded.buffer)
	const bitLen = len * 8
	view.setUint32(padded.length - 8, bitLen >>> 0, true)
	view.setUint32(padded.length - 4, Math.floor(bitLen / 4294967296) >>> 0, true)

	let a0 = 0x67452301
	let b0 = 0xefcdab89
	let c0 = 0x98badcfe
	let d0 = 0x10325476
	const M = new Int32Array(16)

	for (let offset = 0; offset < padded.length; offset += 64) {
		for (let j = 0; j < 16; j += 1) M[j] = view.getInt32(offset + j * 4, true)

		let A = a0
		let B = b0
		let C = c0
		let D = d0

		for (let i = 0; i < 64; i += 1) {
			let F
			let g
			if (i < 16) {
				F = (B & C) | (~B & D)
				g = i
			} else if (i < 32) {
				F = (D & B) | (~D & C)
				g = (5 * i + 1) % 16
			} else if (i < 48) {
				F = B ^ C ^ D
				g = (3 * i + 5) % 16
			} else {
				F = C ^ (B | ~D)
				g = (7 * i) % 16
			}
			const sum = (F + A + K[i] + M[g]) | 0
			A = D
			D = C
			C = B
			const shift = SHIFTS[(i >> 4) * 4 + (i % 4)]
			B = (B + ((sum << shift) | (sum >>> (32 - shift)))) | 0
		}

		a0 = (a0 + A) | 0
		b0 = (b0 + B) | 0
		c0 = (c0 + C) | 0
		d0 = (d0 + D) | 0
	}

	return int32ToHexLE(a0) + int32ToHexLE(b0) + int32ToHexLE(c0) + int32ToHexLE(d0)
}

/** 计算字符串的 MD5（32 位小写） */
export function md5(input) {
	return md5Bytes(toUtf8(input))
}

/** 16 位形式 = 32 位中间的 8~24 位 */
export const toShortMd5 = hash => (hash || '').slice(8, 24)

/**
 * 内置常见弱口令表（用于"反查"演示：命中说明这个摘要对应的就是常见口令）
 * 只收录极其常见的测试/弱口令，属于常规的弱口令自查能力。
 */
const COMMON_WORDS = [
	'123456', '123456789', '12345678', '1234567', '12345', '111111', '000000', '123123',
	'qwerty', 'abc123', 'password', 'admin', 'root', 'iloveyou', '888888', '666666',
	'5201314', 'woaini', 'admin123', 'test', 'test123', 'guest', 'letmein', 'welcome',
	'qwerty123', 'a123456', '123qwe', 'zxcvbnm', 'asdfgh', '1qaz2wsx', '1', '12', '123',
	'a', 'aa', 'aaa', 'abc', 'abcd', 'abcdef', 'pass', 'passw0rd', 'p@ssw0rd', 'secret',
	'admin888', 'root123', 'system', 'manager', 'super', 'hello', 'hello123', 'monkey',
	'dragon', 'football', 'baseball', 'sunshine', 'princess', 'shadow', 'master', '666888',
]

let commonIndex = null
/** 惰性构建 摘要 → 明文 的索引 */
const getCommonIndex = () => {
	if (commonIndex) return commonIndex
	commonIndex = new Map()
	for (const word of COMMON_WORDS) commonIndex.set(md5(word), word)
	return commonIndex
}

/** 在常见弱口令里反查摘要，命中返回明文，否则返回空串 */
export function lookupCommon(hash) {
	const key = String(hash || '').trim().toLowerCase()
	if (key.length === 32) return getCommonIndex().get(key) || ''
	if (key.length === 16) {
		for (const [full, word] of getCommonIndex()) {
			if (toShortMd5(full) === key) return word
		}
	}
	return ''
}
