import http from 'node:http';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SERVER_DIR, '..');
const CONFIG_ROOT = path.join(SERVER_DIR, 'config');
const INSTANCE_CONFIG_ROOT = path.join(CONFIG_ROOT, 'instances');
const PUBLIC_ROOT = path.join(PROJECT_ROOT, 'public');
const MODEL_CONFIG_LOCAL = path.join(CONFIG_ROOT, 'model.config.local.json');
const MODEL_CONFIG_EXAMPLE = path.join(CONFIG_ROOT, 'model.config.example.json');
const KB_PATH_CONFIG_LOCAL = path.join(CONFIG_ROOT, 'kb.paths.local.json');
const KB_PATH_CONFIG_EXAMPLE = path.join(CONFIG_ROOT, 'kb.paths.example.json');

const CLI_OPTIONS = parseCliArgs(process.argv.slice(2));
if (CLI_OPTIONS.help) {
  printUsage();
  process.exit(0);
}

loadEnv(path.join(PROJECT_ROOT, '.env.local'));
loadEnv(path.join(CONFIG_ROOT, 'env.local'));
loadEnv(path.join(CONFIG_ROOT, 'env.example'), false);
loadEnv(path.join(PROJECT_ROOT, '.env.example'), false);

const INSTANCE_CONFIG = loadInstanceConfig(CLI_OPTIONS.config);
const INSTANCE_NAME = String(instanceConfigValue('name', 'INSTANCE_NAME', instanceNameFromPath(INSTANCE_CONFIG.path))).trim() || 'default';
const HOST = String(instanceConfigValue('host', 'HOST', '127.0.0.1')).trim() || '127.0.0.1';
const PORT = Number(instanceConfigValue('port', 'PORT', 5177)) || 5177;
const DEFAULT_KB_PROJECT_ROOT = path.join(PROJECT_ROOT, '..', 'sgsg_knowledge_base');
const KB_PROJECT_ROOT = resolveProjectPath(String(instanceConfigValue('kbProjectRoot', 'KB_PROJECT_ROOT', DEFAULT_KB_PROJECT_ROOT)).trim() || DEFAULT_KB_PROJECT_ROOT);
const KB_EXCEL_SCRIPTS_ROOT = path.join(KB_PROJECT_ROOT, 'scripts', 'excel');
const DEFAULT_POWERSHELL_BIN = process.platform === 'win32' ? 'powershell' : 'pwsh';
const POWERSHELL_BIN = String(instanceConfigValue('powershellBin', 'POWERSHELL_BIN', DEFAULT_POWERSHELL_BIN)).trim() || DEFAULT_POWERSHELL_BIN;
const BASIC_AUTH = String(instanceConfigValue('basicAuth', 'BASIC_AUTH', ''));
const MODEL_CONFIG_PATH = resolveOptionalProjectPath(instanceConfigValue('modelConfig', 'MODEL_CONFIG', ''));
const KB_PATHS_CONFIG_PATH = resolveOptionalProjectPath(instanceConfigValue('kbPathsConfig', 'KB_PATHS_CONFIG', ''));

const KB_PATHS = loadKbPathConfig();
const INSTANCE_KB_ROOT = String(hasInstanceConfigValue('kbRoot') ? INSTANCE_CONFIG.values.kbRoot : '').trim();
const KB_ROOT = resolveProjectPath(
  INSTANCE_KB_ROOT || KB_PATHS.kbRoot || process.env.KB_ROOT || path.join(KB_PROJECT_ROOT, 'knowledge-base')
);
const DOC_TABS = normalizeDocTabs(KB_PATHS.tabs);
const PRIMARY_TAB = DOC_TABS.find((tab) => tab.key === KB_PATHS.navigation.primaryTab) || DOC_TABS[0];
const WOVEN_CONFIG = normalizeWovenConfig(KB_PATHS.woven);
const WOVEN_GROUPS = normalizeWovenGroups(WOVEN_CONFIG.groups, WOVEN_CONFIG);
const IMAGE_ROOT_REL = normalizeConfiguredRelPath(KB_PATHS.assets.imageRoot || 'raw/excel-images');
const CHAT_CORPUS_TABS = normalizeChatCorpusTabs();
const DOCUMENT_GROUP = {
  key: 'documents',
  label: KB_PATHS.navigation.label || '文档',
  dir: PRIMARY_TAB.path,
  type: 'wiki',
  priority: 1
};

let docCache = { scannedAt: null, groups: [], docs: [] };
let wovenDocCache = { scannedAt: null, groups: [], docs: [] };
let chatDocCache = { scannedAt: null, docs: [] };

function resolveProjectPath(value) {
  const input = String(value || '').trim();
  if (!input) return input;
  return path.isAbsolute(input) ? input : path.resolve(PROJECT_ROOT, input);
}

function resolveOptionalProjectPath(value) {
  const input = String(value || '').trim();
  return input ? resolveProjectPath(input) : '';
}

