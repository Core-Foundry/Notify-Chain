#!/usr/bin/env ts-node

/**
 * Stress Test Runner Script
 * 
 * Executes stress tests and generates comprehensive benchmark reports.
 * This script can be run manually or integrated into CI pipelines.
 * 
 * Usage:
 *   npm run stress-test
 *   npm run stress-test -- --report reports/stress-test-report.json
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  output: string;
}

interface StressTestReport {
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    cpus: number;
    totalMemory: string;
  };
  testResults: TestResult[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    totalDuration: number;
  };
}

function getEnvironmentInfo() {
  const os = require('os');
  return {
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.release()}`,
    cpus: os.cpus().length,
    totalMemory: `${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)} GB`,
  };
}

function runStressTests(): StressTestReport {
  console.log('='.repeat(80));
  console.log('NOTIFYCHAIN STRESS TEST SUITE');
  console.log('='.repeat(80));
  console.log('\nStarting stress test execution...\n');

  const startTime = Date.now();
  
  try {
    // Run Jest with the stress test file
    const output = execSync(
      'npm test -- src/__tests__/stress.test.ts --verbose --runInBand --detectOpenHandles',
      {
        cwd: path.resolve(__dirname, '../..'),
        encoding: 'utf-8',
        stdio: 'pipe',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
      }
    );

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(output);

    const report: StressTestReport = {
      timestamp: new Date().toISOString(),
      environment: getEnvironmentInfo(),
      testResults: parseTestOutput(output),
      summary: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        totalDuration: duration,
      },
    };

    // Calculate summary
    report.summary.totalTests = report.testResults.length;
    report.summary.passed = report.testResults.filter(t => t.passed).length;
    report.summary.failed = report.testResults.filter(t => !t.passed).length;

    return report;
  } catch (error: any) {
    // Jest returns non-zero exit code on test failures
    const output = error.stdout || error.message;
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(output);

    const report: StressTestReport = {
      timestamp: new Date().toISOString(),
      environment: getEnvironmentInfo(),
      testResults: parseTestOutput(output),
      summary: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        totalDuration: duration,
      },
    };

    report.summary.totalTests = report.testResults.length;
    report.summary.passed = report.testResults.filter(t => t.passed).length;
    report.summary.failed = report.testResults.filter(t => !t.passed).length;

    return report;
  }
}

function parseTestOutput(output: string): TestResult[] {
  const results: TestResult[] = [];
  
  // Simple parsing - can be enhanced based on actual Jest output format
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (line.includes('✓') || line.includes('✗') || line.includes('PASS') || line.includes('FAIL')) {
      // Extract test information
      const passed = line.includes('✓') || line.includes('PASS');
      
      results.push({
        testName: line.trim(),
        passed,
        duration: 0, // Jest includes this in output
        output: line,
      });
    }
  }

  return results;
}

function saveReport(report: StressTestReport, outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Stress test report saved to: ${outputPath}`);
  console.log('='.repeat(80));
}

function printSummary(report: StressTestReport): void {
  console.log('\n' + '='.repeat(80));
  console.log('STRESS TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Timestamp:        ${report.timestamp}`);
  console.log(`Total Duration:   ${report.summary.totalDuration}ms (${(report.summary.totalDuration / 1000 / 60).toFixed(2)} minutes)`);
  console.log(`Total Tests:      ${report.summary.totalTests}`);
  console.log(`Passed:           ${report.summary.passed}`);
  console.log(`Failed:           ${report.summary.failed}`);
  console.log(`Success Rate:     ${((report.summary.passed / report.summary.totalTests) * 100).toFixed(2)}%`);
  console.log('\nEnvironment:');
  console.log(`  Node Version:   ${report.environment.nodeVersion}`);
  console.log(`  Platform:       ${report.environment.platform}`);
  console.log(`  CPUs:           ${report.environment.cpus}`);
  console.log(`  Total Memory:   ${report.environment.totalMemory}`);
  console.log('='.repeat(80) + '\n');
}

function main(): void {
  const args = process.argv.slice(2);
  const reportPathIndex = args.indexOf('--report');
  const reportPath = reportPathIndex >= 0 && args[reportPathIndex + 1]
    ? args[reportPathIndex + 1]
    : path.resolve(__dirname, '../../reports/stress-test-report.json');

  console.log(`Report will be saved to: ${reportPath}\n`);

  const report = runStressTests();
  
  printSummary(report);
  saveReport(report, reportPath);

  // Exit with appropriate code
  if (report.summary.failed > 0) {
    console.error(`\n❌ ${report.summary.failed} stress test(s) failed.\n`);
    process.exit(1);
  } else {
    console.log(`\n✅ All stress tests passed!\n`);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
