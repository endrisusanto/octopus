#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

const customVersion = getArg('--version');
const bumpType = getArg('--type') || 'patch';

// Read current root package.json
const rootPkgPath = path.join(rootDir, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

let [major, minor, patch] = (rootPkg.version || '1.0.0').split('.').map(Number);

let nextVersion = customVersion;
if (!nextVersion) {
  if (bumpType === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bumpType === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  nextVersion = `${major}.${minor}.${patch}`;
}

console.log(`[Bump] Updating project version to: v${nextVersion}`);

// 1. Update root package.json
rootPkg.version = nextVersion;
fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');

// 2. Update web-hub/client/package.json
const clientPkgPath = path.join(rootDir, 'web-hub', 'client', 'package.json');
if (fs.existsSync(clientPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(clientPkgPath, 'utf8'));
  pkg.version = nextVersion;
  fs.writeFileSync(clientPkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

// 3. Update web-hub/server/package.json
const serverPkgPath = path.join(rootDir, 'web-hub', 'server', 'package.json');
if (fs.existsSync(serverPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(serverPkgPath, 'utf8'));
  pkg.version = nextVersion;
  fs.writeFileSync(serverPkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

// 4. Update agent-bridge/Cargo.toml
const cargoPath = path.join(rootDir, 'agent-bridge', 'Cargo.toml');
if (fs.existsSync(cargoPath)) {
  let cargoContent = fs.readFileSync(cargoPath, 'utf8');
  cargoContent = cargoContent.replace(/version\s*=\s*"[^"]+"/, `version = "${nextVersion}"`);
  fs.writeFileSync(cargoPath, cargoContent);
}

// Output for GitHub Actions
console.log(`::set-output name=version::${nextVersion}`);
console.log(`::set-output name=tag_name::v${nextVersion}`);
