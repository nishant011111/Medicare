import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(rootDir, 'backend');
const webDir = path.join(rootDir, 'web');

const backendEntry = path.join(backendDir, 'dist', 'server.js');
const webEntry = path.join(webDir, 'dist', 'index.html');

function hasBin(binName, workspaceDir) {
  return (
    fs.existsSync(path.join(workspaceDir, 'node_modules', '.bin', binName)) ||
    fs.existsSync(path.join(rootDir, 'node_modules', '.bin', binName))
  );
}

const needsBackendBuild = !fs.existsSync(backendEntry);
const needsWebBuild = !fs.existsSync(webEntry);

// Only install/build when production bundles are missing (never block cold starts when pre-built)
if (needsBackendBuild || needsWebBuild) {
  if ((needsBackendBuild && !hasBin('tsc', backendDir)) || (needsWebBuild && !hasBin('vite', webDir))) {
    console.log('[MediCore] Installing workspace dependencies for missing production bundle...');
    execSync('npm install --include=dev --no-audit --no-fund', { cwd: rootDir, stdio: 'inherit' });
  }
  if (needsBackendBuild) {
    console.log('[MediCore] Building backend production bundle...');
    execSync('npm --workspace=backend run build', { cwd: rootDir, stdio: 'inherit' });
  }
  if (needsWebBuild) {
    console.log('[MediCore] Building web production bundle...');
    execSync('npm --workspace=web run build', { cwd: rootDir, stdio: 'inherit' });
  }
}

// Resolve listening port safely:
// - When running behind the AI Studio Nginx reverse proxy (NGINX_PORT=8080, PORT=8080, DEFAULT_APP_PORT=3000),
//   Nginx already binds NGINX_PORT and proxies to DEFAULT_APP_PORT (3000), so avoid EADDRINUSE on 8080.
// - On standalone Cloud Run (no NGINX_PORT), bind directly to PORT (typically 8080).
const nginxPort = process.env.NGINX_PORT?.trim();
const requestedPort = process.env.PORT?.trim();
const defaultAppPort = process.env.DEFAULT_APP_PORT?.trim() || '3000';
const port =
  nginxPort && (!requestedPort || requestedPort === nginxPort)
    ? defaultAppPort
    : requestedPort || defaultAppPort;

console.log(`[MediCore] Launching production server on 0.0.0.0:${port}...`);

const prodProc = spawn(process.execPath, [backendEntry], {
  cwd: backendDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'production',
    PORT: port,
  },
});

prodProc.on('error', (err) => {
  console.error('[MediCore] Failed to start production server process:', err);
  process.exit(1);
});

prodProc.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

process.on('SIGINT', () => prodProc.kill('SIGINT'));
process.on('SIGTERM', () => prodProc.kill('SIGTERM'));
