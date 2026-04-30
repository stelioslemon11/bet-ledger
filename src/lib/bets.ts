import { prisma } from '@/lib/db'

/**
 * Evaluate whether a bet type WON given full-time and optional halftime goals.
 * Returns null if the bet type is not recognised or not yet decidable.
 */
export function evaluateBetResult(
  betType: string,
  homeGoals: number,
  awayGoals: number,
  htHome?: number,
  htAway?: number,
): boolean | null {
  const total = homeGoals + awayGoals
  const bt = betType.toLowerCase().trim()

  // ── 1X2 / Result ──────────────────────────────────────────────
  if (bt === '1') return homeGoals > awayGoals
  if (bt === 'x') return homeGoals === awayGoals
  if (bt === '2') return awayGoals > homeGoals
  if (bt === '1x') return homeGoals >= awayGoals           // double chance: home or draw
  if (bt === 'x2') return awayGoals >= homeGoals           // double chance: draw or away
  if (bt === '12') return homeGoals !== awayGoals          // double chance: home or away

  // ── Over / Under (full-time) ───────────────────────────────────
  if (/over\s*0\.5/.test(bt)  && !/ht/.test(bt)) return total > 0.5
  if (/under\s*0\.5/.test(bt) && !/ht/.test(bt)) return total < 0.5
  if (/over\s*1\.5/.test(bt)  && !/ht/.test(bt)) return total > 1.5
  if (/under\s*1\.5/.test(bt) && !/ht/.test(bt)) return total < 1.5
  if (/over\s*2\.5/.test(bt)  && !/ht/.test(bt)) return total > 2.5
  if (/under\s*2\.5/.test(bt) && !/ht/.test(bt)) return total < 2.5
  if (/over\s*3\.5/.test(bt)  && !/ht/.test(bt)) return total > 3.5
  if (/under\s*3\.5/.test(bt) && !/ht/.test(bt)) return total < 3.5
  if (/over\s*4\.5/.test(bt)  && !/ht/.test(bt)) return total > 4.5
  if (/under\s*4\.5/.test(bt) && !/ht/.test(bt)) return total < 4.5
  if (/over\s*5\.5/.test(bt)  && !/ht/.test(bt)) return total > 5.5
  if (/under\s*5\.5/.test(bt) && !/ht/.test(bt)) return total < 5.5

  // ── HT Over / Under (halftime) ─────────────────────────────────
  if (/ht/.test(bt)) {
    // Need halftime score — if not available yet, return null (not decidable)
    if (htHome === undefined || htAway === undefined) return null
    const htTotal = htHome + htAway
    if (/over\s*0\.5/.test(bt))  return htTotal > 0.5
    if (/under\s*0\.5/.test(bt)) return htTotal < 0.5
    if (/over\s*1\.5/.test(bt))  return htTotal > 1.5
    if (/under\s*1\.5/.test(bt)) return htTotal < 1.5
    if (/over\s*2\.5/.test(bt))  return htTotal > 2.5
    if (/under\s*2\.5/.test(bt)) return htTotal < 2.5
    // HT result
    if (/ht.*1$|ht.*home/.test(bt)) return htHome > htAway
    if (/ht.*x$|ht.*draw/.test(bt)) return htHome === htAway
    if (/ht.*2$|ht.*away/.test(bt)) return htAway > htHome
    return null
  }

  // ── BTTS ───────────────────────────────────────────────────────
  if (/btts.*yes|yes.*btts|both.*teams.*score|gg/.test(bt)) return homeGoals > 0 && awayGoals > 0
  if (/btts.*no|no.*btts|no.*goal|ng/.test(bt))             return !(homeGoals > 0 && awayGoals > 0)

  // ── Clean Sheet ────────────────────────────────────────────────
  if (/clean.?sheet.*home/.test(bt)) return awayGoals === 0
  if (/clean.?sheet.*away/.test(bt)) return homeGoals === 0
  if (/clean.?sheet/.test(bt))       return homeGoals === 0 || awayGoals === 0

  return null // unknown / unsupported bet type
}

/** Settle a single bet (handles parlay chain logic) */
export async function settleBet(betId: string, newStatus: 'WON' | 'LOST') {
  const bet = await prisma.bet.findUnique({
    where: { id: betId },
    include: { parlay: { include: { bets: { orderBy: { parlayOrder: 'asc' } } } } },
  })
  if (!bet || bet.status !== 'PENDING') return

  if (bet.parlayId && bet.parlay) {
    const parlay = bet.parlay
    const thisOrder = bet.parlayOrder ?? 1

    if (newStatus === 'LOST') {
      await prisma.$transaction([
        prisma.bet.updateMany({
          where: { parlayId: bet.parlayId, parlayOrder: { gte: thisOrder }, status: 'PENDING' },
          data: { status: 'LOST', settledAt: new Date() },
        }),
        prisma.parlay.update({
          where: { id: bet.parlayId },
          data: { status: 'LOST', settledAt: new Date() },
        }),
        prisma.user.update({
          where: { id: parlay.userId },
          data: { balance: { decrement: parlay.initialStake } },
        }),
      ])
    } else {
      await prisma.bet.update({
        where: { id: betId },
        data: { status: 'WON', settledAt: new Date() },
      })
      const allLegs = await prisma.bet.findMany({ where: { parlayId: bet.parlayId } })
      if (allLegs.every(l => l.status === 'WON')) {
        await prisma.$transaction([
          prisma.parlay.update({
            where: { id: bet.parlayId },
            data: { status: 'WON', settledAt: new Date() },
          }),
          prisma.user.update({
            where: { id: parlay.userId },
            data: { balance: { increment: parlay.potentialReturn } },
          }),
        ])
      }
    }
  } else {
    await prisma.bet.update({
      where: { id: betId },
      data: { status: newStatus, settledAt: new Date() },
    })
    if (newStatus === 'WON') {
      await prisma.user.update({ where: { id: bet.userId }, data: { balance: { increment: bet.potentialReturn } } })
    } else {
      await prisma.user.update({ where: { id: bet.userId }, data: { balance: { decrement: bet.amount } } })
    }
  }
}
