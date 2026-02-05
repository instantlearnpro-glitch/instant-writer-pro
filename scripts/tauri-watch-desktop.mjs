import { exec } from 'node:child_process';
import { watch } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());

const ignorePrefixes = [
  '.git',
  '.npm-cache',
  'dist',
  'node_modules',
  'src-tauri/target',
  'src-tauri/gen',
  'src-tauri/icons'
];

const shouldIgnore = (path) => {
  if (!path) return false;
  const normalized = path.replace(/\\/g, '/');
  return ignorePrefixes.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`));
};

let debounceTimer = null;
let buildInProgress = false;
let pendingBuild = false;

const runBuild = () => {
  if (buildInProgress) {
    pendingBuild = true;
    return;
  }
  buildInProgress = true;
  const child = exec('npm run tauri:build:dock', { cwd: root, env: process.env });
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  child.on('exit', () => {
    buildInProgress = false;
    if (pendingBuild) {
      pendingBuild = false;
      runBuild();
    }
  });
};

const scheduleBuild = () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runBuild, 1500);
};

watch(root, { recursive: true }, (eventType, filename) => {
  if (!filename) return;
  if (shouldIgnore(filename)) return;
  scheduleBuild();
});

console.log('Watching for changes. Auto-building Desktop app on save...');
