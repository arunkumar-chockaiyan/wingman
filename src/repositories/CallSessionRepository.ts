import { prisma } from '../config/prismaClient';
import { CallSession, CallSentiment } from '@prisma/client';

export interface CallSummaryInput {
    outcome?: string;
    sentiment?: CallSentiment;
    keyTopics?: string[];
    actionItems?: string[];
    notes?: string;
}

export class CallSessionRepository {
    async create(userId: string, title: string, id?: string): Promise<CallSession> {
        return prisma.callSession.create({
            data: { id, userId, title },
        });
    }

    async findById(id: string): Promise<CallSession | null> {
        return prisma.callSession.findUnique({
            where: { id },
            include: { recommendations: true, callSummary: true },
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

    async updateRepContext(
        id: string,
        data: { repNotes?: string; repLinks?: string; repInstructions?: string },
    ): Promise<void> {
        await prisma.callSession.update({ where: { id }, data });
    }

    async upsertSummary(callSessionId: string, data: CallSummaryInput) {
        return prisma.callSummary.upsert({
            where: { callSessionId },
            create: { callSessionId, ...data },
            update: data,
        });
    }
}
