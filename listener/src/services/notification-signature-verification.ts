import logger from '../utils/logger';
import { verifySignature, extractSignature, extractKeyId, getSecretForKey } from './webhook-verifier';
import { WebhookSecret } from '../types';

/**
 * Signature verification result with detailed audit information.
 */
export interface SignatureVerificationResult {
  isValid: boolean;
  keyId?: string;
  fingerprintHash?: string;
  errorCode?: string;
  errorMessage?: string;
  timestamp: number;
  duration: number;
}

/**
 * Signature verification metrics for monitoring.
 */
export interface SignatureVerificationMetrics {
  totalVerifications: number;
  successfulVerifications: number;
  failedVerifications: number;
  missingSignatureHeaders: number;
  invalidKeyIds: number;
  successRate: number;
}

/**
 * Notification Signature Verification Service
 *
 * Provides comprehensive signature verification for incoming notifications.
 * Ensures that only authenticated and authorized notifications are processed.
 *
 * Features:
 * - HMAC-SHA256 signature verification
 * - Key ID extraction and validation
 * - Comprehensive logging and audit trail
 * - Metrics tracking for monitoring
 * - Timing-safe comparison for security
 */
export class NotificationSignatureVerificationService {
  private webhookSecrets: WebhookSecret[];
  private totalVerifications = 0;
  private successfulVerifications = 0;
  private failedVerifications = 0;
  private missingSignatureHeaders = 0;
  private invalidKeyIds = 0;
  private readonly auditLog: Array<{
    timestamp: number;
    result: SignatureVerificationResult;
    keyId: string | null;
  }> = [];
  private readonly maxAuditLogSize = 1000;

  constructor(webhookSecrets: WebhookSecret[] = []) {
    this.webhookSecrets = webhookSecrets;
  }

  /**
   * Update the webhook secrets used for verification.
   * Useful for key rotation and updates.
   */
  updateSecrets(secrets: WebhookSecret[]): void {
    this.webhookSecrets = secrets;
    logger.info('Webhook secrets updated', {
      count: secrets.length,
      keyIds: secrets.map(s => s.id),
    });
  }

  /**
   * Verify a notification signature from incoming request headers and payload.
   *
   * Returns a result object indicating verification success/failure.
   * Comprehensive logging is performed for all verification attempts.
   *
   * @param payload - Raw request payload as string
   * @param headers - Request headers object
   * @returns SignatureVerificationResult with detailed information
   */
  verifyNotificationSignature(
    payload: string,
    headers: Record<string, string | string[] | undefined>
  ): SignatureVerificationResult {
    const startTime = Date.now();

    try {
      // Extract signature from headers
      const signature = extractSignature(headers);
      if (!signature) {
        this.missingSignatureHeaders++;
        const result: SignatureVerificationResult = {
          isValid: false,
          errorCode: 'MISSING_SIGNATURE',
          errorMessage: 'X-Webhook-Signature header is missing',
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        };
        this.recordAuditLog(result, null);
        logger.warn('Signature verification failed: missing signature header', {
          duration: result.duration,
        });
        return result;
      }

      // Extract key ID from headers
      const keyId = extractKeyId(headers);
      if (!keyId) {
        this.invalidKeyIds++;
        const result: SignatureVerificationResult = {
          isValid: false,
          errorCode: 'MISSING_KEY_ID',
          errorMessage: 'X-Webhook-Key-Id header is missing',
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        };
        this.recordAuditLog(result, null);
        logger.warn('Signature verification failed: missing key ID header', {
          duration: result.duration,
        });
        return result;
      }

      // Get the secret for the provided key ID
      const secret = getSecretForKey(this.webhookSecrets, keyId);
      if (!secret) {
        this.invalidKeyIds++;
        const result: SignatureVerificationResult = {
          isValid: false,
          keyId,
          errorCode: 'INVALID_KEY_ID',
          errorMessage: `No secret found for key ID: ${keyId}`,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        };
        this.recordAuditLog(result, keyId);
        logger.warn('Signature verification failed: invalid key ID', {
          keyId,
          availableKeys: this.webhookSecrets.map(s => s.id),
          duration: result.duration,
        });
        return result;
      }

      // Verify the signature
      const isValid = verifySignature(payload, signature, secret);

      if (isValid) {
        this.successfulVerifications++;
        const fingerprintHash = this.generatePayloadFingerprint(payload);
        const result: SignatureVerificationResult = {
          isValid: true,
          keyId,
          fingerprintHash,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        };
        this.recordAuditLog(result, keyId);
        logger.info('Signature verification successful', {
          keyId,
          fingerprintHash,
          duration: result.duration,
        });
        return result;
      } else {
        this.failedVerifications++;
        const result: SignatureVerificationResult = {
          isValid: false,
          keyId,
          errorCode: 'INVALID_SIGNATURE',
          errorMessage: 'Signature verification failed: signature does not match',
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        };
        this.recordAuditLog(result, keyId);
        logger.warn('Signature verification failed: invalid signature', {
          keyId,
          duration: result.duration,
        });
        return result;
      }
    } catch (error) {
      this.failedVerifications++;
      const result: SignatureVerificationResult = {
        isValid: false,
        errorCode: 'VERIFICATION_ERROR',
        errorMessage: `Signature verification error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      };
      this.recordAuditLog(result, null);
      logger.error('Unexpected error during signature verification', {
        error,
        duration: result.duration,
      });
      return result;
    } finally {
      this.totalVerifications++;
    }
  }

  /**
   * Get comprehensive verification metrics.
   */
  getMetrics(): SignatureVerificationMetrics {
    const successRate = this.totalVerifications > 0
      ? Math.round((this.successfulVerifications / this.totalVerifications) * 10000) / 100
      : 0;

    return {
      totalVerifications: this.totalVerifications,
      successfulVerifications: this.successfulVerifications,
      failedVerifications: this.failedVerifications,
      missingSignatureHeaders: this.missingSignatureHeaders,
      invalidKeyIds: this.invalidKeyIds,
      successRate,
    };
  }

  /**
   * Get recent audit log entries for monitoring and debugging.
   */
  getAuditLog(limit: number = 100): Array<{
    timestamp: number;
    result: SignatureVerificationResult;
    keyId: string | null;
  }> {
    return this.auditLog.slice(-limit);
  }

  /**
   * Clear the audit log.
   */
  clearAuditLog(): void {
    this.auditLog.length = 0;
  }

  /**
   * Reset all metrics.
   */
  resetMetrics(): void {
    this.totalVerifications = 0;
    this.successfulVerifications = 0;
    this.failedVerifications = 0;
    this.missingSignatureHeaders = 0;
    this.invalidKeyIds = 0;
  }

  /**
   * Generate a fingerprint hash of the payload for audit purposes.
   * Does not affect verification, only used for logging.
   */
  private generatePayloadFingerprint(payload: string): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(payload);
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Record an audit log entry for verification tracking.
   */
  private recordAuditLog(
    result: SignatureVerificationResult,
    keyId: string | null
  ): void {
    this.auditLog.push({
      timestamp: Date.now(),
      result,
      keyId,
    });

    if (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog.shift();
    }
  }
}
