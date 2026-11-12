// Repo lint: house rules the compiler cannot see. Works from `git ls-files`, so only tracked files are checked.
//
//   node tools/lint.mjs [--update-baseline]
//
// Each finding prints `level  rule  file:line  message`. Exit 1 on any error-level finding.
//   emdash   error    the em dash (U+2014) or its entities in reader-facing text (ratchet via tools/lint-baseline.json)
//   secrets  error    tracked .env files, or key-shaped strings in tracked text files
//   bigfile  error    tracked file over 5 MB (allow list in tools/lint-allow.json), warning over 1 MB
//   credits  warning  public/ assets not named in CREDITS.md or ASSETS.md
//   links    warning  relative markdown links whose target does not exist
//   nodepin  warning  no engines.node in package.json, or no .nvmrc (the golden hash depends on the JS engine's math)
//
// The em dash is built from a char code so this file never contains one itself.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const T0 = Date.now();
const UPDATE_BASELINE = process.argv.includes('--update-baseline');

const EM = String.fromCharCode(0x2014);
const EM_ENTITY = /&mdash;|&#0*8212;|&#x0*2014;/i;
const hasEm = (s) => s.includes(EM) || EM_ENTITY.test(s);
const countEm = (s) => s.split(EM).length - 1 + (s.match(new RegExp(EM_ENTITY.source, 'gi')) || []).length;

const MB = 1024 * 1024;
const BIG_ERROR = 5 * MB;
const BIG_WARN = 1 * MB;
const SCAN_MAX = 1 * MB; // text files above this (and csv data) are not read for secrets: keys live in small files

const findings = [];
const add = (level, rule, file, line, msg) => findings.push({ level, rule, file, line, msg });

function readJson(rel, fallback) {
  try { return JSON.parse(readFileSync(join(ROOT, rel), 'utf8')); } catch { return fallback; }
}

// One git process for the list and one for every blob size: cheaper than 4000+ stat calls on Windows.
const entries = execFileSync('git', ['ls-files', '-s', '-z'], { cwd: ROOT, maxBuffer: 256 * MB })
  .toString('utf8').split('\0').filter(Boolean)
  .map((e) => { const t = e.indexOf('\t'); return { sha: e.slice(0, t).split(' ')[1], file: e.slice(t + 1) }; });
const blobSize = new Map();
{
  const shas = [...new Set(entries.map((e) => e.sha))];
  const out = execFileSync('git', ['cat-file', '--batch-check=%(objectname) %(objectsize)'], { cwd: ROOT, input: shas.join('\n') + '\n', maxBuffer: 256 * MB }).toString('utf8');
  for (const l of out.split('\n')) { const [sha, n] = l.split(' '); if (sha && n && !Number.isNaN(Number(n))) blobSize.set(sha, Number(n)); }
}
const EMPTY_BLOB = 'e69de29bb2d1d6434b8b29ae775ad8c7e48ca7d0'; // what `git add -N` records; the real size is on disk

const fileSet = [];
const sizes = new Map();
for (const { sha, file } of entries) {
  let sz = blobSize.get(sha);
  if (sz == null || sha === EMPTY_BLOB) {
    try { const st = statSync(join(ROOT, file)); if (!st.isFile()) continue; sz = st.size; } catch { continue; } // deleted in the working tree
  }
  fileSet.push(file);
  sizes.set(file, sz);
}

const extOf = (f) => { const i = f.lastIndexOf('.'); return i < 0 ? '' : f.slice(i + 1).toLowerCase(); };
const baseOf = (f) => f.slice(f.lastIndexOf('/') + 1);

const textCache = new Map();
function text(f) {
  if (textCache.has(f)) return textCache.get(f);
  let s = null;
  try {
    const buf = readFileSync(join(ROOT, f));
    const head = buf.subarray(0, 8000);
    s = head.includes(0) ? null : buf.toString('utf8');
  } catch { s = null; }
  textCache.set(f, s);
  return s;
}

// ---------------------------------------------------------------- 1. emdash
const EM_EXCLUDE = /^(review|journey|art|scratch|dist|site-dist|node_modules|\.venv)\//;
const EM_EXCLUDE_ANY = /(^|\/)(node_modules|\.venv)\//;