function parseCliArgs(argv) {
  const options = { config: '', help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--config') {
      options.config = argv[index + 1] || '';
      index += 1;
    } else if (arg.startsWith('--config=')) {
      options.config = arg.slice('--config='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printUsage() {
  console.log(`Usage:
  node server/server.mjs
  node server/server.mjs --config server/config/instances/fuxi.local.json

Instance config files should live in:
  ${path.relative(PROJECT_ROOT, INSTANCE_CONFIG_ROOT)}`);
}

function loadInstanceConfig(configPath) {
  if (!configPath) return { path: '', values: {} };
  const resolved = resolveProjectPath(configPath);
  if (!existsSync(resolved)) throw new Error(`Instance config not found: ${resolved}`);
  const parsed = parseJsonWithComments(requireText(resolved));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Instance config must be a JSON object: ${resolved}`);
  }
  return { path: resolved, values: parsed };
}

function hasInstanceConfigValue(key) {
  return Object.prototype.hasOwnProperty.call(INSTANCE_CONFIG.values, key);
}

function instanceConfigValue(key, envName, fallback) {
  if (hasInstanceConfigValue(key)) return INSTANCE_CONFIG.values[key];
  if (envName && process.env[envName] !== undefined) return process.env[envName];
  return fallback;
}

function instanceNameFromPath(configPath) {
  if (!configPath) return 'default';
  return path.basename(configPath, path.extname(configPath)).replace(/\.local$|\.example$/, '') || 'default';
}

function relativeProjectPath(filePath) {
  const input = String(filePath || '');
  return input ? normalizeRel(path.relative(PROJECT_ROOT, input)) : '';
}

function loadEnv(filePath, override = true) {
  if (!existsSync(filePath)) return;
  const text = requireText(filePath);
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (override || !process.env[key]) process.env[key] = value;
  }
}

function requireText(filePath) {
  return existsSync(filePath) ? Buffer.from(readFileSync(filePath)).toString('utf8') : '';
}

function parseJsonWithComments(text) {
  return JSON.parse(stripJsonComments(String(text || '').replace(/^\uFEFF/, '')));
}

function stripJsonComments(text) {
  let output = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inLineComment) {
      if (char === '\n' || char === '\r') {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      } else if (char === '\n' || char === '\r') {
        output += char;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function loadKbPathConfig() {
  const defaults = {
    kbRoot: '',
    navigation: {
      label: '文档',
      primaryTab: 'arranged',
      titleFrom: ['frontmatter.title', 'h1', 'filename'],
      includeFallbackDocs: true
    },
    tabs: [
      { key: 'arranged', label: '整理版', path: 'wiki/imported-excel', type: 'markdown', role: 'curated' },
      { key: 'imageMd', label: '原始文件', path: 'raw/excel-md-with-images', type: 'markdown', role: 'source' }
    ],
    woven: {
      label: '专题',
      titleFrom: ['frontmatter.title', 'h1', 'filename'],
      groups: [
        { key: 'topics', label: '主题页', path: 'wiki/topics', type: 'wiki', role: 'compiled_topic' },
        { key: 'entities', label: '实体页', path: 'wiki/entities', type: 'wiki', role: 'compiled_entity' }
      ]
    },
    assets: { imageRoot: 'raw/excel-images' }
  };
  const configPath = KB_PATHS_CONFIG_PATH || (existsSync(KB_PATH_CONFIG_LOCAL) ? KB_PATH_CONFIG_LOCAL : KB_PATH_CONFIG_EXAMPLE);
  if (!existsSync(configPath)) return defaults;
  try {
    const parsed = parseJsonWithComments(requireText(configPath));
    return mergeKbPathConfig(defaults, parsed);
  } catch (error) {
    console.warn(`Failed to load KB path config ${configPath}: ${error.message}`);
    return defaults;
  }
}

function mergeKbPathConfig(defaults, parsed) {
  const merged = {
    ...defaults,
    ...parsed,
    navigation: { ...defaults.navigation, ...(parsed.navigation || {}) },
    woven: { ...defaults.woven, ...(parsed.woven || {}) },
    assets: { ...defaults.assets, ...(parsed.assets || {}) }
  };
  if (Array.isArray(parsed.tabs) && parsed.tabs.length) merged.tabs = parsed.tabs;
  if (Array.isArray(parsed.woven?.groups) && parsed.woven.groups.length) merged.woven.groups = parsed.woven.groups;
  return merged;
}

function publicInstanceConfig() {
  const kbPathsConfig = KB_PATHS_CONFIG_PATH || (existsSync(KB_PATH_CONFIG_LOCAL) ? KB_PATH_CONFIG_LOCAL : KB_PATH_CONFIG_EXAMPLE);
  const modelConfig = MODEL_CONFIG_PATH || (existsSync(MODEL_CONFIG_LOCAL) ? MODEL_CONFIG_LOCAL : MODEL_CONFIG_EXAMPLE);
  return {
    name: INSTANCE_NAME,
    host: HOST,
    port: PORT,
    configPath: relativeProjectPath(INSTANCE_CONFIG.path),
    kbPathsConfig: relativeProjectPath(kbPathsConfig),
    modelConfig: relativeProjectPath(modelConfig)
  };
}

function normalizeDocTabs(tabs) {
  return tabs.map((tab, index) => ({
    key: String(tab.key || `tab${index + 1}`),
    label: String(tab.label || tab.key || `页签 ${index + 1}`),
    path: normalizeConfiguredRelPath(tab.path),
    type: tab.type || 'markdown',
    role: tab.role || '',
    groupLabel: KB_PATHS.navigation.label || '文档',
    titleFrom: KB_PATHS.navigation.titleFrom,
    priority: index + 1
  })).filter((tab) => tab.path);
}

function normalizeWovenConfig(config = {}) {
  return {
    label: String(config.label || '专题'),
    titleFrom: Array.isArray(config.titleFrom) && config.titleFrom.length ? config.titleFrom : ['frontmatter.title', 'h1', 'filename'],
    groups: Array.isArray(config.groups) ? config.groups : []
  };
}

function normalizeWovenGroups(groups, config) {
  return groups.map((group, index) => ({
    key: String(group.key || `woven${index + 1}`),
    label: String(group.label || group.key || `专题 ${index + 1}`),
    path: normalizeConfiguredRelPath(group.path),
    type: group.type || 'wiki',
    role: group.role || '',
    groupLabel: String(group.label || group.key || `专题 ${index + 1}`),
    titleFrom: Array.isArray(group.titleFrom) && group.titleFrom.length ? group.titleFrom : config.titleFrom,
    priority: index
  })).filter((group) => group.path);
}

function normalizeConfiguredRelPath(relPath) {
  const rel = normalizeRel(String(relPath || '').trim());
  if (!rel || path.isAbsolute(rel) || rel.includes('\0') || rel.split('/').includes('..')) {
    throw new Error(`Invalid configured KB relative path: ${relPath}`);
  }
  return rel.replace(/\/+$/, '');
}

function publicKbConfig() {
  return {
    navigation: {
      label: DOCUMENT_GROUP.label,
      primaryTab: PRIMARY_TAB.key,
      titleFrom: KB_PATHS.navigation.titleFrom,
      includeFallbackDocs: Boolean(KB_PATHS.navigation.includeFallbackDocs)
    },
    tabs: DOC_TABS.map((tab) => ({
      key: tab.key,
      label: tab.label,
      path: tab.path,
      type: tab.type,
      role: tab.role
    })),
    woven: {
      label: WOVEN_CONFIG.label,
      titleFrom: WOVEN_CONFIG.titleFrom,
      groups: WOVEN_GROUPS.map((group) => ({
        key: group.key,
        label: group.label,
        path: group.path,
        type: group.type,
        role: group.role
      }))
    },
    assets: { imageRoot: IMAGE_ROOT_REL }
  };
}

function normalizeChatCorpusTabs() {
  const hiddenTabs = WOVEN_GROUPS.length ? WOVEN_GROUPS : [
    { key: 'compiledTopics', label: '主题编译页', path: 'wiki/topics', type: 'wiki', role: 'compiled_topic', priority: 0 },
    { key: 'compiledEntities', label: '实体页', path: 'wiki/entities', type: 'wiki', role: 'compiled_entity', priority: 0.2 }
  ];
  const tabs = [
    ...hiddenTabs,
    ...DOC_TABS.filter((tab) => tab.role !== 'source')
  ];
  const seen = new Set();
  return tabs.filter((tab) => {
    if (!tab.path || seen.has(tab.path)) return false;
    seen.add(tab.path);
    return true;
  });
}

function isAuthorized(req) {
  if (!BASIC_AUTH) return true;
  const expected = `Basic ${Buffer.from(BASIC_AUTH).toString('base64')}`;
  const actual = String(req.headers.authorization || '');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function sendAuthRequired(res) {
  res.writeHead(401, {
    'Content-Type': 'text/plain; charset=utf-8',
    'WWW-Authenticate': 'Basic realm="fuxi knowledge base"'
  });
  res.end('Authentication required');
}

function normalizeRel(rel) {
  return rel.replace(/\\/g, '/').replace(/^\/+/, '');
}

function assertKbPath(relPath) {
  const rel = normalizeRel(decodeURIComponent(String(relPath || '')));
  if (!rel || rel.includes('\0') || path.isAbsolute(rel) || rel.split('/').includes('..')) {
    throw httpError(400, 'Invalid path');
  }
  const target = path.resolve(KB_ROOT, rel);
  const root = path.resolve(KB_ROOT);
  const targetCmp = process.platform === 'win32' ? target.toLowerCase() : target;
  const rootCmp = process.platform === 'win32' ? root.toLowerCase() : root;
  if (targetCmp !== rootCmp && !targetCmp.startsWith(rootCmp + path.sep)) {
    throw httpError(403, 'Path outside KB_ROOT');
  }
  return { rel, target };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function walkMarkdown(baseRel) {
  const { target } = assertKbPath(baseRel);
  if (!existsSync(target)) return [];
  const out = [];
  async function walk(absDir) {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        out.push(normalizeRel(path.relative(KB_ROOT, abs)));
      }
    }
  }
  await walk(target);
  out.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  return out;
}

function parseMarkdown(text, relPath, titleFrom = KB_PATHS.navigation.titleFrom) {
  let body = text.replace(/^\uFEFF/, '');
  const frontmatter = {};
  if (body.startsWith('---')) {
    const end = body.indexOf('\n---', 3);
    if (end > -1) {
      const fm = body.slice(3, end).trim();
      body = body.slice(end + 4).replace(/^\r?\n/, '');
      let currentKey = '';
      for (const line of fm.split(/\r?\n/)) {
        const listMatch = line.match(/^\s*-\s+(.*)$/);
        if (listMatch && currentKey) {
          if (!Array.isArray(frontmatter[currentKey])) frontmatter[currentKey] = [];
          frontmatter[currentKey].push(unquoteYamlScalar(listMatch[1].trim()));
          continue;
        }
        const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!m) continue;
        currentKey = m[1];
        let value = m[2].trim();
        if (!value) {
          frontmatter[m[1]] = [];
          continue;
        }
        value = unquoteYamlScalar(value);
        if (value.startsWith('[') && value.endsWith(']')) {
          frontmatter[m[1]] = value.slice(1, -1).split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        } else {
          frontmatter[m[1]] = value;
        }
      }
    }
  }
  const headings = [];
  for (const match of body.matchAll(/^(#{1,6})\s+(.+)$/gm)) {
    const title = stripInlineMarkdown(match[2]).trim();
    headings.push({ level: match[1].length, title, anchor: slugify(title) });
  }
  const firstH1 = headings.find((h) => h.level === 1)?.title;
  const baseTitle = path.basename(relPath, '.md');
  const title = selectDocumentTitle({ frontmatter, firstH1, baseTitle }, titleFrom);
  return { frontmatter, body, headings, firstH1, baseTitle, title };
}

function unquoteYamlScalar(value) {
  const text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    try { return JSON.parse(text); } catch { return text.slice(1, -1); }
  }
  return text;
}

function stripInlineMarkdown(value) {
  return String(value).replace(/[`*_#\[\]()]/g, '').replace(/<[^>]+>/g, '');
}

function selectDocumentTitle(parsed, titleFromConfig = KB_PATHS.navigation.titleFrom) {
  const titleFrom = Array.isArray(titleFromConfig) ? titleFromConfig : [];
  for (const source of titleFrom) {
    if (source === 'frontmatter.title' && parsed.frontmatter?.title) return String(parsed.frontmatter.title);
    if (source === 'frontmatter.name' && parsed.frontmatter?.name) return String(parsed.frontmatter.name);
    if (source === 'h1' && parsed.firstH1) return String(parsed.firstH1);
    if (source === 'filename' && parsed.baseTitle) return String(parsed.baseTitle);
  }
  return String(parsed.frontmatter?.title || parsed.frontmatter?.name || parsed.firstH1 || parsed.baseTitle || '未命名文档');
}

function slugify(value) {
  return encodeURIComponent(String(value).trim().toLowerCase().replace(/\s+/g, '-'));
}

function tabForRel(rel) {
  return DOC_TABS.find((tab) => rel === `${tab.path}.md` || rel.startsWith(`${tab.path}/`));
}

function wovenGroupForRel(rel) {
  return WOVEN_GROUPS.find((group) => rel === `${group.path}.md` || rel.startsWith(`${group.path}/`));
}

function configuredGroupForRel(rel) {
  return tabForRel(rel) || wovenGroupForRel(rel);
}

function tabByKey(key) {
  return DOC_TABS.find((tab) => tab.key === key);
}

function tabByRole(role) {
  return DOC_TABS.find((tab) => tab.role === role);
}

function workbookNameFromRel(rel, groupKey) {
  const name = path.basename(rel, '.md');
  if (tabByKey(groupKey) || tabForRel(rel)) return name;
  const m = name.match(/^\d{4}-\d{2}-\d{2}-excel-(.+)$/i);
  return m?.[1] || name;
}

function inferViews(rel, groupKey) {
  const workbook = workbookNameFromRel(rel, groupKey);
  const views = { workbook };
  const viewTabs = [];
  for (const tab of DOC_TABS) {
    const candidate = `${tab.path}/${workbook}.md`;
    const availablePath = rel === candidate || existsSync(path.join(KB_ROOT, candidate)) ? candidate : null;
    views[tab.key] = availablePath;
    viewTabs.push({
      key: tab.key,
      label: tab.label,
      path: availablePath,
      available: Boolean(availablePath),
      role: tab.role
    });
  }
  views.tabs = viewTabs;
  return views;
}

async function scanDocs() {
  const docsByWorkbook = new Map();
  const primaryPaths = await walkMarkdown(PRIMARY_TAB.path);
  for (const rel of primaryPaths) {
    const item = await buildDocItem(rel, PRIMARY_TAB);
    docsByWorkbook.set(item.workbook, item);
  }
  if (KB_PATHS.navigation.includeFallbackDocs !== false) {
    for (const tab of DOC_TABS) {
      if (tab.key === PRIMARY_TAB.key) continue;
      const paths = await walkMarkdown(tab.path);
      for (const rel of paths) {
        const workbook = workbookNameFromRel(rel, tab.key);
        if (docsByWorkbook.has(workbook)) continue;
        docsByWorkbook.set(workbook, await buildDocItem(rel, tab));
      }
    }
  }
  const docs = [...docsByWorkbook.values()].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
  const groups = [{ key: DOCUMENT_GROUP.key, label: DOCUMENT_GROUP.label, dir: PRIMARY_TAB.path, items: docs }];
  docCache = { scannedAt: new Date().toISOString(), groups, docs, config: publicKbConfig() };
  return docCache;
}

async function scanChatDocs() {
  const items = [];
  const seen = new Set();
  for (const tab of CHAT_CORPUS_TABS) {
    const paths = await walkMarkdown(tab.path);
    for (const rel of paths) {
      if (seen.has(rel)) continue;
      seen.add(rel);
      items.push(await buildDocItem(rel, tab));
    }
  }
  chatDocCache = {
    scannedAt: new Date().toISOString(),
    docs: items.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, 'zh-Hans-CN'))
  };
  return chatDocCache;
}

async function scanWovenDocs() {
  const groups = [];
  const docs = [];
  for (const group of WOVEN_GROUPS) {
    const paths = await walkMarkdown(group.path);
    const items = [];
    for (const rel of paths) {
      const item = await buildDocItem(rel, group);
      items.push(item);
      docs.push(item);
    }
    items.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
    groups.push({ key: group.key, label: group.label, dir: group.path, items });
  }
  wovenDocCache = {
    scannedAt: new Date().toISOString(),
    groups,
    docs: docs.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, 'zh-Hans-CN')),
    config: publicKbConfig()
  };
  return wovenDocCache;
}

