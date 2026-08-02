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

// Fix missing brace in types/notification-template.ts
fixFile('types/notification-template.ts', (c) => {
  let res = c;
  res = res.replace(/  updated_by: string \| null;\nexport interface NotificationTemplate \{/g, '  updated_by: string | null;\n}\nexport interface NotificationTemplate {');
  
  // Rename duplicate types to Old*
  res = res.replace(/export interface NotificationTemplateRow \{\n  id: string;\n  name: string;/g, 'export interface NotificationTemplateRowOld {\n  id: string;\n  name: string;');
  res = res.replace(/export interface NotificationTemplate \{\n  id: string;\n  name: string;/g, 'export interface NotificationTemplateOld {\n  id: string;\n  name: string;');
  res = res.replace(/export interface CreateNotificationTemplateInput \{\n  id: string;\n  name: string;/g, 'export interface CreateNotificationTemplateInputOld {\n  id: string;\n  name: string;');
  res = res.replace(/export interface UpdateNotificationTemplateInput \{\n  name\?: string;/g, 'export interface UpdateNotificationTemplateInputOld {\n  name?: string;');
  return res;
});

// Update files using the OLD template types
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
    // Replace imports and usages carefully
    // We only want to replace NotificationTemplate with NotificationTemplateOld, avoiding double-renaming
    // and we only want to replace it as an identifier (word boundary)
    res = res.replace(/\bNotificationTemplate\b/g, 'NotificationTemplateOld');
    res = res.replace(/\bNotificationTemplateRow\b/g, 'NotificationTemplateRowOld');
    res = res.replace(/\bCreateNotificationTemplateInput\b/g, 'CreateNotificationTemplateInputOld');
    res = res.replace(/\bUpdateNotificationTemplateInput\b/g, 'UpdateNotificationTemplateInputOld');
    
    // Fix the class names which were also renamed by the above regex!
    res = res.replace(/\bNotificationTemplateOldService\b/g, 'NotificationTemplateService');
    res = res.replace(/\bNotificationTemplateOldRepository\b/g, 'NotificationTemplateRepository');
    res = res.replace(/\bNotificationTemplateOldCache\b/g, 'NotificationTemplateCache');
    
    // Also in notification-template-service.ts, remove duplicate methods
    if (f === 'services/notification-template-service.ts') {
      res = res.replace(/  async delete\(templateId: string\): Promise<void> \{\n    await this\.repository\.delete\(templateId\);\n    this\.cache\.invalidate\(templateId\);\n  \}/g, '');
      res = res.replace(/  async getAll\(\): Promise<NotificationTemplateOld\[\]> \{\n    return this\.repository\.listAll\(\);\n  \}/g, '');
    }
    
    return res;
  });
});