// Which lines of a JS/TS source hold the dash inside a string or template literal (comments and regex literals do not count).
function dashLinesInLiterals(src) {
  const hits = new Set();
  const n = src.length;
  let line = 1;
  // state stack: 'code' | 'tpl'. A '${' inside a template pushes 'code' with a brace counter.
  const stack = [{ k: 'code', depth: 0 }];
  let i = 0;
  let prevSig = ''; // previous significant char in code, to guess regex vs divide
  let prevWord = '';
  const top = () => stack[stack.length - 1];
  const mark = (c) => { if (c === EM) hits.add(line); };
  const ENT_START = /^(?:&mdash;|&#0*8212;|&#x0*2014;)/i;
  const entityAt = (pos) => src.charCodeAt(pos) === 38 && ENT_START.test(src.slice(pos, pos + 12));
  while (i < n) {
    const c = src[i];
    const st = top();
    if (st.k === 'tpl') {
      if (c === '\\') { if (src[i + 1] === '\n') line++; i += 2; continue; }
      if (c === '`') { stack.pop(); prevSig = '`'; i++; continue; }
      if (c === '$' && src[i + 1] === '{') { stack.push({ k: 'code', depth: 0 }); i += 2; prevSig = '{'; continue; }
      if (c === '\n') line++;
      mark(c);
      if (entityAt(i)) hits.add(line);
      i++;
      continue;
    }
    // code state
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') { if (src[i + 1] === '\n') line++; i += 2; continue; }
        mark(src[i]);
        if (entityAt(i)) hits.add(line);
        i++;
      }
      if (src[i] === c) i++;
      prevSig = c;
      continue;
    }
    if (c === '`') { stack.push({ k: 'tpl' }); i++; continue; }
    if (c === '{') { st.depth++; prevSig = c; i++; continue; }
    if (c === '}') {
      if (st.depth === 0 && stack.length > 1) { stack.pop(); i++; continue; } // end of ${ } back into the template
      st.depth--; prevSig = c; i++; continue;
    }
    if (c === '/') {
      const regexOk = prevSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prevSig) || ['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw'].includes(prevWord);
      if (regexOk) {
        i++;
        let inClass = false;
        while (i < n && src[i] !== '\n') {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) { i++; break; }
          i++;
        }
        prevSig = ')';
        prevWord = '';
        continue;
      }
      prevSig = c; prevWord = ''; i++; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(src[j])) j++;
      prevWord = src.slice(i, j);
      prevSig = 'a';
      i = j;
      continue;
    }
    if (!/\s/.test(c)) { prevSig = c; prevWord = ''; }
    i++;
  }
  return [...hits].sort((a, b) => a - b);
}

function emdashFindings(f) {
  if (EM_EXCLUDE.test(f) || EM_EXCLUDE_ANY.test(f)) return [];
  const ext = extOf(f);
  const inSite = f.startsWith('site/');
  const lines = (s, pred) => {
    const out = [];
    s.split(/\r?\n/).forEach((l, i) => { if (pred(l)) out.push(i + 1); });
    return out;
  };
  let s;
  if (ext === 'md' || ext === 'html') {
    s = text(f); if (s == null) return [];
    return lines(s, hasEm);
  }
  if (ext === 'css') {
    s = text(f); if (s == null) return [];
    return lines(s, (l) => hasEm(l) && /content\s*:/.test(l));
  }
  if (ext === 'json' && (!f.includes('/') || inSite)) {
    s = text(f); if (s == null) return [];
    return lines(s, hasEm);
  }
  if ((ext === 'ts' && f.startsWith('src/')) || (inSite && ['js', 'mjs', 'cjs', 'ts'].includes(ext))) {
    s = text(f); if (s == null || !hasEm(s)) return [];
    return dashLinesInLiterals(s);
  }
  return [];
}