async function buildDocItem(rel, tab) {
  let parsed = { title: path.basename(rel, '.md'), frontmatter: {}, headings: [], body: '' };
  try {
    const text = await readFile(path.join(KB_ROOT, rel), 'utf8');
    parsed = parseMarkdown(text, rel, tab.titleFrom || KB_PATHS.navigation.titleFrom);
  } catch {}
  const views = inferViews(rel, tab.key);
  return {
    path: rel,
    title: parsed.title,
    group: tab.key,
    groupLabel: tab.groupLabel || tab.label || DOCUMENT_GROUP.label,
    type: tab.type,
    role: tab.role || '',
    priority: tab.priority,
    frontmatter: parsed.frontmatter,
    headings: parsed.headings,
    workbook: views.workbook,
    views,
    viewTabs: views.tabs,
    defaultView: tab.key,
    updatedAt: await fileMtime(path.join(KB_ROOT, rel))
  };
}

async function fileMtime(abs) {
  try { return (await stat(abs)).mtime.toISOString(); } catch { return null; }
}

async function readDoc(relPath) {
  const { rel, target } = assertKbPath(relPath);
  if (!rel.toLowerCase().endsWith('.md')) throw httpError(400, 'Only Markdown files are readable here');
  const text = await readFile(target, 'utf8');
  const configuredGroup = configuredGroupForRel(rel);
  const parsed = parseMarkdown(text, rel, configuredGroup?.titleFrom || KB_PATHS.navigation.titleFrom);
  const cached = docCache.docs.find((doc) => doc.path === rel) || wovenDocCache.docs.find((doc) => doc.path === rel);
  const groupKey = cached?.group || inferGroup(rel);
  const views = inferViews(rel, groupKey);
  const currentTab = tabByKey(groupKey) || configuredGroup;
  return {
    path: rel,
    title: parsed.title,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    headings: parsed.headings,
    group: groupKey,
    groupLabel: cached?.groupLabel || currentTab?.groupLabel || currentTab?.label || '',
    type: cached?.type || currentTab?.type || inferType(rel),
    workbook: views.workbook,
    views,
    viewTabs: views.tabs,
    defaultView: currentTab?.key || PRIMARY_TAB.key,
    config: publicKbConfig(),
    updatedAt: await fileMtime(target)
  };
}

