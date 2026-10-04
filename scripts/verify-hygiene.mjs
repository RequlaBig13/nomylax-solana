import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['node_modules', '.next', '.git', 'target', '.anchor', 'coverage']);
const textExt = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.toml', '.rs', '.css', '.example']);
const forbiddenFiles = new Set(['.env', '.env.local', '.env.production', '.env.development']);
const secretPatterns = [
  /sk-ant-[A-Za-z0-9_-]{16,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /EXECUTOR_PRIVATE_KEY\s*=/,
  /\b(?:8453|84532)\b/,
];
const legacySourcePatterns = [/\bviem\b/i, /\bBasescan\b/i, /\bwindow\.ethereum\b/i, /wallet_switchEthereumChain/i];

const failures = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll('\\\\', '/');
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (forbiddenFiles.has(entry.name)) failures.push(`${rel}: secret environment file must not be committed`);
    if (rel === 'scripts/verify-hygiene.mjs') continue;
    const ext = path.extname(entry.name);
    if (!textExt.has(ext) && entry.name !== '.env.example') continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const pattern of secretPatterns) {
      if (pattern.test(text)) failures.push(`${rel}: matched forbidden secret/legacy pattern ${pattern}`);
    }
    if (rel.startsWith('src/')) {
      for (const pattern of legacySourcePatterns) {
        if (pattern.test(text)) failures.push(`${rel}: legacy EVM source pattern ${pattern}`);
      }
    }
  }
}
walk(root);
if (failures.length) {
  console.error('Repository hygiene check failed:\n' + failures.map((x) => `- ${x}`).join('\n'));
  process.exit(1);
}
console.log('Repository hygiene check passed.');