const baseline = readJson('tools/lint-baseline.json', {});
const emCounts = {};
const emLines = {};
for (const f of fileSet) {
  const hits = emdashFindings(f);
  if (hits.length) {
    let total = 0;
    const s = text(f);
    // count occurrences on the flagged lines so the baseline tracks dashes, not lines
    const all = s.split(/\r?\n/);
    for (const ln of hits) total += Math.max(1, countEm(all[ln - 1] || ''));
    emCounts[f] = total;
    emLines[f] = hits;
  }
}
if (UPDATE_BASELINE) {
  const sorted = Object.fromEntries(Object.keys(emCounts).sort().map((k) => [k, emCounts[k]]));
  writeFileSync(join(ROOT, 'tools/lint-baseline.json'), JSON.stringify(sorted, null, 2) + '\n');
  console.log(`baseline updated: ${Object.keys(sorted).length} files, ${Object.values(sorted).reduce((a, b) => a + b, 0)} dashes`);
}
const base = UPDATE_BASELINE ? emCounts : baseline;
let debt = 0;
let debtFiles = 0;
for (const [f, n] of Object.entries(emCounts)) {
  const allowed = base[f] || 0;
  if (n > allowed) {
    for (const ln of emLines[f]) add('error', 'emdash', f, ln, `em dash in reader-facing text (${n} in file, baseline ${allowed})`);
  } else {
    debt += n; debtFiles++;
  }
}
const staleBaseline = Object.keys(base).filter((f) => (emCounts[f] || 0) < base[f]);

