/**
 * Robust JSON extraction — handles markdown fences, trailing text, and truncated LLM responses.
 * Shared across publisher-llm, publisher-graph, narrative-analyst, and all brain graphs.
 */
export function extractJson<T>(text: string, label?: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try { return JSON.parse(cleaned) as T } catch { /* fall through */ }

  const start = cleaned.search(/[{[]/)
  if (start === -1) {
    if (label) console.warn(`[${label}] No JSON object found:\n${cleaned.slice(0, 300)}`)
    return null
  }

  const opener = cleaned[start]
  const closer = opener === '{' ? '}' : ']'
  let depth = 0, inString = false, escape = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === opener) depth++
    else if (ch === closer) depth--
    if (depth === 0) {
      try { return JSON.parse(cleaned.slice(start, i + 1)) as T } catch { break }
    }
  }

  // Last resort: try to repair truncated JSON by closing open brackets
  try {
    const fragment = cleaned.slice(start)
    const opens = (fragment.match(/\{/g) ?? []).length - (fragment.match(/\}/g) ?? []).length
    const arrOpens = (fragment.match(/\[/g) ?? []).length - (fragment.match(/\]/g) ?? []).length
    const repaired = fragment + ']'.repeat(Math.max(0, arrOpens)) + '}'.repeat(Math.max(0, opens))
    return JSON.parse(repaired) as T
  } catch {
    if (label) console.warn(`[${label}] All JSON extraction attempts failed:\n${cleaned.slice(0, 500)}`)
    return null
  }
}
