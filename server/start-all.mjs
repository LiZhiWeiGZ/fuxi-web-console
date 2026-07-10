import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SERVER_DIR, '..');
const DEFAULT_CONFIG_DIR = path.join(SERVER_DIR, 'config', 'instances');
const SERVER_ENTRY = path.join(SERVER_DIR, 'server.mjs');

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printUsage();
  process.exit(0);
}

const configPaths = await resolveConfigPaths(options);
if (!configPaths.length) {
  console.error(`No instance config found. Create *.local.json under ${path.relative(PROJECT_ROOT, options.configDir)}.`);
  process.exit(1);
}

const children = configPaths.map((configPath) => startInstance(configPath));

process.on('SIGINT', () => stopAll('SIGINT'));
process.on('SIGTERM', () => stopAll('SIGTERM'));

function parseArgs(argv) {
  const parsed = { configDir: DEFAULT_CONFIG_DIR, configs: [], help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--config-dir') {
      parsed.configDir = resolveProjectPath(argv[index + 1] || '');
      index += 1;
    } else if (arg.startsWith('--config-dir=')) {
      parsed.configDir = resolveProjectPath(arg.slice('--config-dir='.length));
    } else if (arg === '--config') {
      parsed.configs.push(resolveProjectPath(argv[index + 1] || ''));
      index += 1;
    } else if (arg.startsWith('--config=')) {
      parsed.configs.push(resolveProjectPath(arg.slice('--config='.length)));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function printUsage() {
  console.log(`Usage:
  node server/start-all.mjs
  node server/start-all.mjs --config server/config/instances/fuxi.local.json --config server/config/instances/other.local.json
  node server/start-all.mjs --config-dir server/config/instances`);
}

async function resolveConfigPaths({ configDir, configs }) {
  if (configs.length) return configs.filter(Boolean);
  if (!existsSync(configDir)) return [];
  const entries = await readdir(configDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.local.json'))
    .map((entry) => path.join(configDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function startInstance(configPath) {
  const name = path.basename(configPath, path.extname(configPath)).replace(/\.local$/, '');
  const child = spawn(process.execPath, [SERVER_ENTRY, '--config', configPath], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  prefixStream(child.stdout, process.stdout, `[${name}]`);
  prefixStream(child.stderr, process.stderr, `[${name}]`);
  child.on('exit', (code, signal) => {
    const reason = signal || `exit ${code}`;
    process.stderr.write(`[${name}] stopped: ${reason}\n`);
    if (!signal && code !== 0) process.exitCode = code || 1;
  });
  return child;
}

function prefixStream(source, target, prefix) {
  let buffered = '';
  source.on('data', (chunk) => {
    buffered += chunk.toString();
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() || '';
    for (const line of lines) target.write(`${prefix} ${line}\n`);
  });
  source.on('end', () => {
    if (buffered) target.write(`${prefix} ${buffered}\n`);
  });
}

function stopAll(signal) {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

function resolveProjectPath(value) {
  const input = String(value || '').trim();
  if (!input) return input;
  return path.isAbsolute(input) ? input : path.resolve(PROJECT_ROOT, input);
}
