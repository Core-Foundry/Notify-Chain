import {
  validateNotificationMetadata,
  MetadataValidationError,
  MAX_METADATA_FIELDS,
  MAX_METADATA_STRING_LENGTH,
  REQUIRED_METADATA_FIELDS,
} from './metadata-validator';

describe('validateNotificationMetadata', () => {
  it('accepts absent metadata', () => {
    expect(() => validateNotificationMetadata(undefined)).not.toThrow();
    expect(() => validateNotificationMetadata(null)).not.toThrow();
  });

  it('accepts valid metadata with required fields', () => {
    expect(() =>
      validateNotificationMetadata({
        source: 'contract-abc',
        description: 'hello',
        priority: 1,
      })
    ).not.toThrow();
  });

  it('rejects non-object metadata', () => {
    expect(() => validateNotificationMetadata([] as any)).toThrow(MetadataValidationError);
    expect(() => validateNotificationMetadata('x' as any)).toThrow(MetadataValidationError);
  });

  it('rejects missing required source field', () => {
    expect(() => validateNotificationMetadata({ description: 'x' })).toThrow(
      /metadata\.source is required/
    );
  });

  it('rejects empty source', () => {
    expect(() => validateNotificationMetadata({ source: '   ' })).toThrow(
      MetadataValidationError
    );
  });

  it('rejects nested objects', () => {
    expect(() =>
      validateNotificationMetadata({ source: 'ok', nested: { a: 1 } })
    ).toThrow(/nested values are not allowed/);
  });

  it('rejects oversized string values', () => {
    expect(() =>
      validateNotificationMetadata({
        source: 'ok',
        description: 'x'.repeat(MAX_METADATA_STRING_LENGTH + 1),
      })
    ).toThrow(MetadataValidationError);
  });

  it('rejects too many fields', () => {
    const meta: Record<string, unknown> = { source: 'ok' };
    for (let i = 0; i < MAX_METADATA_FIELDS; i++) {
      meta[`k${i}`] = 'v';
    }
    expect(() => validateNotificationMetadata(meta)).toThrow(/at most/);
  });

  it('documents required fields', () => {
    expect(REQUIRED_METADATA_FIELDS).toContain('source');
  });

  describe('edge cases and invalid payloads', () => {
    it('rejects array inputs and primitive types', () => {
      expect(() => validateNotificationMetadata(123 as any)).toThrow(MetadataValidationError);
      expect(() => validateNotificationMetadata('string' as any)).toThrow(MetadataValidationError);
      expect(() => validateNotificationMetadata(true as any)).toThrow(MetadataValidationError);
    });

    it('rejects null or undefined values inside metadata object', () => {
      expect(() =>
        validateNotificationMetadata({ source: 'valid', badKey: null })
      ).toThrow(/must not be null/);
      expect(() =>
        validateNotificationMetadata({ source: 'valid', badKey: undefined })
      ).toThrow(/must not be null/);
    });

    it('rejects whitespace-only source or keys exceeding character limits', () => {
      expect(() =>
        validateNotificationMetadata({ source: '\t\n ' })
      ).toThrow(/required and must be a non-empty string/);

      const longKey = 'k'.repeat(MAX_METADATA_STRING_LENGTH + 1);
      expect(() =>
        validateNotificationMetadata({ source: 'valid', [longKey]: 'value' })
      ).toThrow(/exceeds/);
    });

    it('accepts numerical and boolean metadata values', () => {
      expect(() =>
        validateNotificationMetadata({
          source: 'valid-src',
          numValue: 12345,
          boolValue: true,
          zeroValue: 0,
        })
      ).not.toThrow();
    });
  });
});
