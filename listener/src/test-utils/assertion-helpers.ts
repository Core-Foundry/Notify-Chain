/**
 * Test utility functions for assertions related to validation errors and coverage metrics
 * Task 6.2: Create assertion helpers for validation errors and coverage metrics
 */

import { BatchValidationResult } from '../utils/batch-validator';

/**
 * Helper assertions for validation errors
 */
export class ValidationAssertions {
  /**
   * Assert that a validation result indicates an error for a specific field
   */
  static assertFieldError(
    result: BatchValidationResult,
    fieldName: string,
    errorCode?: string
  ): void {
    const fieldError = result.errors.find((e) => e.field === fieldName);
    if (!fieldError) {
      throw new Error(
        `Expected error for field '${fieldName}' but found errors: ${JSON.stringify(result.errors)}`
      );
    }
    if (errorCode && fieldError.code !== errorCode) {
      throw new Error(
        `Expected error code '${errorCode}' for field '${fieldName}' but got '${fieldError.code}'`
      );
    }
  }

  /**
   * Assert that a validation result contains a specific error code
   */
  static assertErrorCode(result: BatchValidationResult, errorCode: string): void {
    const error = result.errors.find((e) => e.code === errorCode);
    if (!error) {
      throw new Error(
        `Expected error code '${errorCode}' but found: ${result.errors.map((e) => e.code).join(', ')}`
      );
    }
  }

