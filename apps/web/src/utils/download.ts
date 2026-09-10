/**
 * 下载工具：Markdown 单文件下载 / Skill 压缩包打包下载 / 上传压缩包解析
 *
 * 下载用原生 Blob + a[download]，不引入额外依赖；压缩用 JSZip（前端打包）。
 */
import JSZip from 'jszip'

/** 触发浏览器下载 */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 稍后释放，避免部分浏览器下载中断
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 安全文件名：去掉路径分隔符与控制字符 */
export function safeFileName(name: string, fallback = 'untitled'): string {
  const cleaned = name.replace(/[\\/:*?"<>|\n\r\t]/g, '').trim()
  return cleaned || fallback
}

/** 下载 CSV（首行表头，补 BOM 便于 Excel 正确识别中文） */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  saveBlob(blob, `${safeFileName(filename)}.csv`)
}

/** 下载提示词为 .md 文件 */
export function downloadMarkdown(name: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  saveBlob(blob, `${safeFileName(name)}.md`)
}

/** 把技能打包为 zip：SKILL.md + 目录说明 */
export async function downloadSkillZip(item: { name: string; summary: string; content: string; version?: string; tags?: string[] }) {
  const zip = new JSZip()
  const folderName = safeFileName(item.name, 'skill')
  const folder = zip.folder(folderName) ?? zip
  folder.file('SKILL.md', item.content)
  const readme = [
    `# ${item.name}`,
    '',
    item.summary || '',
    '',
    `版本：${item.version ?? '1.0.0'}`,
    item.tags?.length ? `标签：${item.tags.join('、')}` : '',
    '',
    '## 目录说明',
    '- SKILL.md：技能主文档（含 YAML frontmatter）',
    '- scripts/：可选，放置可执行脚本',
    '- references/：可选，放置参考资料与模板',
    '',
    '> 由 OpenSchedule 智能协助导出',
  ]
    .filter(Boolean)
    .join('\n')
  folder.file('README.md', readme)
  const blob = await zip.generateAsync({ type: 'blob' })
  saveBlob(blob, `${folderName}.zip`)
}

/**
 * 解析用户上传的技能包，取出 SKILL.md 内容。
 * 支持 .md/.txt 纯文本，以及 .zip（内部任意层级的 SKILL.md，找不到则取第一个 .md）。
 */
export async function parseSkillFile(file: File): Promise<string> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file)
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir)
    const skillMd = names.find((n) => n.toLowerCase().endsWith('skill.md'))
    const anyMd = names.find((n) => n.toLowerCase().endsWith('.md'))
    const target = skillMd ?? anyMd
    if (!target) throw new Error('压缩包内未找到 SKILL.md 或任何 Markdown 文件')
    return zip.files[target].async('string')
  }
  return file.text()
}
