/**
 * 智能协助：AI 生成引擎
 *
 * 双通道设计：
 * 1. 团队管理员在「设置 → AI 模型」配置后，经后端调用真实模型（与 AI 规则页共用 callAgent）。
 * 2. 未配置或调用失败时，使用本地模板生成器产出结构化骨架，界面会标注「模拟生成」，
 *    保证离线演示可用；接入真实模型时上层组件无需改动。
 */
import { callAgent } from '@/utils/aiRules'

export interface GenerateResult {
  content: string
  /** 产出来源：真实模型 / 本地模拟 */
  source: 'agent' | 'local'
  /** 实际发送给模型的完整提示词，便于调试与查看 */
  prompt: string
}

/** 构造「生成提示词」的请求：Meta 提示词 + 用户需求 */
function buildPromptRequest(requirement: string, metaPrompt: string): string {
  return `${metaPrompt}

---

【本次的用户需求】
${requirement}

---

请严格依据上述八大核心规范输出结构化提示词。若缺少必要信息，先列出需要确认的问题，再给出基于合理假设的初稿。直接输出提示词正文，不要输出任何解释性前言。`
}

/** 构造「生成技能」的请求：MetaSkill 规范 + 用户需求 */
function buildSkillRequest(requirement: string, metaSkillContent: string): string {
  return `你是一个技能（Skill）编写专家。请严格遵循以下「技能编写元规范」，根据用户的需求编写一个新的 SKILL.md。

===== 技能编写元规范（MetaSkill） =====
${metaSkillContent}
===== 元规范结束 =====

【本次的用户需求】
${requirement}

---

请直接输出完整的 SKILL.md 内容（包含 YAML frontmatter），不要输出任何解释性前言与代码块包裹之外的说明。`
}

/** 本地模拟：按八大规范生成结构化提示词骨架 */
function localPromptTemplate(requirement: string): string {
  const brief = requirement.trim().slice(0, 120) || '（请补充你的具体需求）'
  return `# 角色
你是【${brief}】领域的资深专家，负责高质量完成下述任务。

## 上下文
- 任务背景：${brief}
- 目标用户：（请补充：这份产出给谁看）
- 已有资料：（请补充：可参考的文档、数据或约束）

> 说明：以上信息如缺失，请先追问确认，再执行后续步骤。

## 详细指令
1. 明确本次任务的交付物与完成标准。
2. 梳理完成任务所需的输入与前置条件。
3. 按步骤完成任务，每一步都要产出可验证的中间结果。
4. 自检产出是否满足完成标准，不满足则回到对应步骤修正。
5. 输出最终结果，并附一句「需要你确认的点」。

## 约束与边界
- 只使用提供的上下文信息，缺失的信息一律标注「未提供」。
- 不使用模糊表述（如「尽量」「适当」），结论必须具体可执行。
- 输出聚焦任务本身，不展开与任务无关的内容。
- 篇幅：控制在 800 字以内，除非另有要求。

## 示例
输入：（一个典型的输入示例）
输出：（对应的期望输出示例）

## 输出格式
\`\`\`markdown
## 结论
（一句话结论）

## 详细内容
（分点展开）

## 待确认
（需要用户补充的信息）
\`\`\`

## 关键要求重申
严格按上述输出格式产出；信息不足时先追问，绝不臆造内容。

## 防幻觉与准确性
- 不知道就明确回答「我不知道」。
- 回答前先逐步推理，再给出结论。
- 仅在有充分依据时才下结论。
- 引用上下文中的原始信息作为依据。`
}

/** 本地模拟：按 MetaSkill 规范生成 SKILL.md 骨架 */
function localSkillTemplate(requirement: string): string {
  const brief = requirement.trim() || '（请补充你的技能需求）'
  const slug = brief
    .toLowerCase()
    .replace(/[^\w一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'my-skill'
  const name = brief.slice(0, 20).replace(/[^\w一-龥]+/g, '') || 'new-skill'
  return `---
name: ${slug || 'my-skill'}
description: ${brief} —— 当用户需要完成该任务时使用，输出结构化结果
---

# ${name || '新技能'}

## 用途
${brief}

## 适用场景
- 用户明确提出上述需求时
- 需要复用该流程以提高一致性时
- （请补充其他触发场景）

## 输入
| 输入项 | 说明 | 必填 |
| --- | --- | --- |
| 任务描述 | ${brief} | 是 |
| 约束条件 | 格式、范围、风格等限制 | 否 |

## 执行步骤
1. 明确交付物与完成标准。
2. 校验输入是否完整，缺失则列出缺失项并停止。
3. 按流程完成任务，每步产出可验证的中间结果。
4. 按输出格式整理结果并自检。
5. 输出最终结果，附「待确认」清单。

## 输出格式
\`\`\`markdown
## 结果
（核心产出）

## 过程说明
（关键步骤简述）

## 待确认
（需要用户补充的信息）
\`\`\`

## 约束与边界
- 仅使用给定输入的信息，缺失时明确标注，禁止编造。
- 步骤必须可执行、可验证，避免空泛描述。
- 如遇无法处理的情况，说明原因并给出替代建议。

## 示例
输入：（典型输入）
输出：（期望输出）

## 检查清单
- [ ] 交付物明确
- [ ] 输入已校验
- [ ] 输出格式符合规范
- [ ] 无编造内容`
}

/** 生成结构化提示词 */
export async function generateStructuredPrompt(
  requirement: string,
  metaPrompt: string,
): Promise<GenerateResult> {
  const prompt = buildPromptRequest(requirement, metaPrompt)
  try {
    const text = await callAgent(prompt)
    if (text && text.trim()) return { content: text.trim(), source: 'agent', prompt }
  } catch {
    // 团队未配置模型或调用失败，回退本地模板
  }
  return { content: localPromptTemplate(requirement), source: 'local', prompt }
}

/** 基于 MetaSkill 生成技能 */
export async function generateSkill(
  requirement: string,
  metaSkillContent: string,
): Promise<GenerateResult> {
  const prompt = buildSkillRequest(requirement, metaSkillContent)
  try {
    const text = await callAgent(prompt)
    if (text && text.trim()) return { content: stripCodeFence(text.trim()), source: 'agent', prompt }
  } catch {
    // 回退本地模板
  }
  return { content: localSkillTemplate(requirement), source: 'local', prompt }
}

/** 去掉模型输出外层可能包裹的代码围栏 */
function stripCodeFence(text: string): string {
  const m = text.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/)
  return m ? m[1] : text
}