function inferGroup(rel) {
  return configuredGroupForRel(rel)?.key || 'other';
}

function inferType(rel) {
  if (rel.startsWith('raw/')) return 'raw';
  if (rel.startsWith('notes/')) return 'notes';
  return 'wiki';
}



async function getImageMarkdown(workbook) {
  const safeWorkbook = String(workbook || '').replace(/[\\/]/g, '');
  if (!safeWorkbook) throw httpError(400, 'Missing workbook');
  const rawRel = `raw/excel-md/${safeWorkbook}.md`;
  const raw = await readDoc(rawRel);
  const originalPath = extractOriginalExcelPath(raw.body);
  if (!originalPath) throw httpError(404, 'Original Excel path not found in raw markdown');
  if (!existsSync(originalPath)) throw httpError(404, `Original Excel file not found: ${originalPath}`);
  const sourceTab = tabByRole('source') || tabByKey('imageMd') || DOC_TABS[1] || PRIMARY_TAB;
  const imageMdRel = `${sourceTab.path}/${safeWorkbook}.md`;
  const imageMdAbs = path.join(KB_ROOT, imageMdRel);
  const exportScript = path.join(KB_EXCEL_SCRIPTS_ROOT, 'export-excel-anchored-md.ps1');
  const convertScript = path.join(KB_EXCEL_SCRIPTS_ROOT, 'convert-anchored-md-to-standard-image-md.mjs');
  if (!existsSync(imageMdAbs) || isNewer(originalPath, imageMdAbs) || isNewer(exportScript, imageMdAbs) || isNewer(convertScript, imageMdAbs)) {
    await generateImageMarkdownFromExcel(originalPath, safeWorkbook, imageMdAbs);
  }
  const doc = await readDoc(imageMdRel);
  return { workbook: safeWorkbook, originalPath, path: imageMdRel, doc };
}

