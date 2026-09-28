/**
 * 把各工具页里写死的浅色颜色换成 CSS 变量（明暗主题共用）。
 * 只做行内等值替换，浅色主题下颜色与原来完全一致；保留原编码与换行符。
 *   node scripts/theme-tokens.mjs --dry   只统计
 *   node scripts/theme-tokens.mjs         实际写入
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const dry = process.argv.includes('--dry')

const RULES = [
	{ re: /color:\s*#262626\b/g, to: 'color: var(--text-color)' },
	{ re: /color:\s*#333\b/g, to: 'color: var(--text-color)' },
	{ re: /color:\s*#1f1f1f\b/g, to: 'color: var(--text-color)' },
	{ re: /color:\s*rgba\(0,\s*0,\s*0,\s*0\.6(5)?\)/g, to: 'color: var(--text-color-3)' },
	{ re: /color:\s*rgba\(0,\s*0,\s*0,\s*0\.45\)/g, to: 'color: var(--text-color-2)' },
	{ re: /border:\s*1px solid rgba\(0,\s*0,\s*0,\s*0\.08\)/g, to: 'border: 1px solid var(--border-color)' },
	{ re: /border:\s*1px solid #d9d9d9\b/g, to: 'border: 1px solid var(--panel-border)' },
]

const files = globSync(['**/*.vue', '**/*.scss'], { cwd: SRC }).map(f => join(SRC, f))
let changed = 0
for (const file of files) {
	const before = readFileSync(file, 'utf8')
	let after = before
	const hits = []
	for (const { re, to } of RULES) {
		const found = after.match(re)
		if (found) hits.push(`${found.length}x ${to}`)
		after = after.replace(re, to)
	}
	if (after !== before) {
		changed += 1
		console.log(`${dry ? '[dry] ' : ''}${relative(ROOT, file)}  ->  ${hits.join(', ')}`)
		if (!dry) writeFileSync(file, after, 'utf8')
	}
}
console.log(`\n${changed} 个文件${dry ? '（未写入）' : '已更新'}`)
