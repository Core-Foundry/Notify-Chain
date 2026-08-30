import { BatchValidator } from './batch-validator';
import { BatchValidationService } from '../services/batch-validation-service';

describe('BatchValidator', () => {
  const validItem = {
    id: 'evt_001',
    recipient: 'channel_alpha',
    channel: 'discord' as const,
    message: 'Hello world',
  };

  it('accepts a valid batch', () => {
    const result = BatchValidator.validateBatch([validItem, { ...validItem, id: 'evt_002', recipient: 'channel_beta' }]);
    expect(result.isValid).toBe(true);
    expect(result.processedCount).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects non-array input', () => {
    const result = BatchValidator.validateBatch({ id: 'x' });
    expect(result.isValid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_STRUCTURE');
  });

  it('rejects empty batches', () => {
    const result = BatchValidator.validateBatch([]);
    expect(result.isValid).toBe(false);
    expect(result.errors[0].code).toBe('EMPTY_BATCH');
  });

  it('detects missing required fields', () => {
    const result = BatchValidator.validateBatch([{ id: 'evt_001' }]);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_FIELD' && e.field === 'recipient')).toBe(true);
    expect(result.errors.some((e) => e.code === 'MISSING_FIELD' && e.field === 'channel')).toBe(true);
    expect(result.errors.some((e) => e.code === 'MISSING_FIELD' && e.field === 'message')).toBe(true);
  });

  it('detects duplicate recipients (case-insensitive)', () => {
    const result = BatchValidator.validateBatch([
      validItem,
      { ...validItem, id: 'evt_002', recipient: 'Channel_Alpha' },
    ]);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === 'DUPLICATE_RECIPIENT')).toBe(true);
  });

  it('rejects unsupported channels', () => {
    const result = BatchValidator.validateBatch([{ ...validItem, channel: 'telegram' }]);
    expect(result.isValid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_CHANNEL');
  });

  it('rejects empty string fields', () => {
    const result = BatchValidator.validateBatch([{ ...validItem, message: '   ' }]);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === 'EMPTY_FIELD' && e.field === 'message')).toBe(true);
  });
});

describe('BatchValidationService', () => {
  const service = new BatchValidationService();

  it('returns null for valid batches so processing can continue', () => {
    const rejection = service.rejectIfInvalid([
      { id: 'a', recipient: 'r1', channel: 'discord', message: 'm' },
    ]);
    expect(rejection).toBeNull();
  });

  it('returns structured errors for invalid batches', () => {
    const response = service.validate([]);
    expect(response.valid).toBe(false);
    expect(response.errors[0]).toMatchObject({
      code: 'EMPTY_BATCH',
      message: expect.stringContaining('at least one'),
    });
  });

  it('handles edge case invalid payloads in BatchValidator', () => {
    // null item in batch
    const resNull = BatchValidator.validateBatch([null]);
    expect(resNull.isValid).toBe(false);
    expect(resNull.errors[0].code).toBe('INVALID_ITEM');

    // non-string id / recipient / message
    const resTypes = BatchValidator.validateBatch([{ id: 123, recipient: 456, channel: 'discord', message: true }]);
    expect(resTypes.isValid).toBe(false);
    expect(resTypes.errors.some(e => e.code === 'INVALID_TYPE')).toBe(true);

    // malformed channel string
    const resChannel = BatchValidator.validateBatch([{ id: '1', recipient: 'r', channel: 'invalid_chan', message: 'msg' }]);
    expect(resChannel.isValid).toBe(false);
    expect(resChannel.errors.some(e => e.code === 'INVALID_CHANNEL')).toBe(true);
  });
});