async function generateImageMarkdownFromExcel(originalPath, workbook, outputPath) {
  const tmpDir = path.join(KB_ROOT, 'raw', '.tmp-excel-anchored-md');
  const anchoredPath = path.join(tmpDir, `${workbook}.md`);
  await mkdir(tmpDir, { recursive: true });
  try {
    await generateAnchoredMarkdown(originalPath, {
      outputDir: tmpDir,
      imageOutputDir: path.join(KB_ROOT, IMAGE_ROOT_REL),
      imageRelDir: `../${path.basename(IMAGE_ROOT_REL)}/${workbook}`
    });
    await generateImageMarkdown(anchoredPath, outputPath);
  } finally {
    await rm(anchoredPath, { force: true }).catch(() => {});
    await rm(tmpDir, { force: true, recursive: false }).catch(() => {});
  }
}

function generateImageMarkdown(anchoredPath, outputPath) {
  return new Promise((resolve, reject) => {
    const script = path.join(KB_EXCEL_SCRIPTS_ROOT, 'convert-anchored-md-to-standard-image-md.mjs');
    if (!existsSync(script)) return reject(httpError(500, `Image Markdown script not found: ${script}`));
    const child = spawn('node', [script, anchoredPath, outputPath], { cwd: KB_PROJECT_ROOT, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      reject(httpError(500, `Image Markdown generation failed: ${stderr || stdout || `exit ${code}`}`));
    });
  });
}
async function getAnchoredMarkdown(workbook) {
  const safeWorkbook = String(workbook || '').replace(/[\\/]/g, '');
  if (!safeWorkbook) throw httpError(400, 'Missing workbook');
  const rawRel = `raw/excel-md/${safeWorkbook}.md`;
  const raw = await readDoc(rawRel);
  const originalPath = extractOriginalExcelPath(raw.body);
  if (!originalPath) throw httpError(404, 'Original Excel path not found in raw markdown');
  if (!existsSync(originalPath)) throw httpError(404, `Original Excel file not found: ${originalPath}`);
  const anchoredRel = `raw/excel-anchored-md/${safeWorkbook}.md`;
  const anchoredAbs = path.join(KB_ROOT, anchoredRel);
  const script = path.join(KB_EXCEL_SCRIPTS_ROOT, 'export-excel-anchored-md.ps1');
  if (!existsSync(anchoredAbs) || isNewer(originalPath, anchoredAbs) || isNewer(script, anchoredAbs)) {
    await generateAnchoredMarkdown(originalPath);
  }
  const doc = await readDoc(anchoredRel);
  return { workbook: safeWorkbook, originalPath, path: anchoredRel, doc };
}

