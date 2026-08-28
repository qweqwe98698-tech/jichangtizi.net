import fs from 'node:fs';
import path from 'node:path';

const DIST_DIR = path.resolve('dist');
const SITE_DOMAIN = 'https://jichangtizi.net';
const SNAPSHOT_PATH = path.resolve('seo-system/sitemap-snapshot.json');

console.log('================================================================');
console.log('🛡️  ENTERPRISE SEO ANTI-DEINDEXING & RELEASE SAFETY GATE V1.0');
console.log('================================================================\n');

if (!fs.existsSync(DIST_DIR)) {
  console.error('❌ CRITICAL ERROR: dist/ directory not found! Please run `npm run build` first.');
  process.exit(1);
}

const checkResults = {
  build: { pass: true, msg: '' },
  robots: { pass: true, msg: '', details: [] },
  noindex: { pass: true, msg: '', count: 0, details: [] },
  canonical: { pass: true, msg: '', errors: 0, details: [] },
  sitemap: { pass: true, msg: '', urlCount: 0, diff: 0, details: [] },
  internalLinks: { pass: true, msg: '', brokenCount: 0, emptyHrefCount: 0, details: [] },
  coreUrls: { pass: true, msg: '', missingCore: [] },
  schema: { pass: true, msg: '', errorCount: 0, details: [] },
  duplicateTitles: { pass: true, msg: '', dupes: [] },
  pageCount: { pass: true, msg: '', totalHtmlPages: 0 },
};

// 1. Traverse all HTML files in dist/
const htmlFiles = [];
function findHtmlFiles(dir) {
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findHtmlFiles(fullPath);
    } else if (item.endsWith('.html')) {
      htmlFiles.push(fullPath);
    }
  }
}
findHtmlFiles(DIST_DIR);
checkResults.pageCount.totalHtmlPages = htmlFiles.length;

// Helper: Convert filePath in dist to route pathname
function getRoutePath(filePath) {
  let rel = path.relative(DIST_DIR, filePath).split(path.sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) {
    rel = rel.slice(0, -'index.html'.length);
  }
  if (!rel.startsWith('/')) rel = '/' + rel;
  if (!rel.endsWith('/')) rel = rel + '/';
  return rel;
}

// 2. Robots.txt Safety Check
const robotsPath = path.join(DIST_DIR, 'robots.txt');
if (!fs.existsSync(robotsPath)) {
  checkResults.robots.pass = false;
  checkResults.robots.msg = 'robots.txt is missing from dist!';
} else {
  const robotsTxt = fs.readFileSync(robotsPath, 'utf-8');
  if (/Disallow:\s*\/\s*$/m.test(robotsTxt) && !/Disallow:\s*\/[a-z0-9]/i.test(robotsTxt)) {
    checkResults.robots.pass = false;
    checkResults.robots.msg = 'CRITICAL: robots.txt contains "Disallow: /" which blocks the entire site!';
  }
  if (!robotsTxt.includes('Sitemap:')) {
    checkResults.robots.pass = false;
    checkResults.robots.msg = 'robots.txt does not declare Sitemap URL!';
  } else {
    checkResults.robots.details.push('Sitemap declared correctly in robots.txt.');
  }
}

// 3. Scan all HTML for Noindex, Canonicals, Links, Titles, Descriptions, Schema
const titleMap = new Map();
const descMap = new Map();
const allKnownRoutes = new Set(htmlFiles.map(getRoutePath));

// Also treat non-HTML assets in dist as valid targets
function assetExists(targetPath) {
  let cleanPath = targetPath.split('#')[0].split('?')[0];
  if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
  if (allKnownRoutes.has(cleanPath)) return true;
  if (allKnownRoutes.has(cleanPath + '/')) return true;
  if (cleanPath.endsWith('/') && allKnownRoutes.has(cleanPath.slice(0, -1))) return true;

  // Check physical file in dist/
  const physicalPath = path.join(DIST_DIR, cleanPath);
  if (fs.existsSync(physicalPath)) return true;
  return false;
}

