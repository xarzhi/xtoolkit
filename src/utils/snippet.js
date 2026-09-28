/**
 * VS Code 代码片段（snippets）生成（纯函数，可单独测试）
 *
 * 参考 snippet-generator.app 的输出格式：
 * {
 *   "Snippet name": {
 *     "prefix": "trigger",
 *     "body": ["第一行", "第二行"],
 *     "description": "...",
 *     "scope": "javascript,typescript"
 *   }
 * }
 */

/**
 * 转义片段正文：
 * - `\` -> `\\`
 * - `}` -> `\}`（VS Code 里裸的右花括号也要转义）
 * - `$` -> `\$`；开启 keepPlaceholders 时保留 `${...}` 与 `$1` 这类占位符语法
 *   （注意：不把 `$word` 当变量保留，因为粘贴的代码里 $HOME 这类更可能是字面量）
 */
export function escapeSnippetBodyLine(line, { keepPlaceholders = true, escapeBrace = true } = {}) {
	let text = String(line ?? '').replace(/\\/g, '\\\\')

	if (!keepPlaceholders) {
		text = text.replace(/\$/g, '\\$')
		if (escapeBrace) text = text.replace(/\}/g, '\\}')
		return text
	}

	// 先保护占位符，再转义其它字符，最后还原（否则占位符里的 } 会被误转义）
	const placeholders = []
	text = text.replace(/\$\{[^}]*\}|\$[0-9]+/g, match => {
		placeholders.push(match)
		return `\u0000${placeholders.length - 1}\u0000`
	})
	text = text.replace(/\$/g, '\\$')
	if (escapeBrace) text = text.replace(/\}/g, '\\}')
	text = text.replace(/\u0000(\d+)\u0000/g, (_, index) => placeholders[Number(index)])
	return text
}

export const COMMON_SCOPES = [
	{ label: 'JavaScript', value: 'javascript' },
	{ label: 'TypeScript', value: 'typescript' },
	{ label: 'JavaScript React', value: 'javascriptreact' },
	{ label: 'TypeScript React', value: 'typescriptreact' },
	{ label: 'Vue', value: 'vue' },
	{ label: 'HTML', value: 'html' },
	{ label: 'CSS / SCSS / LESS', value: 'css,scss,less' },
	{ label: 'JSON', value: 'json,jsonc' },
	{ label: 'Markdown', value: 'markdown' },
	{ label: 'Python', value: 'python' },
	{ label: 'Java', value: 'java' },
	{ label: 'C#', value: 'csharp' },
	{ label: 'C / C++', value: 'c,cpp' },
	{ label: 'Go', value: 'go' },
	{ label: 'Rust', value: 'rust' },
	{ label: 'PHP', value: 'php' },
	{ label: 'Shell', value: 'shellscript' },
	{ label: 'SQL', value: 'sql' },
	{ label: '纯文本（所有语言）', value: 'plaintext' },
]

/**
 * 生成 VS Code 片段 JSON
 * @param {{ name?: string, prefix?: string, description?: string, scope?: string, body?: string,
 *          keepPlaceholders?: boolean, escapeBrace?: boolean, asArray?: boolean, indent?: number }} options
 * @returns {{ json: string, bodyLines: string[], object: object }}
 */
export function generateSnippet(options = {}) {
	const {
		name = 'my-snippet',
		prefix = '',
		description = '',
		scope = '',
		body = '',
		keepPlaceholders = true,
		escapeBrace = true,
		asArray = true,
		indent = 2,
	} = options

	const rawLines = String(body).replace(/\r\n?/g, '\n').split('\n')
	// 去掉末尾多余的空行（编辑器里最后那个换行不算内容）
	while (rawLines.length > 1 && rawLines[rawLines.length - 1] === '') rawLines.pop()
	const bodyLines = rawLines.map(line => escapeSnippetBodyLine(line, { keepPlaceholders, escapeBrace }))

	const snippetKey = String(name || prefix || 'my-snippet').trim() || 'my-snippet'
	const entry = { prefix: String(prefix ?? '') }
	entry.body = asArray ? bodyLines : bodyLines.join('\n')
	if (description) entry.description = description
	if (scope) entry.scope = scope

	const object = { [snippetKey]: entry }
	return {
		json: JSON.stringify(object, null, indent),
		bodyLines,
		object,
	}
}

/** 生成的 JSON 是否看起来合法（面板里做即时校验用） */
export function validateSnippetJson(json) {
	try {
		const parsed = JSON.parse(json)
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: '顶层必须是对象' }
		const keys = Object.keys(parsed)
		if (!keys.length) return { ok: false, error: '至少需要一个片段' }
		for (const key of keys) {
			const item = parsed[key]
			if (!item || typeof item !== 'object') return { ok: false, error: `${key} 必须是对象` }
			if (!('prefix' in item)) return { ok: false, error: `${key} 缺少 prefix` }
			if (!('body' in item)) return { ok: false, error: `${key} 缺少 body` }
		}
		return { ok: true, count: keys.length }
	} catch (err) {
		return { ok: false, error: err.message }
	}
}
