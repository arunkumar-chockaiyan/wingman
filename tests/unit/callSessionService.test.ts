import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';
import { CallSessionService } from '../../src/services/callSessionService';
import { UserRepository } from '../../src/repositories/UserRepository';
import { CallSessionRepository } from '../../src/repositories/CallSessionRepository';
import { RecommendationRepository } from '../../src/repositories/RecommendationRepository';

describe('CallSessionService', () => {
    let callSessionService: CallSessionService;
    let mockUserRepo: Mocked<UserRepository>;
    let mockSessionRepo: Mocked<CallSessionRepository>;
    let mockRecRepo: Mocked<RecommendationRepository>;

    beforeEach(() => {
        mockUserRepo = {
            upsertByEmail: vi.fn(),
            findByEmail: vi.fn()
        } as unknown as Mocked<UserRepository>;

        mockSessionRepo = {
            create: vi.fn(),
            endSession: vi.fn(),
            appendTranscript: vi.fn(),
            findByUserId: vi.fn(),
            findById: vi.fn(),
            updateRepContext: vi.fn(),
        } as unknown as Mocked<CallSessionRepository>;

        mockRecRepo = {
            create: vi.fn(),
            updateFeedback: vi.fn()
        } as unknown as Mocked<RecommendationRepository>;

        callSessionService = new CallSessionService(mockUserRepo, mockSessionRepo, mockRecRepo);
    });

    describe('startSession', () => {
        it('should create a user if not exists and start a session', async () => {
            const mockUser = { id: 'user-1', email: 'admin@wingman.local', name: 'Admin', createdAt: new Date(), updatedAt: new Date() };
            const mockSession = { id: 'session-1', userId: 'user-1', title: 'Test Call', status: 'ACTIVE', startTime: new Date(), endTime: null, transcript: '', summary: null, createdAt: new Date(), updatedAt: new Date() };

            mockUserRepo.upsertByEmail.mockResolvedValue(mockUser);
            // @ts-ignore
            mockSessionRepo.create.mockResolvedValue(mockSession);

            const result = await callSessionService.startSession('Test Call', 'session-1');

            expect(mockUserRepo.upsertByEmail).toHaveBeenCalledWith('admin@wingman.local', 'Admin');
            expect(mockSessionRepo.create).toHaveBeenCalledWith('user-1', 'Test Call', 'session-1');
            expect(result).toEqual(mockSession);
        });
    });

    describe('endSession', () => {
        it('should call sessionRepo.endSession with correct parameters', async () => {
            const mockSession = { id: 'session-1', userId: 'user-1', title: 'Test Call', status: 'COMPLETED', startTime: new Date(), endTime: new Date(), transcript: 'Hello', summary: 'A greeting', createdAt: new Date(), updatedAt: new Date() };

            // @ts-ignore
            mockSessionRepo.endSession.mockResolvedValue(mockSession);

            const result = await callSessionService.endSession('session-1', 'Hello', 'A greeting');

            expect(mockSessionRepo.endSession).toHaveBeenCalledWith('session-1', 'Hello', 'A greeting');
            expect(result).toEqual(mockSession);
        });
    });

    describe('startSession (no explicit id)', () => {
        it('passes undefined id to sessionRepo when omitted', async () => {
            const mockUser = { id: 'user-1', email: 'admin@wingman.local', name: 'Admin', createdAt: new Date(), updatedAt: new Date() };
            const mockSession = { id: 'auto-id', userId: 'user-1', title: 'Quick Call', startTime: new Date(), endTime: null, fullTranscript: null, summary: null, repNotes: null, repLinks: null, repInstructions: null, createdAt: new Date(), updatedAt: new Date() };

            mockUserRepo.upsertByEmail.mockResolvedValue(mockUser);
            // @ts-ignore
            mockSessionRepo.create.mockResolvedValue(mockSession);

            await callSessionService.startSession('Quick Call');

            expect(mockSessionRepo.create).toHaveBeenCalledWith('user-1', 'Quick Call', undefined);
        });
    });

    describe('saveInsight', () => {
        it('persists an insight via recommendationRepo and returns the record', async () => {
            const insightData = {
                callSessionId: 'session-1',
                content: 'Address the pricing objection with ROI framing.',
                category: 'Sales Feedback',
                agentId: 'sales-coach',
                contextSnippet: 'customer said the price is too high',
            };
            const mockRec = { id: 'rec-1', ...insightData, feedbackStatus: 'NONE', createdAt: new Date() };

            // @ts-ignore
            mockRecRepo.create.mockResolvedValue(mockRec);

            const result = await callSessionService.saveInsight(insightData);

            expect(mockRecRepo.create).toHaveBeenCalledWith(insightData);
            expect(result).toEqual(mockRec);
        });
    });

    describe('updateRepContext', () => {
        it('delegates to sessionRepo.updateRepContext with mapped field names', async () => {
            mockSessionRepo.updateRepContext.mockResolvedValue(undefined);

            await callSessionService.updateRepContext('session-1', {
                repNotes: 'CFO is the decision maker.',
                repLinks: 'https://deck.example.com',
                repInstructions: 'Focus on security.',
            });

            expect(mockSessionRepo.updateRepContext).toHaveBeenCalledWith('session-1', {
                repNotes: 'CFO is the decision maker.',
                repLinks: 'https://deck.example.com',
                repInstructions: 'Focus on security.',
            });
        });
    });

    describe('recordFeedback', () => {
        it('maps "LIKED" and calls recommendationRepo.updateFeedback', async () => {
            // @ts-ignore
            mockRecRepo.updateFeedback.mockResolvedValue(undefined);

            await callSessionService.recordFeedback('rec-1', 'LIKED');

            expect(mockRecRepo.updateFeedback).toHaveBeenCalledWith('rec-1', 'LIKED');
        });

        it('maps "DISLIKED" and calls recommendationRepo.updateFeedback', async () => {
            // @ts-ignore
            mockRecRepo.updateFeedback.mockResolvedValue(undefined);

            await callSessionService.recordFeedback('rec-2', 'DISLIKED');

            expect(mockRecRepo.updateFeedback).toHaveBeenCalledWith('rec-2', 'DISLIKED');
        });
    });

    describe('getSession', () => {
        it('returns the session returned by sessionRepo.findById', async () => {
            const mockSession = { id: 'session-1', userId: 'user-1', title: 'Test', recommendations: [] };
            // @ts-ignore
            mockSessionRepo.findById.mockResolvedValue(mockSession);

            const result = await callSessionService.getSession('session-1');

            expect(mockSessionRepo.findById).toHaveBeenCalledWith('session-1');
            expect(result).toEqual(mockSession);
        });

        it('returns null when session is not found', async () => {
            mockSessionRepo.findById.mockResolvedValue(null);

            const result = await callSessionService.getSession('missing-id');

            expect(result).toBeNull();
        });
    });

    describe('listSessions', () => {
        it('should return empty array if admin user is not found', async () => {
            mockUserRepo.findByEmail.mockResolvedValue(null);

            const result = await callSessionService.listSessions();

            expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('admin@wingman.local');
            expect(mockSessionRepo.findByUserId).not.toHaveBeenCalled();
            expect(result).toEqual([]);
        });

        it('should return sessions for admin user', async () => {
             const mockUser = { id: 'user-1', email: 'admin@wingman.local', name: 'Admin', createdAt: new Date(), updatedAt: new Date() };
             const mockSessions = [
                { id: 'session-1', userId: 'user-1', title: 'Call 1', status: 'ACTIVE', startTime: new Date(), endTime: null, transcript: '', summary: null, createdAt: new Date(), updatedAt: new Date() }
             ];
             mockUserRepo.findByEmail.mockResolvedValue(mockUser);
             // @ts-ignore
             mockSessionRepo.findByUserId.mockResolvedValue(mockSessions);

             const result = await callSessionService.listSessions();

             expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('admin@wingman.local');
             expect(mockSessionRepo.findByUserId).toHaveBeenCalledWith('user-1');
             expect(result).toEqual(mockSessions);
        });
    });
});
