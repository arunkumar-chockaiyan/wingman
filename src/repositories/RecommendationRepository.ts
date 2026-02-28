import { prisma } from '../config/prismaClient';
import { Recommendation, FeedbackStatus } from '@prisma/client';

export class RecommendationRepository {
  async create(data: {
    callSessionId: string;
    content: string;
    category: string;
    agentId: string;
    contextSnippet?: string;
  }): Promise<Recommendation> {
    return prisma.recommendation.create({ data });
  }

  async updateFeedback(id: string, status: FeedbackStatus): Promise<Recommendation> {
    return prisma.recommendation.update({
      where: { id },
      data: { feedbackStatus: status },
    });
  }

  async findBySessionId(callSessionId: string): Promise<Recommendation[]> {
    return prisma.recommendation.findMany({
      where: { callSessionId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
