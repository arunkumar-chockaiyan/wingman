import { prisma } from '../config/prismaClient';
import { CallSession } from '@prisma/client';

export class CallSessionRepository {
    async create(userId: string, title: string): Promise<CallSession> {
        return prisma.callSession.create({
            data: { userId, title },
        });
    }

    async findById(id: string): Promise<CallSession | null> {
        return prisma.callSession.findUnique({
            where: { id },
            include: { recommendations: true },
        });
    }

    async findByUserId(userId: string): Promise<CallSession[]> {
        return prisma.callSession.findMany({
            where: { userId },
            orderBy: { startTime: 'desc' },
        });
    }

    async endSession(id: string, fullTranscript: string, summary?: string): Promise<CallSession> {
        return prisma.callSession.update({
            where: { id },
            data: {
                endTime: new Date(),
                fullTranscript,
                summary,
            },
        });
    }

    async appendTranscript(id: string, newText: string): Promise<CallSession> {
        const session = await prisma.callSession.findUnique({ where: { id } });
        const existing = session?.fullTranscript || '';
        return prisma.callSession.update({
            where: { id },
            data: { fullTranscript: existing + ' ' + newText },
        });
    }
}
