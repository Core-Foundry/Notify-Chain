const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'src/database/schema.sql');
let content = fs.readFileSync(schemaPath, 'utf8');

// Remove all ALTER TABLE statements for next_retry_at
content = content.replace(/ALTER TABLE scheduled_notifications ADD COLUMN next_retry_at DATETIME;/g, '');

fs.writeFileSync(schemaPath, content, 'utf8');
console.log('Fixed schema.sql');