function generateAnchoredMarkdown(originalPath, options = {}) {
  return new Promise((resolve, reject) => {
    const script = path.join(KB_EXCEL_SCRIPTS_ROOT, 'export-excel-anchored-md.ps1');
    if (!existsSync(script)) return reject(httpError(500, `Anchored Markdown script not found: ${script}`));
    const outputDir = options.outputDir || path.join(KB_ROOT, 'raw', 'excel-anchored-md');
    const imageOutputDir = options.imageOutputDir || path.join(KB_ROOT, 'raw', 'excel-anchored-images');
    const args = [
      '-ExecutionPolicy', 'Bypass',
      '-File', script,
      '-WorkbookPath', originalPath,
      '-OutputDir', outputDir,
      '-ImageOutputDir', imageOutputDir,
      '-MaxRows', '1200',
      '-MaxCols', '80'
    ];
    if (options.imageRelDir) args.push('-ImageRelDir', options.imageRelDir);
    const child = spawn(POWERSHELL_BIN, args, { cwd: KB_PROJECT_ROOT, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      reject(httpError(500, `Anchored Markdown generation failed: ${stderr || stdout || `exit ${code}`}`));
    });
  });
}
async function getExcelPreview(workbook) {
  const safeWorkbook = String(workbook || '').replace(/[\\/]/g, '');
  if (!safeWorkbook) throw httpError(400, 'Missing workbook');
  const rawRel = `raw/excel-md/${safeWorkbook}.md`;
  const raw = await readDoc(rawRel);
  const originalPath = extractOriginalExcelPath(raw.body);
  if (!originalPath) throw httpError(404, 'Original Excel path not found in raw markdown');
  if (!existsSync(originalPath)) throw httpError(404, `Original Excel file not found: ${originalPath}`);

  const previewRel = `views/excel-like/${safeWorkbook}/index.html`;
  const previewAbs = path.join(KB_ROOT, previewRel);
  if (!existsSync(previewAbs)) {
    await generateExcelPreview(originalPath);
  }
  if (!existsSync(previewAbs)) throw httpError(500, 'Excel preview was not generated');
  return {
    workbook: safeWorkbook,
    originalPath,
    path: previewRel,
    url: `/kb-views/excel-like/${encodeURIComponent(safeWorkbook)}/index.html`,
    generated: true
  };
}


function isNewer(source, target) {
  try {
    return existsSync(source) && existsSync(target) && statSync(source).mtimeMs > statSync(target).mtimeMs;
  } catch {
    return false;
  }
}
function extractOriginalExcelPath(markdownBody) {
  const match = String(markdownBody || '').match(/^Original path:\s*(.+\.xlsx)\s*$/im);
  return match ? match[1].trim() : '';
}

function generateExcelPreview(originalPath) {
  return new Promise((resolve, reject) => {
    const script = path.join(KB_EXCEL_SCRIPTS_ROOT, 'export-excel-like-html.ps1');
    if (!existsSync(script)) return reject(httpError(500, `Preview script not found: ${script}`));
    const child = spawn(POWERSHELL_BIN, [
      '-ExecutionPolicy', 'Bypass',
      '-File', script,
      '-WorkbookPath', originalPath,
      '-OutputDir', path.join(KB_ROOT, 'views', 'excel-like'),
      '-MaxRows', '1200',
      '-MaxCols', '80'
    ], { cwd: KB_PROJECT_ROOT, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      reject(httpError(500, `Excel preview generation failed: ${stderr || stdout || `exit ${code}`}`));
    });
  });
}
async function listImages(workbook) {
  const safeWorkbook = String(workbook || '').replace(/[\\/]/g, '');
  if (!safeWorkbook) throw httpError(400, 'Missing workbook');
  const baseRel = `${IMAGE_ROOT_REL}/${safeWorkbook}`;
  const { target } = assertKbPath(baseRel);
  if (!existsSync(target)) return { workbook: safeWorkbook, media: null, images: [] };
  const mediaRel = `${baseRel}/MEDIA.md`;
  const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);
  const files = [];
  async function walk(absDir) {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else if (entry.isFile() && imageExts.has(path.extname(entry.name).toLowerCase())) {
        files.push(normalizeRel(path.relative(KB_ROOT, abs)));
      }
    }
  }
  await walk(target);
  files.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  let media = null;
  if (existsSync(path.join(KB_ROOT, mediaRel))) media = await readDoc(mediaRel);
  return {
    workbook: safeWorkbook,
    media,
    images: files.map((rel) => ({ path: rel, name: path.basename(rel), url: `/api/files?path=${encodeURIComponent(rel)}` }))
  };
}

function isAllowedAssetPath(rel) {
  return rel === IMAGE_ROOT_REL || rel.startsWith(`${IMAGE_ROOT_REL}/`);
}

async function searchDocs(query, limit = 30, includeBody = false) {
  await scanDocs();
  const chatDocs = (await scanChatDocs()).docs;
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const tokens = tokenize(q);
  const meaningfulTokens = tokens.filter((token) => !isGenericSearchToken(token));
  const activeTokens = meaningfulTokens.length ? meaningfulTokens : tokens;
  const results = [];
  for (const doc of chatDocs) {
    let score = 0;
    let matchedTitle = false;
    let matchedMeaningful = !meaningfulTokens.length;
    const hay = [doc.title, doc.path, doc.workbook, ...(doc.headings || []).map((h) => h.title), ...arrayify(doc.frontmatter.tags), ...arrayify(doc.frontmatter.entities)].join('\n').toLowerCase();
    const title = doc.title.toLowerCase();
    if (title.includes(q)) {
      score += 28;
      matchedTitle = true;
      matchedMeaningful = true;
    }
    for (const token of activeTokens) {
      const isMeaningful = !isGenericSearchToken(token);
      if (title.includes(token)) {
        score += 24;
        matchedTitle = true;
        if (isMeaningful) matchedMeaningful = true;
      }
      if (doc.path.toLowerCase().includes(token)) {
        score += 8;
        if (isMeaningful) matchedMeaningful = true;
      }
      if (hay.includes(token)) {
        score += 4;
        if (isMeaningful) matchedMeaningful = true;
      }
    }
    if (matchedTitle) score += 12;
    let snippet = '';
    if (includeBody || score === 0) {
      try {
        const parsed = await readDoc(doc.path);
        const bodyLower = parsed.body.toLowerCase();
        for (const token of activeTokens) {
          const pos = bodyLower.indexOf(token);
          if (pos >= 0) {
            score += includeBody ? 3 : 1;
            if (!isGenericSearchToken(token)) matchedMeaningful = true;
            snippet = makeSnippet(parsed.body, pos, 180);
            break;
          }
        }
      } catch {}
    }
    if (score > 0 && matchedMeaningful) results.push({ ...doc, score: score + chatLayerBoost(doc), snippet });
  }
  return results.sort((a, b) => b.score - a.score || a.priority - b.priority).slice(0, limit);
}

