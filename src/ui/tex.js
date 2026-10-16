import katex from 'katex'

export const katexInline = tex => katex.renderToString(tex, { throwOnError: false })
export const katexBlock = tex => katex.renderToString(tex, { throwOnError: false, displayMode: true })
