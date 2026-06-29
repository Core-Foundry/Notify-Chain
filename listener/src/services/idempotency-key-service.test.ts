import { IdempotencyKeyService } from './idempotency-key-service';
import { IdempotencyKeyRepository } from './idempotency-key-repository';

describe('IdempotencyKeyService', () => {
  let service: IdempotencyKeyService;
  let mockRepository: any;

  beforeEach(() => {
    mockRepository = {
      getCachedResponse: jest.fn(),
      validateRequestHash: jest.fn(),
      storeResponse: jest.fn(),
      cleanupExpiredKeys: jest.fn(),
      getStats: jest.fn(),
    };
    service = new IdempotencyKeyService(mockRepository as IdempotencyKeyRepository);
  });

  describe('processWithIdempotency', () => {
    it('should execute processor and cache response on first call', async () => {
      const idempotencyKey = 'test-key-123';
      const requestBody = { payload: 'test' };
      const processorResult = 42;

      mockRepository.getCachedResponse.mockResolvedValue(null);
      mockRepository.validateRequestHash.mockResolvedValue(true);
      mockRepository.storeResponse.mockResolvedValue(1);

      const processor = jest.fn().mockResolvedValue(processorResult);

      const result = await service.processWithIdempotency(
        idempotencyKey,
        requestBody,
        processor
      );

      expect(result.result).toBe(processorResult);
      expect(result.isDuplicate).toBe(false);
      expect(processor).toHaveBeenCalledTimes(1);
      expect(mockRepository.storeResponse).toHaveBeenCalled();
    });

    it('should return cached response on duplicate call', async () => {
      const idempotencyKey = 'test-key-123';
      const requestBody = { payload: 'test' };
      const cachedResponse = {
        notificationId: 42,
        isDuplicate: true,
        response: { success: true, id: 42 },
      };

      mockRepository.getCachedResponse.mockResolvedValue(cachedResponse);
      mockRepository.validateRequestHash.mockResolvedValue(true);

      const processor = jest.fn();

      const result = await service.processWithIdempotency(
        idempotencyKey,
        requestBody,
        processor
      );

      expect(result.result).toEqual(cachedResponse.response);
      expect(result.isDuplicate).toBe(true);
      expect(processor).not.toHaveBeenCalled();
      expect(mockRepository.storeResponse).not.toHaveBeenCalled();
    });

    it('should throw error if request hash does not match', async () => {
      const idempotencyKey = 'test-key-123';
      const requestBody = { payload: 'test' };
      const cachedResponse = {
        notificationId: 42,
        isDuplicate: true,
        response: { success: true, id: 42 },
      };

      mockRepository.getCachedResponse.mockResolvedValue(cachedResponse);
      mockRepository.validateRequestHash.mockResolvedValue(false);

      const processor = jest.fn();

      await expect(
        service.processWithIdempotency(
          idempotencyKey,
          requestBody,
          processor
        )
      ).rejects.toThrow('Idempotency key reused with different request body');

      expect(processor).not.toHaveBeenCalled();
    });

    it('should execute processor normally if no idempotency key provided', async () => {
      const requestBody = { payload: 'test' };
      const processorResult = 42;

      const processor = jest.fn().mockResolvedValue(processorResult);

      const result = await service.processWithIdempotency(
        undefined,
        requestBody,
        processor
      );

      expect(result.result).toBe(processorResult);
      expect(result.isDuplicate).toBe(false);
      expect(processor).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanupExpiredKeys', () => {
    it('should call repository cleanup method', async () => {
      mockRepository.cleanupExpiredKeys.mockResolvedValue(5);

      const count = await service.cleanupExpiredKeys();

      expect(count).toBe(5);
      expect(mockRepository.cleanupExpiredKeys).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics from repository', async () => {
      const stats = {
        total: 100,
        processed: 95,
        expired: 5,
        oldestKey: 'old-key',
      };

      mockRepository.getStats.mockResolvedValue(stats);

      const result = await service.getStatistics();

      expect(result).toEqual(stats);
    });
  });
});
