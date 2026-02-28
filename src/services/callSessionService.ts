import { UserRepository } from '../repositories/UserRepository';
import { CallSessionRepository } from '../repositories/CallSessionRepository';
import { RecommendationRepository } from '../repositories/RecommendationRepository';
import { CallSession, FeedbackStatus } from '@prisma/client';

export class CallSessionService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly sessionRepo: CallSessionRepository,
    private readonly recommendationRepo: RecommendationRepository,
  ) {}

  /**
   * Ensures the default admin user exists and creates a new call session.
   */
  async startSession(title: string): Promise<CallSession> {
    const adminUser = await this.userRepo.upsertByEmail('admin@wingman.local', 'Admin');
    return this.sessionRepo.create(adminUser.id, title);
  }

  /**
   * Ends a session and persists the final transcript.
   */
  async endSession(
    sessionId: string,
    fullTranscript: string,
    summary?: string,
  ): Promise<CallSession> {
    return this.sessionRepo.endSession(sessionId, fullTranscript, summary);
  }

  /**
   * Appends a new transcript chunk to an existing session.
   */
  async appendTranscript(sessionId: string, text: string): Promise<void> {
    await this.sessionRepo.appendTranscript(sessionId, text);
  }

  /**
   * Persists an AI-generated insight and links it to a session.
   */
  async saveInsight(data: {
    callSessionId: string;
    content: string;
    category: string;
    agentId: string;
    contextSnippet?: string;
  }): Promise<void> {
    await this.recommendationRepo.create(data);
  }

  /**
   * Records user feedback on an insight.
   */
  async recordFeedback(recommendationId: string, status: 'LIKED' | 'DISLIKED'): Promise<void> {
    await this.recommendationRepo.updateFeedback(recommendationId, status as FeedbackStatus);
  }

  /**
   * Returns all sessions for the default admin user (for dashboard).
   */
  async listSessions(): Promise<CallSession[]> {
    const adminUser = await this.userRepo.findByEmail('admin@wingman.local');
    if (!adminUser) return [];
    return this.sessionRepo.findByUserId(adminUser.id);
  }

  /**
   * Returns a single session with its recommendations.
   */
  async getSession(sessionId: string) {
    return this.sessionRepo.findById(sessionId);
  }
}
