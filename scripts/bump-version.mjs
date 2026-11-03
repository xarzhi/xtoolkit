#!/usr/bin/env node
/**
 * 一条命令改版本号，同步三个地方：
 *   - package.json                 (npm 侧版本)
 *   - src-tauri/tauri.conf.json    (打包真正读取的版本：exe 属性 / 安装包名 / 升级判断)
 *   - src-tauri/Cargo.toml         ([package] 下的 Rust crate 版本)
 *
 * 用法：
 *   pnpm version:bump 0.2.0     指定版本
 *   pnpm version:bump patch     0.1.0 -> 0.1.1
 *   pnpm version:bump minor     0.1.0 -> 0.2.0
 *   pnpm version:bump major     0.1.0 -> 1.0.0
 *   pnpm version:bump 0.2.0 --dry   只看会改什么，不落盘
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG = path.join(ROOT, 'package.json')
const TAURI = path.join(ROOT, 'src-tauri', 'tauri.conf.json')
const CARGO = path.join(ROOT, 'src-tauri', 'Cargo.toml')

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const target = args.find(a => !a.startsWith('-'))

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

function fail(msg) {
	console.error(`\n✖ ${msg}\n`)
	process.exit(1)
}

if (!target) fail('缺少版本号，例：pnpm version:bump 0.2.0（也支持 patch / minor / major）')

const pkgRaw = readFileSync(PKG, 'utf8')
const pkg = JSON.parse(pkgRaw)
const current = pkg.version || '0.0.0'
console.log(`当前版本：${current}`)

let next
if (['patch', 'minor', 'major'].includes(target)) {
	const [ma, mi, pa] = current.split('-')[0].split('.').map(n => parseInt(n, 10) || 0)
	next = target === 'major' ? `${ma + 1}.0.0` : target === 'minor' ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`
} else {
	if (!SEMVER.test(target)) fail(`版本号格式不对：${target}（要 x.y.z，例 0.2.0）`)
	next = target
}

if (next === current) {
	console.log(`已经是 ${next}，无需修改。`)
	process.exit(0)
}

const changes = []

// 1) package.json —— 保留原来的缩进与结尾换行
const indent = (pkgRaw.match(/^[ \t]+"/m) || ['  '])[0].replace(/".*/, '')
const nl = pkgRaw.endsWith('\n') ? '\n' : ''
const pkgOut = JSON.stringify({ ...pkg, version: next }, null, indent.length ? indent : 2) + nl
changes.push([PKG, pkgOut])

// 2) tauri.conf.json —— 只替换顶层第一个 "version" 字段，其余格式原样不动
const tauriRaw = readFileSync(TAURI, 'utf8')
const tauriRe = /("version"\s*:\s*")([^"]*)(")/
if (!tauriRe.test(tauriRaw)) fail('tauri.conf.json 里没找到 "version" 字段')
const tauriOut = tauriRaw.replace(tauriRe, `$1${next}$3`)
changes.push([TAURI, tauriOut])

// 3) Cargo.toml —— 只改 [package] 段里的那一个 version
const cargoRaw = readFileSync(CARGO, 'utf8')
const pkgIdx = cargoRaw.indexOf('[package]')
if (pkgIdx < 0) fail('Cargo.toml 里没找到 [package] 段')
const head = cargoRaw.slice(0, pkgIdx)
let tail = cargoRaw.slice(pkgIdx)
const cargoRe = /(\nversion\s*=\s*")([^"]*)(")/
if (!cargoRe.test(tail)) fail('Cargo.toml 的 [package] 段里没找到 version')
tail = tail.replace(cargoRe, `$1${next}$3`)
changes.push([CARGO, head + tail])

for (const [file, content] of changes) {
	const rel = path.relative(ROOT, file)
	if (dry) {
		console.log(`  [dry] 会写入 ${rel}`)
	} else {
		writeFileSync(file, content, 'utf8')
		console.log(`  ✔ ${rel}`)
	}
}

console.log(`\n${dry ? '（未落盘）' : '完成'}：${current} → ${next}`)
console.log(`打包产物将变成：`)
console.log(`  src-tauri/target/release/bundle/msi/xtools_${next}_x64_en-US.msi`)
console.log(`  src-tauri/target/release/bundle/nsis/xtools_${next}_x64-setup.exe`)
console.log(`\n接下来：pnpm tauri build`)