  /**
   * Assert that a validation result has exactly N errors
   */
  static assertErrorCount(result: BatchValidationResult, expectedCount: number): void {
    if (result.errors.length !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} errors but got ${result.errors.length}: ${JSON.stringify(result.errors)}`
      );
    }
  }

  /**
   * Assert that a validation result has at least N errors
   */
  static assertMinimumErrorCount(result: BatchValidationResult, minimumCount: number): void {
    if (result.errors.length < minimumCount) {
      throw new Error(
        `Expected at least ${minimumCount} errors but got ${result.errors.length}: ${JSON.stringify(result.errors)}`
      );
    }
  }

  /**
   * Assert that a validation result has no errors for a specific field
   */
  static assertNoFieldErrors(result: BatchValidationResult, fieldName: string): void {
    const fieldErrors = result.errors.filter((e) => e.field === fieldName);
    if (fieldErrors.length > 0) {
      throw new Error(
        `Expected no errors for field '${fieldName}' but found: ${JSON.stringify(fieldErrors)}`
      );
    }
  }

  /**
   * Assert that validation is valid
   */
  static assertValid(result: BatchValidationResult): void {
    if (!result.isValid) {
      throw new Error(
        `Expected validation to be valid but got errors: ${JSON.stringify(result.errors)}`
      );
    }
  }

  /**
   * Assert that validation is invalid
   */
  static assertInvalid(result: BatchValidationResult): void {
    if (result.isValid) {
      throw new Error('Expected validation to be invalid but it was valid');
    }
  }

  /**
   * Assert that processed count matches expected
   */
  static assertProcessedCount(result: BatchValidationResult, expectedCount: number): void {
    if (result.processedCount !== expectedCount) {
      throw new Error(`Expected ${expectedCount} processed items but got ${result.processedCount}`);
    }
  }

  /**
   * Assert that error message contains specific text
   */
  static assertErrorMessageContains(
    result: BatchValidationResult,
    errorCode: string,
    expectedText: string
  ): void {
    const error = result.errors.find((e) => e.code === errorCode);
    if (!error) {
      throw new Error(`Expected error code '${errorCode}' not found`);
    }
    if (!error.message.includes(expectedText)) {
      throw new Error(
        `Expected error message to contain '${expectedText}' but got: '${error.message}'`
      );
    }
  }
}

/**
 * Helper class for coverage metrics and assertions
 */
export class CoverageAssertions {
  /**
   * Assert that a coverage metric meets a minimum threshold
   */
  static assertCoverageThreshold(coverage: number, minimum: number, metric: string): void {
    if (coverage < minimum) {
      throw new Error(
        `${metric} coverage ${coverage}% is below minimum threshold ${minimum}%`
      );
    }
  }

  /**
   * Assert that coverage increased by at least N percentage points
   */
  static assertCoverageIncrease(before: number, after: number, minimumIncrease: number): void {
    const increase = after - before;
    if (increase < minimumIncrease) {
      throw new Error(
        `Expected coverage to increase by at least ${minimumIncrease} points but only increased by ${increase} (${before}% -> ${after}%)`
      );
    }
  }

  /**
   * Parse coverage from text format report
   */
  static parseCoverageMetrics(coverageText: string): {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  } {
    // Example format:
    // ---------|----------|----------|----------|----------|
    // File     | % Stmts  | % Branch | % Funcs  | % Lines
    // ---------|----------|----------|----------|----------|
    // All files|    80.5  |    75.3  |    85.2  |    80.5

    const patterns = {
      statements: /All files\s+\|\s+([\d.]+)/,
      branches: /\|\s+([\d.]+)\s+\|/,
      functions: /\|\s+([\d.]+)\s+\|/,
      lines: /\|\s+([\d.]+)\s*$/,
    };

    try {
      const statementsMatch = coverageText.match(/All files\s+\|\s+([\d.]+)/);
      const statements = statementsMatch ? parseFloat(statementsMatch[1]) : 0;

      // For branch, functions, and lines, we need to extract from the All files line
      const allFilesLine = coverageText
        .split('\n')
        .find((line) => line.includes('All files'));
      if (!allFilesLine) {
        return { statements: 0, branches: 0, functions: 0, lines: 0 };
      }

      const parts = allFilesLine.split('|').filter((p) => p.trim());
      const branches = parts.length > 1 ? parseFloat(parts[1].trim()) : 0;
      const functions = parts.length > 2 ? parseFloat(parts[2].trim()) : 0;
      const lines = parts.length > 3 ? parseFloat(parts[3].trim()) : 0;

      return { statements, branches, functions, lines };
    } catch (e) {
      throw new Error(`Failed to parse coverage metrics: ${e}`);
    }
  }

  /**
   * Verify all coverage metrics meet minimum threshold
   */
  static assertAllMetricsAboveThreshold(
    metrics: { statements: number; branches: number; functions: number; lines: number },
    threshold: number
  ): void {
    const failed = [];

    if (metrics.statements < threshold) {
      failed.push(`statements: ${metrics.statements}% (required: ${threshold}%)`);
    }
    if (metrics.branches < threshold) {
      failed.push(`branches: ${metrics.branches}% (required: ${threshold}%)`);
    }
    if (metrics.functions < threshold) {
      failed.push(`functions: ${metrics.functions}% (required: ${threshold}%)`);
    }
    if (metrics.lines < threshold) {
      failed.push(`lines: ${metrics.lines}% (required: ${threshold}%)`);
    }

    if (failed.length > 0) {
      throw new Error(`Coverage metrics below threshold:\n${failed.join('\n')}`);
    }
  }

  /**
   * Compare two coverage reports and verify improvement
   */
  static assertCoverageImproved(
    beforeMetrics: { statements: number; branches: number; functions: number; lines: number },
    afterMetrics: { statements: number; branches: number; functions: number; lines: number }
  ): void {
    const improvements = {
      statements: afterMetrics.statements - beforeMetrics.statements,
      branches: afterMetrics.branches - beforeMetrics.branches,
      functions: afterMetrics.functions - beforeMetrics.functions,
      lines: afterMetrics.lines - beforeMetrics.lines,
    };

    const allImproved = Object.values(improvements).every((v) => v >= 0);

    if (!allImproved) {
      throw new Error(
        `Coverage did not improve: statements ${beforeMetrics.statements}% -> ${afterMetrics.statements}%, ` +
          `branches ${beforeMetrics.branches}% -> ${afterMetrics.branches}%, ` +
          `functions ${beforeMetrics.functions}% -> ${afterMetrics.functions}%, ` +
          `lines ${beforeMetrics.lines}% -> ${afterMetrics.lines}%`
      );
    }
  }

  /**
   * Format coverage report for display
   */
  static formatCoverageReport(metrics: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  }): string {
    return `
Coverage Report:
  Statements: ${metrics.statements.toFixed(2)}%
  Branches:   ${metrics.branches.toFixed(2)}%
  Functions:  ${metrics.functions.toFixed(2)}%
  Lines:      ${metrics.lines.toFixed(2)}%
    `.trim();
  }

  /**
   * Compare two coverage reports and return diff
   */
  static compareCoverageReports(
    before: { statements: number; branches: number; functions: number; lines: number },
    after: { statements: number; branches: number; functions: number; lines: number }
  ): string {
    const diff = {
      statements: after.statements - before.statements,
      branches: after.branches - before.branches,
      functions: after.functions - before.functions,
      lines: after.lines - before.lines,
    };

    return `
Coverage Changes:
  Statements: ${before.statements.toFixed(2)}% → ${after.statements.toFixed(2)}% (${diff.statements > 0 ? '+' : ''}${diff.statements.toFixed(2)}%)
  Branches:   ${before.branches.toFixed(2)}% → ${after.branches.toFixed(2)}% (${diff.branches > 0 ? '+' : ''}${diff.branches.toFixed(2)}%)
  Functions:  ${before.functions.toFixed(2)}% → ${after.functions.toFixed(2)}% (${diff.functions > 0 ? '+' : ''}${diff.functions.toFixed(2)}%)
  Lines:      ${before.lines.toFixed(2)}% → ${after.lines.toFixed(2)}% (${diff.lines > 0 ? '+' : ''}${diff.lines.toFixed(2)}%)
    `.trim();
  }
}
