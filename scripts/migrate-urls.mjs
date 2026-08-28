import fs from 'node:fs';
import path from 'node:path';

const blogDir = path.resolve('src/content/blog');

// Migration map: Old filename -> New relative path in src/content/blog
const migrationMap = {
  '2026-airport-recommendation.md': 'recommend/best-airports.md',
  'guangsu-cloud-review.md': 'reviews/guangsu-cloud.md',
  'weifeng-cloud-review.md': 'reviews/weifeng-cloud.md',
  'longmao-cloud-review.md': 'reviews/longmao-cloud.md',
  'longmao-cloud-is-it-worth-buying.md': 'reviews/longmao-cloud/buying-guide.md',
  'longmao-cloud-pricing-plans.md': 'reviews/longmao-cloud/pricing.md',
  'longmao-cloud-nodes-selection-guide.md': 'reviews/longmao-cloud/nodes.md',
  'longmao-cloud-lines-architecture-guide.md': 'reviews/longmao-cloud/lines.md',
  'longmao-cloud-alternatives-recommendations.md': 'compare/longmao-cloud-alternatives.md',
  'longmao-cloud-vs-guangsu-cloud-comparison.md': 'compare/longmao-vs-guangsu.md',
  'clash-verge-rev-tutorial.md': 'tutorials/clash-verge-rev.md',
  'how-to-import-airport-subscription-to-clash.md': 'tutorials/clash-subscription-import.md',
  'longmao-cloud-clash-verge-rev-tutorial.md': 'tutorials/clash/longmao-cloud.md',
  'longmao-cloud-shadowrocket-ios-tutorial.md': 'tutorials/shadowrocket/longmao-cloud.md',
  'clash-connected-no-internet-fix.md': 'issues/clash-connected-no-internet.md',
  'airport-node-low-ping-slow-speed-reasons.md': 'issues/low-ping-slow-speed-reasons.md',
  'longmao-cloud-connected-no-internet-fix.md': 'issues/longmao-cloud-connected-no-internet.md',
  'longmao-cloud-node-timeout-troubleshooting.md': 'issues/longmao-cloud-node-timeout.md',
  'longmao-cloud-slow-speed-reasons-fix.md': 'issues/longmao-cloud-slow-speed.md',
  'iepl-vs-iplc-vs-transit-difference.md': 'protocols/iepl-vs-iplc-transit.md',
  'vless-trojan-hysteria2-comparison.md': 'protocols/vless-trojan-hysteria2.md',
  'what-is-clash-beginner-guide.md': 'wiki/what-is-clash.md',
  'airport-vs-vpn-difference.md': 'wiki/airport-vs-vpn-difference.md',
  'mihomo-vs-clash-difference.md': 'wiki/mihomo-vs-clash.md',
  'clash-tun-mode-vs-system-proxy.md': 'wiki/clash-tun-mode-vs-system-proxy.md',
  'airport-running-away-warning-signs.md': 'risk/airport-running-away-warning-signs.md',
  'longmao-cloud-security-privacy-risk-analysis.md': 'risk/longmao-cloud-security.md',
  'longmao-cloud-is-it-running-away-status-check.md': 'risk/longmao-cloud-status.md',
};

// URL redirect map: /blog/old-slug/ -> /new-path/
const urlRedirects = {};
for (const [oldFile, newRelPath] of Object.entries(migrationMap)) {
  const oldSlug = oldFile.replace(/\.md$/, '');
  const newSlug = newRelPath.replace(/\.md$/, '').replace(/\/index$/, '');
  urlRedirects[`/blog/${oldSlug}/`] = `/${newSlug}/`;
}

// 1. Move files
console.log('--- Moving files to new semantic directories ---');
for (const [oldFile, newRelPath] of Object.entries(migrationMap)) {
  const oldPath = path.join(blogDir, oldFile);
  const newPath = path.join(blogDir, newRelPath);

  if (fs.existsSync(oldPath)) {
    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    fs.renameSync(oldPath, newPath);
    console.log(`Moved: ${oldFile} -> ${newRelPath}`);
  }
}

// 2. Generate public/redirect-map.json
const redirectMapPayload = {
  $schema: 'https://jichangtizi.net/schemas/redirect-map.json',
  version: '1.0.0',
  generated_at: new Date().toISOString(),
  total_redirects: Object.keys(urlRedirects).length,
  redirects: urlRedirects,
};

fs.mkdirSync(path.resolve('public'), { recursive: true });
fs.writeFileSync(
  path.resolve('public/redirect-map.json'),
  JSON.stringify(redirectMapPayload, null, 2),
  'utf-8'
);
console.log('Created public/redirect-map.json with 28 redirects.');

// 3. Update internal links in all markdown files and source files
console.log('--- Updating internal links across codebase ---');
function updateLinksInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let changed = false;

  for (const [oldUrl, newUrl] of Object.entries(urlRedirects)) {
    const oldUrlNoSlash = oldUrl.slice(0, -1);
    const newUrlNoSlash = newUrl.slice(0, -1);

    if (content.includes(oldUrl)) {
      content = content.replaceAll(oldUrl, newUrl);
      changed = true;
    }
    if (content.includes(oldUrlNoSlash)) {
      content = content.replaceAll(oldUrlNoSlash, newUrl);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated links in: ${filePath}`);
  }
}

function traverseAndReplace(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      traverseAndReplace(fullPath);
    } else if (file.endsWith('.md') || file.endsWith('.astro') || file.endsWith('.ts') || file.endsWith('.js')) {
      updateLinksInFile(fullPath);
    }
  }
}

traverseAndReplace(path.resolve('src'));
console.log('Migration script completed successfully.');
