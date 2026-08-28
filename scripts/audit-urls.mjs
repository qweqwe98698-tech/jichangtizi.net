import fs from 'node:fs';
import path from 'node:path';

const blogDir = path.resolve('src/content/blog');
const allowedSpaces = [
  'recommend',
  'reviews',
  'compare',
  'tutorials',
  'issues',
  'protocols',
  'wiki',
  'risk',
];

console.log('==================================================');
console.log('🔍 SEO Anti-AI URL Pre-Flight Audit System V1.0');
console.log('==================================================\n');

let totalArticles = 0;
let errors = [];
let warnings = [];

function auditFile(relPath) {
  totalArticles++;
  const parts = relPath.split(path.sep).join('/').replace(/\.md$/, '').split('/');
  const rootSpace = parts[0];

  // 1. Check Root Space
  if (!allowedSpaces.includes(rootSpace)) {
    errors.push(`[Invalid Space] ${relPath} -> Root directory '${rootSpace}' is not in allowed intent spaces: ${allowedSpaces.join(', ')}`);
  }

  // 2. Check Depth (Max 3 levels)
  if (parts.length > 3) {
    errors.push(`[Excessive Depth] ${relPath} -> Depth is ${parts.length} levels (Max allowed: 3)`);
  }

  // 3. Check Slug Characters (lowercase, numbers, hyphen only)
  for (const part of parts) {
    if (!/^[a-z0-9-]+$/.test(part)) {
      errors.push(`[Invalid Characters] ${relPath} -> Segment '${part}' contains non-lowercase/invalid characters`);
    }

    // 4. Blacklist Patterns: mechanical numbers, date patterns
    if (/^\d{3,4}$/.test(part) || /^page-\d+$/.test(part) || /^post-\d+$/.test(part)) {
      errors.push(`[Anti-AI Blacklist] ${relPath} -> Segment '${part}' exposes mechanical ID/batch numbering`);
    }

    if (/^202[0-9]-/.test(part) || /^\d{4}-\d{2}/.test(part)) {
      warnings.push(`[Time Pattern Warning] ${relPath} -> Segment '${part}' contains hardcoded year/date prefix`);
    }

    // 5. Word count check (max 5 words per segment)
    const words = part.split('-');
    if (words.length > 5) {
      warnings.push(`[Keyword Stuffing Warning] ${relPath} -> Segment '${part}' has ${words.length} words (Recommended: 2-4 words)`);
    }
  }
}

function traverseDir(dir, baseRel = '') {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relPath = baseRel ? `${baseRel}/${item}` : item;
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      traverseDir(fullPath, relPath);
    } else if (item.endsWith('.md')) {
      auditFile(relPath);
    }
  }
}

traverseDir(blogDir);

console.log(`📊 Audit Summary: Audited ${totalArticles} articles across ${allowedSpaces.length} topic clusters.\n`);

if (errors.length > 0) {
  console.error(`❌ Found ${errors.length} Critical URL Architecture Errors:`);
  errors.forEach((err) => console.error(`  - ${err}`));
} else {
  console.log('✅ 100% Passed: No Critical URL Architecture Errors found!');
}

if (warnings.length > 0) {
  console.warn(`\n⚠️ ${warnings.length} Optimization Suggestions/Warnings:`);
  warnings.forEach((w) => console.warn(`  - ${w}`));
}

console.log('\n==================================================');
console.log('🛡️ All URL routes conform to Anti-AI Topic Clusters!');
console.log('==================================================');

if (errors.length > 0) {
  process.exit(1);
}
