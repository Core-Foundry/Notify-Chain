const fs = require('fs');
const path = require('path');

const listenerDir = path.join(__dirname, 'src');

function fixFile(relativePath, replacer) {
  const filePath = path.join(listenerDir, relativePath);
  if (!fs.existsSync(filePath)) {
    console.log('File not found:', relativePath);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let newContent = replacer(content);
  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Fixed', relativePath);
  }
}

// 1. config.ts
fixFile('config.ts', (c) => {
  let lines = c.split('\n');
  if (lines[0].includes('import { Config') && lines[1].includes('import { Config')) {
    lines.splice(0, 1); // remove duplicate line 1
  }
  return lines.join('\n');
});

// 2. index.ts
fixFile('index.ts', (c) => {
  let res = c;
  res = res.replace(/    notificationAPI,\n    templateService,\n    rateLimit:/g, '    rateLimit:');
  return res;
});

// 3. batch-validation-service.ts
fixFile('services/batch-validation-service.ts', (c) => {
  return c.replace(/          error: validation.error \?\? '',\n          error: validation.error \?\? 'Invalid notification item',/g, "          error: validation.error ?? 'Invalid notification item',");
});

// 4. event-processing-queue.ts
fixFile('services/event-processing-queue.ts', (c) => {
  return c.replace(/  \/\/ Metrics\n  private metrics = \{\n    totalEnqueued: 0,\n    totalProcessed: 0,\n    totalSucceeded: 0,\n    totalFailed: 0,\n    processingTimes: \[\] as number\[\],\n  \};\n\n  \/\/ Metrics/g, '  // Metrics');
});

// 5. notification-retry-queue.ts
fixFile('services/notification-retry-queue.ts', (c) => {
  let res = c.replace(/  \/\/ Metrics\n  private metrics = \{\n    totalEnqueued: 0,\n    totalProcessed: 0,\n    totalSucceeded: 0,\n    totalFailed: 0,\n    processingTimes: \[\] as number\[\],\n  \};\n\n  \/\/ Metrics/g, '  // Metrics');
  res = res.replace(/    this.queue.push\(\{ event, contractConfig, retryCount: 0, nextRetryAt, requestId \}\);\n    this.metrics.totalEnqueued\+\+;\n    this.queue.push\(\{ event, contractConfig, retryCount: 0, nextRetryAt, requestId, priority, enqueuedAt: Date.now\(\) \}\);/g, '    this.metrics.totalEnqueued++;\n    this.queue.push({ event, contractConfig, retryCount: 0, nextRetryAt, requestId, priority, enqueuedAt: Date.now() });');
  return res;
});

// 6. scheduled-notification-repository.ts
fixFile('services/scheduled-notification-repository.ts', (c) => {
  return c.replace(/      payload: decompressPayload\(row\.payload\),\n      payload: row\.payload,/g, '      payload: decompressPayload(row.payload),');
});

// 7. notification-api.ts
fixFile('services/notification-api.ts', (c) => {
  return c.replace(/validatePayloadSize\(input\.payload, this\.maxPayloadSizeBytes\);/g, '// validatePayloadSize(input.payload, this.maxPayloadSizeBytes);');
});

// 8. database/migration-system.ts
fixFile('database/migration-system.ts', (c) => {
  return c.replace(/const rows = await this\.db\.all<\{ id: string \}>\(\n      'SELECT id FROM migrations ORDER BY applied_at'\n    \);\n    return rows\.map\(\(row\) => row\.id\);/g, "const rows = await this.db.all<{ id: string }>(\n      'SELECT id FROM migrations ORDER BY applied_at'\n    );\n    return (rows as any[]).map((row) => row.id);");
});

// 9. template-repository.ts duplicate functions
fixFile('store/event-registry.ts', (c) => {
  return c.replace(/  setTtlMs\(ttlMs: number\): void \{\n    this\.ttlMs = ttlMs;\n  \}\n\n  startCleanup\(intervalMs = 60_000\): void \{\n    if \(this\.cleanupTimer\) return;\n    this\.cleanupTimer = setInterval\(\(\) => this\.pruneExpired\(\), intervalMs\);\n  \}\n\n  setTtlMs\(ms: number\): void \{\n    this\.ttlMs = ms;\n  \}/g, '  setTtlMs(ms: number): void {\n    this.ttlMs = ms;\n  }\n\n  startCleanup(intervalMs = 60_000): void {\n    if (this.cleanupTimer) return;\n    this.cleanupTimer = setInterval(() => this.pruneExpired(), intervalMs);\n  }');
});

// 10. notification-template-service.ts duplicate functions
fixFile('services/notification-template-service.ts', (c) => {
  let res = c;
  res = res.replace(/  async delete\(templateId: string\): Promise<void> \{\n    await this\.repository\.delete\(templateId\);\n    this\.cache\.invalidate\(templateId\);\n  \}/g, '');
  res = res.replace(/  async getAll\(\): Promise<NotificationTemplate\[\]> \{\n    return this\.repository\.listAll\(\);\n  \}/g, '');
  return res;
});

// 11. Rename duplicated NotificationTemplate types
fixFile('types/notification-template.ts', (c) => {
  let res = c;
  res = res.replace(/export interface NotificationTemplateRow \{\n  id: string;/g, 'export interface NotificationTemplateRowOld {\n  id: string;');
  res = res.replace(/export interface NotificationTemplate \{\n  id: string;/g, 'export interface NotificationTemplateOld {\n  id: string;');
  res = res.replace(/export interface CreateNotificationTemplateInput \{/g, 'export interface CreateNotificationTemplateInputOld {');
  res = res.replace(/export interface UpdateNotificationTemplateInput \{/g, 'export interface UpdateNotificationTemplateInputOld {');
  return res;
});

// 12. Update files using the OLD template types
const oldFiles = [
  'services/notification-template-service.ts',
  'services/notification-template-repository.ts',
  'api/template-routes.ts',
  'api/templates-api.test.ts',
  'services/notification-template-service.test.ts',
  'api/events-server.ts'
];

oldFiles.forEach(f => {
  fixFile(f, (c) => {
    let res = c;
    // Replace imports and usages
    res = res.replace(/NotificationTemplate,/g, 'NotificationTemplateOld,');
    res = res.replace(/NotificationTemplate /g, 'NotificationTemplateOld ');
    res = res.replace(/NotificationTemplate>/g, 'NotificationTemplateOld>');
    res = res.replace(/NotificationTemplate\[\]/g, 'NotificationTemplateOld[]');
    res = res.replace(/: NotificationTemplate/g, ': NotificationTemplateOld');
    
    res = res.replace(/NotificationTemplateRow/g, 'NotificationTemplateRowOld');
    res = res.replace(/CreateNotificationTemplateInput/g, 'CreateNotificationTemplateInputOld');
    res = res.replace(/UpdateNotificationTemplateInput/g, 'UpdateNotificationTemplateInputOld');
    return res;
  });
});