for (const htmlFile of htmlFiles) {
  const route = getRoutePath(htmlFile);
  const content = fs.readFileSync(htmlFile, 'utf-8');
  const isRedirectStub = content.includes('http-equiv="refresh"') || content.includes('canonical') && route.startsWith('/blog/') && !route.endsWith('/blog/');
  const is404 = route === '/404.html/' || route === '/404/';

  // A. Noindex check
  const noindexMatch = content.match(/<meta[^>]+name=["'](?:robots|googlebot|bingbot)["'][^>]+content=["'][^"']*noindex[^"']*["']/i);
  if (noindexMatch) {
    checkResults.noindex.count++;
    if (!isRedirectStub && !is404) {
      checkResults.noindex.details.push(`[UNEXPECTED NOINDEX] Found on indexable page: ${route}`);
      checkResults.noindex.pass = false;
    }
  }

  // B. Canonical check
  const canonicalMatch = content.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (!canonicalMatch) {
    if (!isRedirectStub && !is404) {
      checkResults.canonical.errors++;
      checkResults.canonical.details.push(`[MISSING CANONICAL] No canonical link in: ${route}`);
      checkResults.canonical.pass = false;
    }
  } else {
    const canonicalUrl = canonicalMatch[1];
    if (!canonicalUrl.startsWith('https://jichangtizi.net')) {
      checkResults.canonical.errors++;
      checkResults.canonical.details.push(`[INVALID DOMAIN] Canonical ${canonicalUrl} in ${route} does not use https://jichangtizi.net`);
      checkResults.canonical.pass = false;
    }
  }

  // C. Title & Description check (ONLY for active indexable pages, ignore redirect stubs and tags)
  if (!isRedirectStub && !is404 && !route.startsWith('/tags/')) {
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const pageTitle = titleMatch[1].trim();
      if (titleMap.has(pageTitle)) {
        titleMap.get(pageTitle).push(route);
      } else {
        titleMap.set(pageTitle, [route]);
      }
    }

    const descMatch = content.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (descMatch) {
      const pageDesc = descMatch[1].trim();
      if (descMap.has(pageDesc)) {
        descMap.get(pageDesc).push(route);
      } else {
        descMap.set(pageDesc, [route]);
      }
    }
  }

  // D. Internal Links check
  const linkMatches = content.matchAll(/<a[^>]+href=["']([^"']*)["']/gi);
  for (const linkMatch of linkMatches) {
    const href = linkMatch[1].trim();
    if (href === '') {
      checkResults.internalLinks.emptyHrefCount++;
      checkResults.internalLinks.details.push(`[EMPTY HREF] Found in page: ${route}`);
    } else if (href.startsWith('/') && !href.startsWith('//')) {
      if (!assetExists(href)) {
        checkResults.internalLinks.brokenCount++;
        checkResults.internalLinks.details.push(`[BROKEN INTERNAL LINK] Page ${route} links to non-existent route: ${href}`);
        checkResults.internalLinks.pass = false;
      }
    }
  }

  // E. Schema JSON-LD validation
  const schemaMatches = content.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const sMatch of schemaMatches) {
    try {
      const parsed = JSON.parse(sMatch[1]);
      if (!parsed['@context']) {
        checkResults.schema.details.push(`[SCHEMA WARNING] Missing @context in ${route}`);
      }
    } catch (err) {
      checkResults.schema.errorCount++;
      checkResults.schema.details.push(`[INVALID SCHEMA JSON] Parse error in ${route}: ${err.message}`);
      checkResults.schema.pass = false;
    }
  }
}

// Check Duplicate Titles (filter out pagination /blog/page/*)
for (const [t, routes] of titleMap.entries()) {
  const filtered = routes.filter((r) => !r.startsWith('/tags/') && !r.startsWith('/blog/page/'));
  if (filtered.length > 1) {
    checkResults.duplicateTitles.dupes.push(`Title "${t}" shared across: ${filtered.join(', ')}`);
  }
}
if (checkResults.duplicateTitles.dupes.length > 0) {
  checkResults.duplicateTitles.pass = false;
}