// ---------------------------------------------------------------- 2. secrets
const SECRET_RES = [
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /sk-[A-Za-z0-9]{32,}/,
  /ghp_[A-Za-z0-9]{30,}/,
  /xi-api-key\s*[:=]\s*['"][A-Za-z0-9]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const BINARY_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'ico', 'mp3', 'ogg', 'wav', 'mp4', 'webm', 'mov', 'glb', 'gltf', 'ktx2', 'bin', 'woff', 'woff2', 'ttf', 'otf', 'zip', 'gz', 'pdf', 'exe', 'dll', 'wasm', 'blend', 'psd']);
const DATA_EXT = new Set(['csv', 'tsv']);
for (const f of fileSet) {
  const b = baseOf(f);
  if ((b === '.env' || b.startsWith('.env.')) && !/\.(example|sample|template)$/i.test(b)) {
    add('error', 'secrets', f, 1, 'env file is tracked (it belongs in .gitignore)');
  }
  if (BINARY_EXT.has(extOf(f)) || DATA_EXT.has(extOf(f)) || sizes.get(f) > SCAN_MAX) continue;
  if (EM_EXCLUDE_ANY.test(f)) continue;
  const s = text(f);
  if (s == null) continue;
  // Cheap prefilter so 1000+ csv files cost almost nothing.
  if (!/sk-|AIza|ghp_|xi-api-key|PRIVATE KEY/.test(s)) continue;
  const ls = s.split(/\r?\n/);
  for (let i = 0; i < ls.length; i++) {
    for (const re of SECRET_RES) {
      const m = re.exec(ls[i]);
      if (m) add('error', 'secrets', f, i + 1, `looks like a secret: ${m[0].slice(0, 6)}...`);
    }
  }
}

// ---------------------------------------------------------------- 3. bigfile
const allow = new Set((readJson('tools/lint-allow.json', {}).bigfile) || []);
const big = fileSet.filter((f) => sizes.get(f) > BIG_WARN).sort((a, b) => sizes.get(b) - sizes.get(a));
const mb = (n) => (n / MB).toFixed(2) + ' MB';
let bigListed = 0;
let bigWarn = 0;
let bigAllowed = 0;
for (const f of big) {
  const sz = sizes.get(f);
  if (sz > BIG_ERROR && !allow.has(f)) { add('error', 'bigfile', f, 1, `${mb(sz)} is over 5 MB (add to tools/lint-allow.json only if it must be tracked)`); continue; }
  if (allow.has(f)) { bigAllowed++; continue; }
  bigWarn++;
  if (bigListed < 20) { add('warn', 'bigfile', f, 1, `${mb(sz)} is over 1 MB`); bigListed++; }
}
const bigMore = bigWarn - bigListed;

// ---------------------------------------------------------------- 4. credits
const CREDIT_EXT = new Set(['glb', 'gltf', 'ktx2', 'png', 'jpg', 'jpeg', 'webp', 'mp3', 'ogg', 'wav', 'woff2']);
const creditText = ['CREDITS.md', 'ASSETS.md'].map((f) => { try { return readFileSync(join(ROOT, f), 'utf8'); } catch { return ''; } }).join('\n').toLowerCase();
const creditAssets = fileSet.filter((f) => f.startsWith('public/') && CREDIT_EXT.has(extOf(f)));
const uncovered = [];
for (const f of creditAssets) {
  const parts = f.split('/');
  const bn = parts[parts.length - 1].toLowerCase();
  const parent = parts.length > 2 ? parts[parts.length - 2].toLowerCase() : '';
  const relDir = parts.slice(1, -1).join('/').toLowerCase();
  const covered = creditText.includes(bn)
    || (parent && (creditText.includes(parent + '/') || (relDir && creditText.includes(relDir + '/'))));
  if (!covered) uncovered.push(f);
}
if (uncovered.length) {
  for (const f of uncovered.slice(0, 20)) add('warn', 'credits', f, 1, 'asset not named in CREDITS.md or ASSETS.md (by file or parent folder)');
  if (uncovered.length > 20) add('warn', 'credits', 'public/', 1, `...and ${uncovered.length - 20} more uncovered assets (${uncovered.length} of ${creditAssets.length} total)`);
}

// ---------------------------------------------------------------- 5. links
const LINK_RE = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
for (const f of fileSet) {
  if (extOf(f) !== 'md') continue;
  if (f.includes('/') && !f.startsWith('docs/')) continue;
  const s = text(f); if (s == null) continue;
  let fence = false;
  s.split(/\r?\n/).forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return; }
    if (fence) return;
    const stripped = l.replace(/`[^`]*`/g, '');
    let m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(stripped))) {
      let t = m[1];
      if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(t) && !/^[A-Za-z]:[\\/]/.test(t)) continue; // http:, mailto:, #anchor
      if (/^[A-Za-z]:[\\/]/.test(t)) continue; // absolute Windows path, outside this check
      t = t.replace(/[#?].*$/, '').replace(/:\d+(-\d+)?$/, '');
      if (!t) continue;
      try { t = decodeURIComponent(t); } catch { /* keep as is */ }
      const target = t.startsWith('/') ? t.slice(1) : posix.join(posix.dirname(f), t);
      if (!existsSync(join(ROOT, target))) add('warn', 'links', f, i + 1, `broken relative link: ${m[1]}`);
    }
  });
}

// ---------------------------------------------------------------- 6. nodepin
{
  const pkg = readJson('package.json', {});
  if (!pkg.engines || !pkg.engines.node) add('warn', 'nodepin', 'package.json', 1, 'no engines.node (the golden hash depends on the JS engine\'s math functions)');
  if (!existsSync(join(ROOT, '.nvmrc'))) add('warn', 'nodepin', '.nvmrc', 1, 'missing .nvmrc (pin the Node major the golden hash was made on)');
}

// ---------------------------------------------------------------- report
const order = ['emdash', 'secrets', 'bigfile', 'credits', 'links', 'nodepin'];
findings.sort((a, b) => order.indexOf(a.rule) - order.indexOf(b.rule) || (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
for (const f of findings) console.log(`${f.level.padEnd(5)}  ${f.rule.padEnd(7)}  ${f.file}:${f.line}  ${f.msg}`);

console.log(`\nemdash baseline debt: ${debt} dash${debt === 1 ? '' : 'es'} in ${debtFiles} file${debtFiles === 1 ? '' : 's'}` + (staleBaseline.length ? ` (${staleBaseline.length} baseline entr${staleBaseline.length === 1 ? 'y is' : 'ies are'} above the actual count: run --update-baseline to ratchet down)` : ''));
if (bigMore > 0) console.log(`bigfile: ${bigMore} more files over 1 MB not listed`);
if (bigAllowed) console.log(`bigfile: ${bigAllowed} file${bigAllowed === 1 ? '' : 's'} over 1 MB skipped via tools/lint-allow.json`);
if (uncovered.length) console.log(`credits: ${uncovered.length} of ${creditAssets.length} public assets not covered`);

const errors = findings.filter((f) => f.level === 'error').length;
const warnings = findings.filter((f) => f.level === 'warn').length + Math.max(0, bigMore);
console.log(`lint: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}, ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(errors ? 1 : 0);
