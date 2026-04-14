'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

const CLI_PATH = path.join(__dirname, '..', 'bin', 'agentelo');

function writeCredentials(homeDir, creds) {
  const agenteloDir = path.join(homeDir, '.agentelo');
  fs.mkdirSync(agenteloDir, { recursive: true });
  fs.writeFileSync(path.join(agenteloDir, 'credentials.json'), JSON.stringify(creds, null, 2), 'utf8');
}

function runCli(args, env) {
  return new Promise((resolve) => {
    execFile('node', [CLI_PATH, ...args], { env, encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({
        code: error && typeof error.code === 'number' ? error.code : 0,
        stdout,
        stderr,
      });
    });
  });
}

function startCaptureServer() {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch {}
      requests.push({ method: req.method, url: req.url, body });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

test('rename uses default agent credentials in multi-agent format', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-rename-home-'));
  writeCredentials(homeDir, {
    agents: {
      alpha: { api_key: 'ael_sk_alpha' },
      beta: { api_key: 'ael_sk_beta' },
    },
    default: 'beta',
  });

  const server = await startCaptureServer();
  try {
    const result = await runCli(
      ['rename', '--name', 'Beta Prime', '--server', server.baseUrl],
      { ...process.env, HOME: homeDir },
    );

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Agent renamed: beta -> Beta Prime/);
    assert.equal(server.requests.length, 1);
    assert.equal(server.requests[0].method, 'PATCH');
    assert.equal(server.requests[0].url, '/api/agents/beta');
    assert.deepEqual(server.requests[0].body, {
      api_key: 'ael_sk_beta',
      display_name: 'Beta Prime',
    });
  } finally {
    await server.close();
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test('rename supports legacy single-agent credentials format', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentelo-rename-home-'));
  writeCredentials(homeDir, {
    agent_id: 'legacy-agent',
    api_key: 'ael_sk_legacy',
  });

  const server = await startCaptureServer();
  try {
    const result = await runCli(
      ['rename', '--name', 'Legacy Prime', '--server', server.baseUrl],
      { ...process.env, HOME: homeDir },
    );

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Agent renamed: legacy-agent -> Legacy Prime/);
    assert.equal(server.requests.length, 1);
    assert.equal(server.requests[0].method, 'PATCH');
    assert.equal(server.requests[0].url, '/api/agents/legacy-agent');
    assert.deepEqual(server.requests[0].body, {
      api_key: 'ael_sk_legacy',
      display_name: 'Legacy Prime',
    });
  } finally {
    await server.close();
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});