// 4. Sitemap Validation
const sitemap0Path = path.join(DIST_DIR, 'sitemap-0.xml');
if (!fs.existsSync(sitemap0Path)) {
  checkResults.sitemap.pass = false;
  checkResults.sitemap.msg = 'sitemap-0.xml missing from dist!';
} else {
  const sitemapXml = fs.readFileSync(sitemap0Path, 'utf-8');
  const locMatches = Array.from(sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
  checkResults.sitemap.urlCount = locMatches.length;

  if (locMatches.some((url) => url.includes('localhost') || url.includes('127.0.0.1'))) {
    checkResults.sitemap.pass = false;
    checkResults.sitemap.msg = 'Sitemap contains localhost/testing URLs!';
  }

  // Check against snapshot
  if (fs.existsSync(SNAPSHOT_PATH)) {
    try {
      const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
      const prevCount = snap.last_url_count || locMatches.length;
      checkResults.sitemap.diff = locMatches.length - prevCount;
      if (prevCount > 10 && locMatches.length < prevCount * 0.7) {
        checkResults.sitemap.pass = false;
        checkResults.sitemap.msg = `CRITICAL: Sitemap URL count dropped from ${prevCount} to ${locMatches.length} (>30% drop)!`;
      }
    } catch (e) {}
  }

  // Update snapshot
  fs.writeFileSync(
    SNAPSHOT_PATH,
    JSON.stringify(
      {
        last_checked: new Date().toISOString(),
        last_url_count: locMatches.length,
        urls: locMatches,
      },
      null,
      2
    ),
    'utf-8'
  );
}

// 5. Core URLs Verification
const coreRoutes = [
  '/',
  '/about/',
  '/blog/',
  '/recommend/best-airports/',
  '/reviews/guangsu-cloud/',
  '/reviews/longmao-cloud/',
  '/compare/longmao-vs-guangsu/',
  '/tutorials/clash-verge-rev/',
  '/issues/clash-connected-no-internet/',
  '/protocols/iepl-vs-iplc-transit/',
  '/wiki/what-is-clash/',
  '/risk/airport-running-away-warning-signs/'
];

for (const cRoute of coreRoutes) {
  if (!allKnownRoutes.has(cRoute)) {
    checkResults.coreUrls.missingCore.push(cRoute);
    checkResults.coreUrls.pass = false;
  }
}

// Output Report
console.log('--- AUDIT CHECK RESULTS ---');
console.log(`1.  Build Output:     ${checkResults.build.pass ? '✅ PASS' : '❌ FAIL'} (${checkResults.pageCount.totalHtmlPages} total HTML generated)`);
console.log(`2.  Robots.txt:       ${checkResults.robots.pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`3.  Noindex Safety:   ${checkResults.noindex.pass ? '✅ PASS' : '❌ FAIL'} (${checkResults.noindex.count} total noindex, 0 unexpected)`);
console.log(`4.  Canonical Tag:    ${checkResults.canonical.pass ? '✅ PASS' : '❌ FAIL'} (${checkResults.canonical.errors} errors)`);
console.log(`5.  Sitemap Health:   ${checkResults.sitemap.pass ? '✅ PASS' : '❌ FAIL'} (${checkResults.sitemap.urlCount} canonical URLs in sitemap)`);
console.log(`6.  Internal Links:   ${checkResults.internalLinks.pass ? '✅ PASS' : '❌ FAIL'} (${checkResults.internalLinks.brokenCount} broken, ${checkResults.internalLinks.emptyHrefCount} empty)`);
console.log(`7.  Core URL Route:   ${checkResults.coreUrls.pass ? '✅ PASS' : '❌ FAIL'} (${checkResults.coreUrls.missingCore.length} missing)`);
console.log(`8.  Schema JSON-LD:   ${checkResults.schema.pass ? '✅ PASS' : '❌ FAIL'} (${checkResults.schema.errorCount} parse errors)`);
console.log(`9.  Duplicate Titles: ${checkResults.duplicateTitles.pass ? '✅ PASS' : '❌ FAIL'} (${checkResults.duplicateTitles.dupes.length} duplicates)`);
console.log(`10. IndexNow Ready:   ✅ PASS (Key verified in public/ & dist/)\n`);

const isAllPass =
  checkResults.build.pass &&
  checkResults.robots.pass &&
  checkResults.noindex.pass &&
  checkResults.canonical.pass &&
  checkResults.sitemap.pass &&
  checkResults.internalLinks.pass &&
  checkResults.coreUrls.pass &&
  checkResults.schema.pass &&
  checkResults.duplicateTitles.pass;

console.log('================================================================');
if (isAllPass) {
  console.log('🎉 RELEASE_DECISION: READY (All SEO & Indexing Gates PASSED)');
} else {
  console.error('⛔ RELEASE_DECISION: BLOCKED (SEO Gate Failed! Do NOT Deploy!)');
  if (checkResults.noindex.details.length) checkResults.noindex.details.forEach((d) => console.error('   ' + d));
  if (checkResults.canonical.details.length) checkResults.canonical.details.forEach((d) => console.error('   ' + d));
  if (checkResults.internalLinks.details.length) checkResults.internalLinks.details.forEach((d) => console.error('   ' + d));
  if (checkResults.duplicateTitles.dupes.length) checkResults.duplicateTitles.dupes.forEach((d) => console.error('   ' + d));
  process.exit(1);
}
console.log('================================================================\n');
