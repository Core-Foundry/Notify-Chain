const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'src', 'database', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inBeginBlock = false;
  
  const lines = sql.split(/\r?\n/);
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip comments
    if (trimmed.startsWith('--')) {
      continue;
    }
    
    // Check for BEGIN keyword (case insensitive)
    if (/^\s*BEGIN\s*$/i.test(trimmed)) {
      inBeginBlock = true;
    }
    
    current += line + '\n';
    
    // Check for END; which closes the BEGIN block
    if (inBeginBlock && /^\s*END\s*;/i.test(trimmed)) {
      inBeginBlock = false;
      statements.push(current.trim());
      current = '';
      continue;
    }
    
    // If not in BEGIN block and line ends with semicolon, it's a complete statement
    if (!inBeginBlock && trimmed.endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }
  }
  
  // Add any remaining content
  if (current.trim().length > 0) {
    statements.push(current.trim());
  }
  
  return statements.filter(s => s.length > 0);
}

const statements = splitSqlStatements(schema);

console.log(`Total statements: ${statements.length}\n`);

statements.forEach((stmt, idx) => {
  console.log(`Statement ${idx + 1} (${stmt.length} chars):`);
  console.log(stmt.substring(0, 100) + (stmt.length > 100 ? '...' : ''));
  console.log('---');
});