function chatLayerBoost(doc) {
  if (doc.path.startsWith('wiki/topics/')) return 45;
  if (doc.path.startsWith('wiki/entities/')) return 40;
  if (doc.path.startsWith(`${PRIMARY_TAB.path}/`)) return 25;
  if (doc.path.startsWith('wiki/imported-excel/')) return 20;
  return 0;
}

const GENERIC_QUERY_TOKENS = new Set([
  '玩法', '系统', '功能', '设计', '文档', '说明', '规则', '逻辑', '内容', '介绍', '整理',
  '是什么', '怎么', '怎样', '如何', '哪些', '什么'
]);

function isGenericSearchToken(token) {
  const text = String(token || '').trim();
  return text.length <= 1 || GENERIC_QUERY_TOKENS.has(text);
}

function tokenize(q) {
  const rough = q.split(/[\s,，。；;:：、!?！？()（）\[\]【】"']+/).map((x) => x.trim()).filter(Boolean);
  const tokens = new Set(rough.length ? rough : [q]);
  for (const token of [...tokens]) {
    const cjk = token.match(/[\p{Script=Han}]{2,}/gu) || [];
    for (const word of cjk) {
      for (let len = 2; len <= Math.min(4, word.length); len += 1) {
        for (let i = 0; i <= word.length - len; i += 1) tokens.add(word.slice(i, i + len));
      }
    }
  }
  return [...tokens].filter(Boolean);
}

function arrayify(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [String(value)];
}

function makeSnippet(text, pos, len) {
  const start = Math.max(0, pos - Math.floor(len / 2));
  return text.slice(start, start + len).replace(/\s+/g, ' ').trim();
}

async function ask(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const found = await searchDocs(lastUser, 10, true);
  const sources = found.slice(0, 6).map((doc) => ({ title: doc.title, path: doc.path, type: doc.type, role: doc.role || '' }));
  const contextDocs = [];
  for (const source of sources.slice(0, 5)) {
    try {
      const doc = await readDoc(source.path);
      contextDocs.push(`# ${doc.title}\n路径：${doc.path}\n资料层级：${chatSourceLayerLabel(doc.path)}\n\n${doc.body.slice(0, 8000)}`);
    } catch {}
  }

  const config = await loadModelConfig();
  const provider = config.providers?.[config.defaultProvider];
  const apiKey = provider?.apiKey;
  if (!provider || !apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    return {
      answer: buildNoModelAnswer(lastUser, sources),
      sources,
      modelConfigured: false
    };
  }

  const llmMessages = [
    { role: 'system', content: systemPrompt() },
    { role: 'system', content: `以下是从知识库定位到的资料：\n\n${contextDocs.join('\n\n---\n\n')}` },
    ...messages.slice(-8).map((m) => ({ role: m.role, content: String(m.content || '') }))
  ];
  const answer = await callOpenAICompatible(provider, llmMessages);
  return { answer, sources, modelConfigured: true };
}

function buildNoModelAnswer(question, sources) {
  const sourceLines = sources.length ? sources.map((s, i) => `${i + 1}. ${s.title}（${s.path}）`).join('\n') : '未定位到明确来源。';
  return `后端大模型尚未配置真实 API Key，因此当前没有调用模型生成最终答案。\n\n已根据问题“${question}”定位到以下可能相关的知识库文件，可先点击来源查看：\n\n${sourceLines}\n\n配置 server/config/model.config.local.json 后，再次提问即可由后端调用模型基于这些资料回答。`;
}

function chatSourceLayerLabel(relPath) {
  if (relPath.startsWith('wiki/topics/')) return '编译层：主题页，优先作为综合结论依据';
  if (relPath.startsWith('wiki/entities/')) return '编译层：实体页，优先作为名词和规则口径依据';
  if (relPath.startsWith('wiki/imported-excel/')) return '单源层：Excel 整理页，用于回溯具体来源';
  return '补充资料';
}

function systemPrompt() {
  return `你是 fuxi 知识库助手，负责基于知识库回答游戏设计、系统规则和玩法问题。

回答规则：
1. 必须基于后端提供的知识库文件回答，不要编造知识库外的信息。
2. 优先使用 \`wiki/topics\` 和 \`wiki/entities\` 中的编译结论；\`wiki/imported-excel\` 是单个 Excel 的整理页，只在需要回溯来源、补充细节或编译页不足时使用。
3. 默认回答要精炼，用户没有要求“详细、完整、展开、全部规则”时，先用 5-8 条讲清核心玩法、流程和关键限制。
4. 用户明确要求详细时，再按模块展开，但仍避免逐字复述整篇文档。
5. 不要每条都写“事实：”。只有在需要区分时，才使用“根据知识库”“推断”“待确认”。
6. 对规则、数值、消耗、概率、次数、等级、权重等内容要准确；不确定时写“知识库未明确说明”。
7. 如果文档中有“AI 整理待确认”或明显未定内容，单独用“待确认”小节列出。
8. 如果编译页和单源页存在差异，优先按编译页的“当前结论”回答，并把差异放入“待确认”。
9. 回答结构优先使用：一句话概括、核心流程、关键规则、待确认、依据文件。
10. 回答末尾必须列出依据文件路径。`;
}

async function loadModelConfig() {
  const file = MODEL_CONFIG_PATH || (existsSync(MODEL_CONFIG_LOCAL) ? MODEL_CONFIG_LOCAL : MODEL_CONFIG_EXAMPLE);
  const text = await readFile(file, 'utf8');
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

async function callOpenAICompatible(provider, messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(provider.timeoutMs || 60000));
  try {
    const url = `${String(provider.baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: provider.temperature ?? 0.2,
        max_tokens: provider.maxTokens ?? 4096,
        stream: false
      })
    });
    if (!res.ok) throw httpError(502, `LLM request failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '模型未返回内容。';
  } finally {
    clearTimeout(timer);
  }
}

async function sendJson(res, data, status = 200) {
  const payload = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function sendText(res, text, contentType = 'text/plain; charset=utf-8', status = 200) {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(text);
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  if (path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) throw httpError(403, 'Invalid static path');
  const target = path.resolve(PUBLIC_ROOT, rel);
  const root = path.resolve(PUBLIC_ROOT);
  if (!target.startsWith(root + path.sep) && target !== root) throw httpError(403, 'Invalid static path');
  if (!existsSync(target)) return sendText(res, 'Not found', 'text/plain; charset=utf-8', 404);
  const content = await readFile(target);
  res.writeHead(200, { 'Content-Type': contentType(target) });
  res.end(content);
}

async function serveKbView(req, res, url) {
  const prefix = '/kb-views/';
  const rel = normalizeRel(decodeURIComponent(url.pathname.slice(prefix.length)) || '');
  if (!rel || path.isAbsolute(rel) || rel.split('/').includes('..')) throw httpError(403, 'Invalid KB view path');
  const kbRel = `views/${rel}`;
  const { target } = assertKbPath(kbRel);
  if (!existsSync(target)) return sendText(res, 'Not found', 'text/plain; charset=utf-8', 404);
  const content = await readFile(target);
  res.writeHead(200, { 'Content-Type': contentType(target), 'Cache-Control': 'no-store' });
  res.end(content);
}
function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml; charset=utf-8'
  }[ext] || 'application/octet-stream';
}

const server = http.createServer(async (req, res) => {
  try {
    if (!isAuthorized(req)) return sendAuthRequired(res);
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/health') return sendJson(res, { ok: true, instance: publicInstanceConfig(), kbRoot: KB_ROOT, kbConfig: publicKbConfig(), scannedAt: docCache.scannedAt, wovenScannedAt: wovenDocCache.scannedAt });
    if ((url.pathname === '/api/docs' || url.pathname === '/api/docs/tree') && req.method === 'GET') return sendJson(res, await scanDocs());
    if (url.pathname === '/api/docs/refresh' && req.method === 'POST') return sendJson(res, await scanDocs());
    if (url.pathname === '/api/docs/read' && req.method === 'GET') return sendJson(res, await readDoc(url.searchParams.get('path')));
    if ((url.pathname === '/api/woven' || url.pathname === '/api/woven/tree') && req.method === 'GET') return sendJson(res, await scanWovenDocs());
    if (url.pathname === '/api/woven/refresh' && req.method === 'POST') return sendJson(res, await scanWovenDocs());
    if (url.pathname === '/api/docs/images' && req.method === 'GET') return sendJson(res, await listImages(url.searchParams.get('workbook')));
    if (url.pathname === '/api/excel/preview' && req.method === 'GET') return sendJson(res, await getExcelPreview(url.searchParams.get('workbook')));
    if (url.pathname === '/api/excel/anchored-md' && req.method === 'GET') return sendJson(res, await getAnchoredMarkdown(url.searchParams.get('workbook')));
    if (url.pathname === '/api/excel/image-md' && req.method === 'GET') return sendJson(res, await getImageMarkdown(url.searchParams.get('workbook')));
    if (url.pathname === '/api/search' && req.method === 'GET') return sendJson(res, { query: url.searchParams.get('q') || '', results: await searchDocs(url.searchParams.get('q'), 40, true) });
    if (url.pathname === '/api/ask' && req.method === 'POST') return sendJson(res, await ask(await readRequestJson(req)));
    if (url.pathname.startsWith('/kb-views/') && req.method === 'GET') return serveKbView(req, res, url);
    if (url.pathname === '/api/files' && req.method === 'GET') {
      const { rel, target } = assertKbPath(url.searchParams.get('path'));
      if (!isAllowedAssetPath(rel)) throw httpError(403, 'Only configured knowledge-base assets can be served');
      if (!existsSync(target)) return sendText(res, 'Not found', 'text/plain; charset=utf-8', 404);
      const content = await readFile(target);
      res.writeHead(200, { 'Content-Type': contentType(target), 'Cache-Control': 'no-store' });
      return res.end(content);
    }
    return serveStatic(req, res, url);
  } catch (error) {
    const status = error.status || 500;
    const message = status >= 500 ? `${error.message}` : error.message;
    if (req.url?.startsWith('/api/')) return sendJson(res, { error: message }, status);
    return sendText(res, message, 'text/plain; charset=utf-8', status);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`fuxi-web-console listening on http://${HOST}:${PORT}`);
  console.log(`instance=${INSTANCE_NAME}`);
  if (INSTANCE_CONFIG.path) console.log(`instance config=${INSTANCE_CONFIG.path}`);
  console.log(`KB_ROOT=${KB_ROOT}`);
  console.log(`KB paths config=${publicInstanceConfig().kbPathsConfig}`);
  console.log(`model config=${publicInstanceConfig().modelConfig}`);
  console.log(`KB primary tab=${PRIMARY_TAB.key} -> ${PRIMARY_TAB.path}`);
  console.log(`KB image root=${IMAGE_ROOT_REL}`);
});
