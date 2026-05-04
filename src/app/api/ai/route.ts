import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables.' }, { status: 500 })
  }

  const { messages, subadminId } = await req.json()

  // ── Load context: players + their pending bets ──────────────────
  const players = await prisma.user.findMany({
    where: { role: 'PLAYER', createdById: subadminId },
    include: {
      bets: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  })

  const playerContext = players.map(p => {
    const pending = p.bets.filter(b => b.status === 'PENDING')
    const pendingStake = pending.filter(b => !b.parlayId || b.parlayOrder === 1).reduce((s, b) => s + b.amount, 0)
    return {
      id: p.id,
      name: p.name,
      username: p.username,
      balance: p.balance,
      availableBalance: p.balance - pendingStake,
      pendingBets: pending.length,
      recentBets: p.bets.slice(0, 10).map(b => ({
        id: b.id,
        match: b.match,
        betType: b.betType,
        amount: b.amount,
        odds: b.odds,
        potential: b.potentialReturn,
        status: b.status,
        notes: b.notes,
        createdAt: b.createdAt.toISOString().split('T')[0],
      })),
    }
  })

  const systemPrompt = `You are an AI assistant for a sports betting ledger management system called BetLedger.
You help the subadmin manage their players, track bets, and analyse their book.

Current players under this subadmin:
${JSON.stringify(playerContext, null, 2)}

You can:
1. Answer questions about players (balance, bet history, stats)
2. Analyse exposure and risk (e.g. who has the biggest open position)
3. Place bets for players using the place_bet tool

When placing a bet, always confirm the details before calling the tool.
If the user says something like "place 50 on Barça over 2.5 for Nikos", extract:
- player: match by name (fuzzy), use their id
- match: e.g. "Barcelona vs Real Madrid"
- betType: e.g. "Over 2.5"
- amount: 50
- odds: ask if not provided, or use a reasonable default and mention it

Always respond in the same language the user writes in (Greek or English).
Be concise. Use € for amounts. Keep responses short and to the point.`

  const tools: Anthropic.Tool[] = [
    {
      name: 'place_bet',
      description: 'Place a single bet for a player. Only call this after confirming details with the user.',
      input_schema: {
        type: 'object' as const,
        properties: {
          playerId: { type: 'string', description: 'The player\'s id' },
          playerName: { type: 'string', description: 'The player\'s display name (for confirmation)' },
          match: { type: 'string', description: 'Match name e.g. "Barcelona vs Real Madrid"' },
          betType: { type: 'string', description: 'e.g. "Over 2.5", "1", "BTTS Yes"' },
          amount: { type: 'number', description: 'Stake in euros' },
          odds: { type: 'number', description: 'Decimal odds e.g. 1.85' },
          notes: { type: 'string', description: 'Optional notes' },
        },
        required: ['playerId', 'playerName', 'match', 'betType', 'amount', 'odds'],
      },
    },
  ]

  // ── Run Claude with possible tool loop ───────────────────────────
  const apiMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  let response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    tools,
    messages: apiMessages,
  })

  // Handle tool use
  if (response.stop_reason === 'tool_use') {
    const toolUseBlock = response.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock
    const toolResult: Record<string, unknown> = {}

    if (toolUseBlock.name === 'place_bet') {
      const input = toolUseBlock.input as {
        playerId: string; playerName: string; match: string
        betType: string; amount: number; odds: number; notes?: string
      }
      try {
        const potentialReturn = input.amount * input.odds
        await prisma.bet.create({
          data: {
            userId: input.playerId,
            match: input.match,
            betType: input.betType,
            amount: input.amount,
            odds: input.odds,
            potentialReturn,
            notes: input.notes || null,
            status: 'PENDING',
          },
        })
        // Deduct from balance
        await prisma.user.update({
          where: { id: input.playerId },
          data: { balance: { decrement: input.amount } },
        })
        toolResult.success = true
        toolResult.message = `Bet placed: ${input.playerName} — ${input.match} | ${input.betType} | €${input.amount} @ ${input.odds}x → €${potentialReturn.toFixed(2)} potential`
      } catch (err) {
        toolResult.success = false
        toolResult.error = String(err)
      }
    }

    // Continue conversation with tool result
    const followUp = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 512,
      system: systemPrompt,
      tools,
      messages: [
        ...apiMessages,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: JSON.stringify(toolResult) }],
        },
      ],
    })
    response = followUp
  }

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('\n')

  return NextResponse.json({ reply: text, betPlaced: response.stop_reason !== 'tool_use' && text.includes('placed') })
}
