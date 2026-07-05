import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [
      waitlistMember,
      walletsConnected,
      escrowCreated,
      escrowsCompleted,
      ordersReleased,
      oldestUser,
      waitlistTimelineRaw,
    ] = await Promise.all([
      this.prisma.waitlist.count(),
      this.prisma.appUser.count(),
      this.prisma.escrowOnChain.count(),
      this.prisma.escrowOnChain.count({ where: { escrowStatus: 'released' } }),
      this.prisma.order.count({ where: { orderStatus: 'released' } }),
      this.prisma.appUser.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT DATE(created_at)::text AS date, COUNT(*)::int AS count
        FROM waitlist
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
    ]);

    const monthsSinceStart = oldestUser
      ? Math.max(1, this.monthsBetween(oldestUser.createdAt, new Date()))
      : 1;

    const avgMonthlyCompletedEscrow = +(
      escrowsCompleted / monthsSinceStart
    ).toFixed(2);
    const avgTransactionsPerUser = +(
      ordersReleased /
      walletsConnected /
      monthsSinceStart
    ).toFixed(2);

    const waitlistTimeline = waitlistTimelineRaw.map((row) => ({
      date: row.date,
      count: Number(row.count),
    }));

    return {
      waitlist_member: waitlistMember,
      wallets_connected: walletsConnected,
      escrows_completed: escrowsCompleted,
      escrow_created: escrowCreated,
      avg_monthly_completed_escrow: avgMonthlyCompletedEscrow,
      avg_transactions_per_user: avgTransactionsPerUser,
      waitlist_timeline: waitlistTimeline,
    };
  }

  private monthsBetween(start: Date, end: Date): number {
    return (
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth())
    );
  }
}
