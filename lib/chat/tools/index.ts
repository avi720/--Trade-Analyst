/**
 * P1-C — tool registry. Turns the per-mode tool list into the two things the
 * Gemini loop needs: a flat array of function declarations, and a single
 * `execute(name, args)` dispatcher.
 */

import type { ChatContextMode } from '@/lib/chat/context-builder'
import type { ChatToolRuntime } from '@/lib/chat/gemini-client'
import { queryTradesTool } from './query-trades'
import { aggregationTools } from './aggregations'
import { toolsForMode, type ChatTool, type ToolContext } from './types'

export const ALL_CHAT_TOOLS: ChatTool[] = [queryTradesTool, ...aggregationTools]

export function buildToolRuntime(mode: ChatContextMode, ctx: ToolContext): ChatToolRuntime {
  const tools = toolsForMode(ALL_CHAT_TOOLS, mode)
  const byName = new Map(tools.map(t => [t.name, t]))

  return {
    declarations: tools.map(t => t.declaration),
    async execute(name, args) {
      const tool = byName.get(name)
      // Reachable if the model hallucinates a tool name, or names one that is
      // gated out of this mode. Both are answerable — hand the model a usable
      // error instead of throwing, so it can pick a real tool and continue.
      if (!tool) {
        return {
          error: `הכלי "${name}" אינו זמין במצב הנוכחי.`,
          availableTools: tools.map(t => t.name),
        }
      }
      return await tool.execute(args, ctx)
    },
  }
}

export function toolNamesForMode(mode: ChatContextMode): string[] {
  return toolsForMode(ALL_CHAT_TOOLS, mode).map(t => t.name)
}

export type { ChatTool, ToolContext } from './types'
