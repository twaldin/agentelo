'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Config file locations per harness, relative to a given directory level.
 */
const HARNESS_CONFIGS = {
  'claude-code': {
    perLevel: [
      'CLAUDE.md',
      '.claude/CLAUDE.md',
      '.claude/settings.json',
      '.claude/settings.local.json',
    ],
    homeOnly: [
      '.claude/CLAUDE.md',
      '.claude/settings.json',
      '.claude/settings.local.json',
    ],
    // Directories to glob for .md files (relative to each level)
    perLevelGlobDirs: ['.claude/agents'],
    // Directories where we just collect paths (not contents)
    perLevelPathOnlyDirs: ['.claude/plugins'],
    // Home-only dirs
    homeGlobDirs: ['.claude/agents', '.claude/projects'],
    homePathOnlyDirs: ['.claude/plugins'],
  },
  'opencode': {
    perLevel: [
      'AGENTS.md',
      'opencode.json',
      '.opencode/config.json',
    ],
    homeOnly: [
      '.config/opencode/config.json',
      '.config/opencode/keybinds.json',
    ],
    perLevelGlobDirs: [],
    perLevelPathOnlyDirs: [],
    homeGlobDirs: [],
    homePathOnlyDirs: [],
  },
  'codex': {
    perLevel: [
      'AGENTS.md',
      '.codex/config.json',
      '.codex/instructions.md',
    ],
    homeOnly: [
      '.codex/config.json',
      '.codex/instructions.md',
    ],
    perLevelGlobDirs: [],
    perLevelPathOnlyDirs: [],
    homeGlobDirs: [],
    homePathOnlyDirs: [],
  },
};

/**
 * Safely read a file. Returns null if it doesn't exist or is unreadable.
 */
function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return null;
  }
}

/**
 * Collect all .md files from a directory (recursively), returning { path, content }.
 * Skips missing or unreadable directories/files gracefully.
 */
function collectMdFiles(dir) {
  const results = [];
  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = safeReadFile(full);
        if (content !== null) {
          results.push({ path: full, content });
        }
      }
    }
  }
  walk(dir);
  return results;
}

/**
 * Collect all file paths from a directory (recursively), returning just paths.
 * Skips missing or unreadable directories/files gracefully.
 */
function collectFilePaths(dir) {
  const results = [];
  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

/**
 * Compute agent hash based on harness, model, workdir, and all config files the agent sees.
 *
 * @param {string} harness - Agent harness name (e.g. 'claude-code')
 * @param {string} model - Model name (e.g. 'claude-sonnet-4-6')
 * @param {string} workdir - The working directory the agent operates in
 * @param {string} [homeDir] - Home directory (defaults to os.homedir())
 * @returns {{ hash: string, configFiles: string[] }}
 */
async function computeAgentHash(harness, model, workdir, homeDir) {
  if (homeDir === undefined) homeDir = os.homedir();

  const config = HARNESS_CONFIGS[harness];
  if (!config) {
    // Unknown harness: just hash harness + model
    const hash = crypto
      .createHash('sha256')
      .update(`${harness}:${model}`)
      .digest('hex')
      .slice(0, 12);
    return { hash, configFiles: [] };
  }

  const foundFiles = []; // { path: string, content: string }
  const pathOnlyFiles = []; // string[]

  // Walk from workdir up to homeDir (inclusive), collecting per-level configs
  function getLevels(startDir, stopDir) {
    const levels = [];
    let current = path.resolve(startDir);
    const stop = path.resolve(stopDir);
    while (true) {
      levels.push(current);
      if (current === stop) break;
      const parent = path.dirname(current);
      if (parent === current) break; // reached filesystem root
      current = parent;
    }
    return levels;
  }

  const levels = getLevels(workdir, homeDir);

  for (const level of levels) {
    // Collect per-level single files
    for (const rel of config.perLevel) {
      const full = path.join(level, rel);
      const content = safeReadFile(full);
      if (content !== null) {
        foundFiles.push({ path: full, content });
      }
    }

    // Collect per-level glob dirs (.md files)
    for (const relDir of config.perLevelGlobDirs) {
      const absDir = path.join(level, relDir);
      const mdFiles = collectMdFiles(absDir);
      for (const f of mdFiles) {
        foundFiles.push(f);
      }
    }

    // Collect per-level path-only dirs
    for (const relDir of config.perLevelPathOnlyDirs) {
      const absDir = path.join(level, relDir);
      const paths = collectFilePaths(absDir);
      pathOnlyFiles.push(...paths);
    }
  }

  // Home-only single files (avoid double-counting if homeDir is already in levels)
  for (const rel of config.homeOnly) {
    const full = path.join(homeDir, rel);
    const content = safeReadFile(full);
    if (content !== null) {
      // Only add if not already present
      if (!foundFiles.some(f => f.path === full)) {
        foundFiles.push({ path: full, content });
      }
    }
  }

  // Home-only glob dirs
  for (const relDir of config.homeGlobDirs) {
    const absDir = path.join(homeDir, relDir);
    const mdFiles = collectMdFiles(absDir);
    for (const f of mdFiles) {
      if (!foundFiles.some(existing => existing.path === f.path)) {
        foundFiles.push(f);
      }
    }
  }

  // Home-only path-only dirs
  for (const relDir of config.homePathOnlyDirs) {
    const absDir = path.join(homeDir, relDir);
    const paths = collectFilePaths(absDir);
    for (const p of paths) {
      if (!pathOnlyFiles.includes(p)) {
        pathOnlyFiles.push(p);
      }
    }
  }

  // Sort everything for determinism
  const sortedFoundFiles = [...foundFiles].sort((a, b) => a.path.localeCompare(b.path));
  const sortedPathOnly = [...pathOnlyFiles].sort((a, b) => a.localeCompare(b));

  const allConfigFilePaths = [
    ...sortedFoundFiles.map(f => f.path),
    ...sortedPathOnly,
  ];

  const hashInput = [
    harness,
    model,
    ...sortedFoundFiles.map(f => f.path),
    ...sortedPathOnly,
    ...sortedFoundFiles.map(f => f.content),
  ].join('\n');

  const hash = crypto
    .createHash('sha256')
    .update(hashInput)
    .digest('hex')
    .slice(0, 12);

  return { hash, configFiles: allConfigFilePaths };
}

module.exports = { computeAgentHash };
