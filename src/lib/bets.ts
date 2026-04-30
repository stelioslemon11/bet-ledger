import { prisma } from '@/lib/db'

/** Evaluate whether a bet type WON given final goals */
export function evaluateBetResult(betType: string, homeGoals: number, awayGoals: number): boolean | null {
  const total = homeGoals + awayGoals
  const bt = betType.toLowerCase().trim()

  if (/over\s*0\.5/.test(bt) && !/ht/.test(bt)) return total > 0.5
  if (/under\s*0\.5/.test(bt) && !/ht/.test(bt)) return total < 0.5
  if (/over\s*1\.5/.test(bt) && !/ht/.test(bt)) return total > 1.5
  if (/under\s*1\.5/.test(bt) && !/ht/.test(bt)) return total < 1.5
  if (/over\s*2\.5/.test(bt)) return total > 2.5
  if (/under\s*2\.5/.test(bt)) return total < 2.5
  if (/over\s*3\.5/.test(bt)) return total > 3.5
  if (/under\s*3\.5/.test(bt)) return total < 3.5
  if (/over\s*4\.5/.test(bt)) return total > 4.5
  if (/under\s*4\.5/.test(bt)) return total < 4.5
  if (/over\s*5\.5/.test(bt)) return total > 5.5
  if (/under\s*5\.5/.test(bt)) return total < 5.5
  if (bt === 'gg' || bt === 'btts' || /both.?teams/.test(bt)) return homeGoals > 0 && awayGoals > 0
  if (bt === 'ng' || /no.?goal/.test(bt)) return !(homeGoals > 0 && awayGoals > 0)
  if (/1x2.*home|home.*win/.test(bt)) return homeGoals > awayGoals
  if (/1x2.*draw|^draw$/.test(bt)) return homeGoals === awayGoals
  if (/1x2.*away|away.*win/.test(bt)) return awayGoals > homeGoals
  if (/double.*1x|1x.*double/.test(bt)) return homeGoals >= awayGoals
  if (/double.*x2|x2.*double/.test(bt)) return awayGoals >= homeGoals
  if (/double.*12|12.*double/.test(bt)) return homeGoals !== awayGoals

  return null // unknown bet type
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
      // Mark this leg + all subsequent legs as LOST, settle parlay LOST
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
      // Mark this leg WON
      await prisma.bet.update({
        where: { id: betId },
        data: { status: 'WON', settledAt: new Date() },
      })
      // Check if all legs are now WON
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
    // Single bet
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
