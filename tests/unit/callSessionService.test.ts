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
            findById: vi.fn()
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
