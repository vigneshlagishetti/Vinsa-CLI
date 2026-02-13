/**
 * Vinsa CLI — Git Source Control Module
 * 
 * Full Git integration — Vinsa acts as a complete source control manager.
 * Supports: status, log, branch, stash, diff, add, commit, push, pull,
 * merge, clone, init, remote, tag, blame, cherry-pick, rebase, reset,
 * checkout, conflict resolution, and AI-powered features.
 */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function gitExec(command, options = {}) {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      timeout: options.timeout || 30000,
      cwd: options.cwd || process.cwd(),
      shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
      maxBuffer: 1024 * 1024 * 10,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch (err) {
    if (err.stdout && err.stdout.trim()) return err.stdout.trim();
    throw new Error(err.stderr?.trim() || err.message);
  }
}

function isGitRepo(cwd) {
  try {
    gitExec('git rev-parse --is-inside-work-tree', { cwd });
    return true;
  } catch {
    return false;
  }
}

function getRepoRoot(cwd) {
  try {
    return gitExec('git rev-parse --show-toplevel', { cwd });
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// GIT OPERATIONS
// ════════════════════════════════════════════════════════════

/**
 * git status — Full status with staged, unstaged, untracked, branch info
 */
export function gitStatus({ cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    const branch = gitExec('git branch --show-current', { cwd }) || '(detached HEAD)';
    const statusShort = gitExec('git status --short', { cwd });
    const statusLong = gitExec('git status', { cwd });

    // Parse short status into categories
    const staged = [];
    const unstaged = [];
    const untracked = [];
    const conflicts = [];

    for (const line of statusShort.split('\n').filter(Boolean)) {
      const x = line[0]; // index status
      const y = line[1]; // worktree status
      const file = line.slice(3);

      if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
        conflicts.push({ file, status: 'conflict' });
      } else if (x === '?' && y === '?') {
        untracked.push(file);
      } else {
        if (x !== ' ' && x !== '?') {
          const statusMap = { 'M': 'modified', 'A': 'added', 'D': 'deleted', 'R': 'renamed', 'C': 'copied' };
          staged.push({ file, status: statusMap[x] || x });
        }
        if (y !== ' ' && y !== '?') {
          const statusMap = { 'M': 'modified', 'D': 'deleted' };
          unstaged.push({ file, status: statusMap[y] || y });
        }
      }
    }

    // Get ahead/behind info
    let ahead = 0, behind = 0, tracking = '';
    try {
      const trackingInfo = gitExec('git rev-list --left-right --count HEAD...@{upstream}', { cwd });
      const parts = trackingInfo.split('\t');
      ahead = parseInt(parts[0]) || 0;
      behind = parseInt(parts[1]) || 0;
      tracking = gitExec('git rev-parse --abbrev-ref @{upstream}', { cwd });
    } catch { /* no upstream */ }

    // Last commit
    let lastCommit = null;
    try {
      const log = gitExec('git log -1 --format="%h %s (%ar)"', { cwd });
      lastCommit = log;
    } catch { /* empty repo */ }

    return {
      success: true,
      branch,
      tracking: tracking || null,
      ahead,
      behind,
      lastCommit,
      staged,
      unstaged,
      untracked,
      conflicts,
      clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
      summary: statusLong,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git log — Commit history with formatting options
 */
export function gitLog({ count = 20, oneline = false, graph = false, author, since, until, file, branch: branchName, all = false, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    let cmd = 'git log';
    if (oneline || graph) {
      cmd += ' --oneline';
    } else {
      cmd += ' --format="%H|%h|%an|%ae|%ar|%s"';
    }
    if (graph) cmd += ' --graph --all --decorate';
    if (all) cmd += ' --all';
    cmd += ` -n ${count}`;
    if (author) cmd += ` --author="${author}"`;
    if (since) cmd += ` --since="${since}"`;
    if (until) cmd += ` --until="${until}"`;
    if (branchName) cmd += ` ${branchName}`;
    if (file) cmd += ` -- "${file}"`;

    const output = gitExec(cmd, { cwd });

    if (oneline || graph) {
      return { success: true, log: output };
    }

    // Parse structured log
    const commits = output.split('\n').filter(Boolean).map(line => {
      const parts = line.split('|');
      return {
        hash: parts[0],
        shortHash: parts[1],
        author: parts[2],
        email: parts[3],
        date: parts[4],
        message: parts.slice(5).join('|'),
      };
    });

    return { success: true, commits, count: commits.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git branch — List, create, delete, rename branches
 */
export function gitBranch({ action = 'list', name, newName, remote = false, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    switch (action) {
      case 'list': {
        const localCmd = 'git branch --format="%(refname:short)|%(objectname:short)|%(upstream:short)|%(upstream:track)"';
        const localOutput = gitExec(localCmd, { cwd });
        const branches = localOutput.split('\n').filter(Boolean).map(line => {
          const [name, hash, upstream, track] = line.split('|');
          return { name, hash, upstream: upstream || null, track: track || null };
        });

        let remoteBranches = [];
        if (remote) {
          try {
            const remoteOutput = gitExec('git branch -r --format="%(refname:short)|%(objectname:short)"', { cwd });
            remoteBranches = remoteOutput.split('\n').filter(Boolean).map(line => {
              const [name, hash] = line.split('|');
              return { name, hash };
            });
          } catch { /* no remotes */ }
        }

        const current = gitExec('git branch --show-current', { cwd });
        return { success: true, current, branches, remoteBranches };
      }
      case 'create': {
        if (!name) return { success: false, error: 'Branch name required.' };
        gitExec(`git branch "${name}"`, { cwd });
        return { success: true, message: `Branch '${name}' created.` };
      }
      case 'checkout': {
        if (!name) return { success: false, error: 'Branch name required.' };
        const output = gitExec(`git checkout "${name}"`, { cwd });
        return { success: true, message: `Switched to branch '${name}'.`, output };
      }
      case 'create-checkout': {
        if (!name) return { success: false, error: 'Branch name required.' };
        const output = gitExec(`git checkout -b "${name}"`, { cwd });
        return { success: true, message: `Created and switched to branch '${name}'.`, output };
      }
      case 'delete': {
        if (!name) return { success: false, error: 'Branch name required.' };
        gitExec(`git branch -d "${name}"`, { cwd });
        return { success: true, message: `Branch '${name}' deleted.` };
      }
      case 'force-delete': {
        if (!name) return { success: false, error: 'Branch name required.' };
        gitExec(`git branch -D "${name}"`, { cwd });
        return { success: true, message: `Branch '${name}' force-deleted.` };
      }
      case 'rename': {
        if (!name || !newName) return { success: false, error: 'Current name and new name required.' };
        gitExec(`git branch -m "${name}" "${newName}"`, { cwd });
        return { success: true, message: `Branch renamed: '${name}' → '${newName}'.` };
      }
      default:
        return { success: false, error: `Unknown action: ${action}. Use: list, create, checkout, create-checkout, delete, force-delete, rename` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git diff — View changes with various options
 */
export function gitDiff({ staged = false, file, commit1, commit2, stat = false, nameOnly = false, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    let cmd = 'git diff';
    if (staged) cmd += ' --staged';
    if (stat) cmd += ' --stat';
    if (nameOnly) cmd += ' --name-only';
    if (commit1 && commit2) cmd += ` ${commit1} ${commit2}`;
    else if (commit1) cmd += ` ${commit1}`;
    if (file) cmd += ` -- "${file}"`;

    const output = gitExec(cmd, { cwd, timeout: 30000 });

    if (!output) {
      return { success: true, diff: '', message: 'No differences found.' };
    }

    // Parse diff stats
    let filesChanged = 0, insertions = 0, deletions = 0;
    try {
      const statOutput = gitExec(cmd.replace('git diff', 'git diff --stat'), { cwd });
      const lastLine = statOutput.split('\n').pop();
      const match = lastLine?.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
      if (match) {
        filesChanged = parseInt(match[1]) || 0;
        insertions = parseInt(match[2]) || 0;
        deletions = parseInt(match[3]) || 0;
      }
    } catch { /* skip */ }

    return {
      success: true,
      diff: output.length > 50000 ? output.slice(0, 50000) + '\n... (truncated)' : output,
      stats: { filesChanged, insertions, deletions },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git add — Stage files
 */
export function gitAdd({ files, all = false, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    if (all) {
      gitExec('git add -A', { cwd });
      return { success: true, message: 'All changes staged.' };
    }

    if (!files || files.length === 0) {
      return { success: false, error: 'Specify files to stage or use all=true.' };
    }

    const fileList = Array.isArray(files) ? files : [files];
    for (const f of fileList) {
      gitExec(`git add "${f}"`, { cwd });
    }
    return { success: true, message: `Staged ${fileList.length} file(s): ${fileList.join(', ')}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git commit — Commit staged changes
 */
export function gitCommit({ message, all = false, amend = false, allowEmpty = false, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    let cmd = 'git commit';
    if (all) cmd += ' -a';
    if (amend) cmd += ' --amend';
    if (allowEmpty) cmd += ' --allow-empty';

    if (amend && !message) {
      cmd += ' --no-edit';
    } else if (message) {
      cmd += ` -m "${message.replace(/"/g, '\\"')}"`;
    } else {
      return { success: false, error: 'Commit message required (unless amending with --amend).' };
    }

    const output = gitExec(cmd, { cwd });

    // Get the commit hash
    let commitHash = '';
    try {
      commitHash = gitExec('git rev-parse --short HEAD', { cwd });
    } catch { /* skip */ }

    return { success: true, message: output, commitHash };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git push — Push to remote
 */
export function gitPush({ remote = 'origin', branch, force = false, setUpstream = false, tags = false, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    let cmd = `git push ${remote}`;
    if (branch) cmd += ` ${branch}`;
    if (force) cmd += ' --force';
    if (setUpstream) cmd += ' --set-upstream';
    if (tags) cmd += ' --tags';

    const output = gitExec(cmd, { cwd, timeout: 60000 });
    return { success: true, message: output || 'Push successful.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git pull — Pull from remote
 */
export function gitPull({ remote = 'origin', branch, rebase = false, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    let cmd = `git pull ${remote}`;
    if (branch) cmd += ` ${branch}`;
    if (rebase) cmd += ' --rebase';

    const output = gitExec(cmd, { cwd, timeout: 60000 });
    return { success: true, message: output || 'Already up to date.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git merge — Merge a branch
 */
export function gitMerge({ branch, noFf = false, squash = false, abort = false, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    if (abort) {
      const output = gitExec('git merge --abort', { cwd });
      return { success: true, message: 'Merge aborted.', output };
    }

    if (!branch) return { success: false, error: 'Branch name required for merge.' };

    let cmd = `git merge "${branch}"`;
    if (noFf) cmd += ' --no-ff';
    if (squash) cmd += ' --squash';

    const output = gitExec(cmd, { cwd });
    return { success: true, message: output || `Merged '${branch}' successfully.` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git stash — Stash operations
 */
export function gitStash({ action = 'list', message, index, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    switch (action) {
      case 'save':
      case 'push': {
        let cmd = 'git stash push';
        if (message) cmd += ` -m "${message.replace(/"/g, '\\"')}"`;
        const output = gitExec(cmd, { cwd });
        return { success: true, message: output || 'Changes stashed.' };
      }
      case 'list': {
        const output = gitExec('git stash list', { cwd });
        if (!output) return { success: true, stashes: [], message: 'No stashes.' };
        const stashes = output.split('\n').filter(Boolean).map(line => {
          const match = line.match(/^(stash@\{\d+\}):\s*(.+)$/);
          return match ? { ref: match[1], description: match[2] } : { ref: '', description: line };
        });
        return { success: true, stashes };
      }
      case 'pop': {
        const ref = index !== undefined ? `stash@{${index}}` : '';
        const output = gitExec(`git stash pop ${ref}`.trim(), { cwd });
        return { success: true, message: output || 'Stash popped.' };
      }
      case 'apply': {
        const ref = index !== undefined ? `stash@{${index}}` : '';
        const output = gitExec(`git stash apply ${ref}`.trim(), { cwd });
        return { success: true, message: output || 'Stash applied.' };
      }
      case 'drop': {
        const ref = index !== undefined ? `stash@{${index}}` : '';
        const output = gitExec(`git stash drop ${ref}`.trim(), { cwd });
        return { success: true, message: output || 'Stash dropped.' };
      }
      case 'clear': {
        gitExec('git stash clear', { cwd });
        return { success: true, message: 'All stashes cleared.' };
      }
      case 'show': {
        const ref = index !== undefined ? `stash@{${index}}` : '';
        const output = gitExec(`git stash show -p ${ref}`.trim(), { cwd });
        return { success: true, diff: output };
      }
      default:
        return { success: false, error: `Unknown stash action: ${action}. Use: save, list, pop, apply, drop, clear, show` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git clone — Clone a repository
 */
export function gitClone({ url, directory, branch, depth, cwd } = {}) {
  try {
    if (!url) return { success: false, error: 'Repository URL required.' };

    let cmd = `git clone "${url}"`;
    if (directory) cmd += ` "${directory}"`;
    if (branch) cmd += ` --branch "${branch}"`;
    if (depth) cmd += ` --depth ${depth}`;

    const output = gitExec(cmd, { cwd: cwd || process.cwd(), timeout: 120000 });
    return { success: true, message: output || `Cloned ${url} successfully.` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git init — Initialize a new repository
 */
export function gitInit({ directory, bare = false, cwd } = {}) {
  try {
    let cmd = 'git init';
    if (bare) cmd += ' --bare';
    if (directory) cmd += ` "${directory}"`;

    const output = gitExec(cmd, { cwd: cwd || process.cwd() });
    return { success: true, message: output };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git remote — Remote management
 */
export function gitRemote({ action = 'list', name, url, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    switch (action) {
      case 'list': {
        const output = gitExec('git remote -v', { cwd });
        if (!output) return { success: true, remotes: [], message: 'No remotes configured.' };
        const remotes = {};
        for (const line of output.split('\n').filter(Boolean)) {
          const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
          if (match) {
            if (!remotes[match[1]]) remotes[match[1]] = {};
            remotes[match[1]][match[3]] = match[2];
          }
        }
        return {
          success: true,
          remotes: Object.entries(remotes).map(([name, urls]) => ({
            name,
            fetchUrl: urls.fetch || '',
            pushUrl: urls.push || '',
          })),
        };
      }
      case 'add': {
        if (!name || !url) return { success: false, error: 'Remote name and URL required.' };
        gitExec(`git remote add "${name}" "${url}"`, { cwd });
        return { success: true, message: `Remote '${name}' added → ${url}` };
      }
      case 'remove': {
        if (!name) return { success: false, error: 'Remote name required.' };
        gitExec(`git remote remove "${name}"`, { cwd });
        return { success: true, message: `Remote '${name}' removed.` };
      }
      case 'set-url': {
        if (!name || !url) return { success: false, error: 'Remote name and URL required.' };
        gitExec(`git remote set-url "${name}" "${url}"`, { cwd });
        return { success: true, message: `Remote '${name}' URL updated → ${url}` };
      }
      default:
        return { success: false, error: `Unknown action: ${action}. Use: list, add, remove, set-url` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git tag — Tag management
 */
export function gitTag({ action = 'list', name, message, commit, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    switch (action) {
      case 'list': {
        const output = gitExec('git tag --sort=-creatordate -n1', { cwd });
        if (!output) return { success: true, tags: [] };
        const tags = output.split('\n').filter(Boolean).map(line => {
          const parts = line.match(/^(\S+)\s*(.*)/);
          return parts ? { name: parts[1], message: parts[2]?.trim() || '' } : { name: line.trim(), message: '' };
        });
        return { success: true, tags };
      }
      case 'create': {
        if (!name) return { success: false, error: 'Tag name required.' };
        let cmd = message
          ? `git tag -a "${name}" -m "${message.replace(/"/g, '\\"')}"`
          : `git tag "${name}"`;
        if (commit) cmd += ` ${commit}`;
        gitExec(cmd, { cwd });
        return { success: true, message: `Tag '${name}' created.` };
      }
      case 'delete': {
        if (!name) return { success: false, error: 'Tag name required.' };
        gitExec(`git tag -d "${name}"`, { cwd });
        return { success: true, message: `Tag '${name}' deleted.` };
      }
      default:
        return { success: false, error: `Unknown action: ${action}. Use: list, create, delete` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git blame — Show who changed each line of a file
 */
export function gitBlame({ file, startLine, endLine, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };
    if (!file) return { success: false, error: 'File path required.' };

    let cmd = `git blame "${file}"`;
    if (startLine && endLine) cmd += ` -L ${startLine},${endLine}`;
    else if (startLine) cmd += ` -L ${startLine},`;

    const output = gitExec(cmd, { cwd });
    return { success: true, blame: output };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git cherry-pick — Apply specific commits
 */
export function gitCherryPick({ commits, noCommit = false, abort = false, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    if (abort) {
      gitExec('git cherry-pick --abort', { cwd });
      return { success: true, message: 'Cherry-pick aborted.' };
    }

    if (!commits || commits.length === 0) return { success: false, error: 'Commit hash(es) required.' };

    const commitList = Array.isArray(commits) ? commits : [commits];
    let cmd = `git cherry-pick ${commitList.join(' ')}`;
    if (noCommit) cmd += ' --no-commit';

    const output = gitExec(cmd, { cwd });
    return { success: true, message: output || `Cherry-picked ${commitList.length} commit(s).` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git rebase — Rebase operations
 */
export function gitRebase({ branch, interactive = false, abort = false, continue: cont = false, onto, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    if (abort) {
      gitExec('git rebase --abort', { cwd });
      return { success: true, message: 'Rebase aborted.' };
    }
    if (cont) {
      gitExec('git rebase --continue', { cwd });
      return { success: true, message: 'Rebase continued.' };
    }

    if (!branch) return { success: false, error: 'Branch name required for rebase.' };

    let cmd = 'git rebase';
    if (interactive) cmd += ' -i';
    if (onto) cmd += ` --onto ${onto}`;
    cmd += ` "${branch}"`;

    const output = gitExec(cmd, { cwd, timeout: 60000 });
    return { success: true, message: output || `Rebased onto '${branch}'.` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git reset — Reset HEAD to a state
 */
export function gitReset({ mode = 'mixed', target, files, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    if (files && files.length > 0) {
      // Unstage specific files
      const fileList = Array.isArray(files) ? files : [files];
      for (const f of fileList) {
        gitExec(`git reset HEAD "${f}"`, { cwd });
      }
      return { success: true, message: `Unstaged ${fileList.length} file(s).` };
    }

    let cmd = 'git reset';
    if (mode === 'hard') cmd += ' --hard';
    else if (mode === 'soft') cmd += ' --soft';
    // mixed is default
    if (target) cmd += ` ${target}`;

    const output = gitExec(cmd, { cwd });
    return { success: true, message: output || `Reset to ${target || 'HEAD'} (${mode}).` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git checkout — Checkout files or commits
 */
export function gitCheckout({ target, files, createBranch = false, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    if (files && files.length > 0) {
      // Restore specific files
      const fileList = Array.isArray(files) ? files : [files];
      for (const f of fileList) {
        gitExec(`git checkout -- "${f}"`, { cwd });
      }
      return { success: true, message: `Restored ${fileList.length} file(s).` };
    }

    if (!target) return { success: false, error: 'Target branch/commit required.' };

    let cmd = createBranch ? `git checkout -b "${target}"` : `git checkout "${target}"`;
    const output = gitExec(cmd, { cwd });
    return { success: true, message: output || `Checked out '${target}'.` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git show — Show details of a commit
 */
export function gitShow({ commit = 'HEAD', stat = false, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    let cmd = `git show ${commit}`;
    if (stat) cmd += ' --stat';

    const output = gitExec(cmd, { cwd });
    return {
      success: true,
      output: output.length > 50000 ? output.slice(0, 50000) + '\n... (truncated)' : output,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git fetch — Fetch from remote
 */
export function gitFetch({ remote = 'origin', prune = false, all = false, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    let cmd = 'git fetch';
    if (all) cmd += ' --all';
    else cmd += ` ${remote}`;
    if (prune) cmd += ' --prune';

    const output = gitExec(cmd, { cwd, timeout: 60000 });
    return { success: true, message: output || 'Fetch complete.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * git conflict resolver — Detect and help with conflicts
 */
export function gitConflicts({ action = 'list', file, resolution, cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    switch (action) {
      case 'list': {
        const output = gitExec('git diff --name-only --diff-filter=U', { cwd });
        if (!output) return { success: true, conflicts: [], message: 'No conflicts.' };
        const files = output.split('\n').filter(Boolean);
        return { success: true, conflicts: files };
      }
      case 'show': {
        if (!file) return { success: false, error: 'File path required.' };
        const content = fs.readFileSync(path.resolve(cwd || process.cwd(), file), 'utf-8');
        // Extract conflict markers
        const conflictRegex = /<<<<<<< .+?\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> .+?/g;
        const conflicts = [];
        let match;
        while ((match = conflictRegex.exec(content)) !== null) {
          conflicts.push({
            ours: match[1].trim(),
            theirs: match[2].trim(),
            position: match.index,
          });
        }
        return { success: true, file, content, conflicts, hasConflicts: conflicts.length > 0 };
      }
      case 'accept-ours': {
        if (!file) return { success: false, error: 'File path required.' };
        gitExec(`git checkout --ours "${file}"`, { cwd });
        gitExec(`git add "${file}"`, { cwd });
        return { success: true, message: `Accepted 'ours' for ${file} and staged.` };
      }
      case 'accept-theirs': {
        if (!file) return { success: false, error: 'File path required.' };
        gitExec(`git checkout --theirs "${file}"`, { cwd });
        gitExec(`git add "${file}"`, { cwd });
        return { success: true, message: `Accepted 'theirs' for ${file} and staged.` };
      }
      default:
        return { success: false, error: `Unknown action: ${action}. Use: list, show, accept-ours, accept-theirs` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get comprehensive repo info for AI context
 */
export function gitRepoInfo({ cwd } = {}) {
  try {
    if (!isGitRepo(cwd)) return { success: false, error: 'Not a git repository.' };

    const root = getRepoRoot(cwd);
    const branch = gitExec('git branch --show-current', { cwd });
    const remoteUrl = (() => { try { return gitExec('git remote get-url origin', { cwd }); } catch { return null; } })();
    const commitCount = (() => { try { return gitExec('git rev-list --count HEAD', { cwd }); } catch { return '0'; } })();
    const contributors = (() => {
      try {
        return gitExec('git shortlog -sne --all', { cwd }).split('\n').filter(Boolean).map(line => {
          const match = line.trim().match(/^\s*(\d+)\s+(.+)\s+<(.+)>$/);
          return match ? { commits: parseInt(match[1]), name: match[2].trim(), email: match[3] } : null;
        }).filter(Boolean);
      } catch { return []; }
    })();
    const branchCount = (() => { try { return gitExec('git branch --list', { cwd }).split('\n').filter(Boolean).length; } catch { return 0; } })();
    const tagCount = (() => { try { return gitExec('git tag', { cwd }).split('\n').filter(Boolean).length; } catch { return 0; } })();
    const lastTag = (() => { try { return gitExec('git describe --tags --abbrev=0', { cwd }); } catch { return null; } })();

    return {
      success: true,
      root,
      branch,
      remoteUrl,
      commitCount: parseInt(commitCount),
      contributors,
      branchCount,
      tagCount,
      lastTag,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
// EXPORT ALL
// ════════════════════════════════════════════════════════════

export const gitOperations = {
  status: gitStatus,
  log: gitLog,
  branch: gitBranch,
  diff: gitDiff,
  add: gitAdd,
  commit: gitCommit,
  push: gitPush,
  pull: gitPull,
  merge: gitMerge,
  stash: gitStash,
  clone: gitClone,
  init: gitInit,
  remote: gitRemote,
  tag: gitTag,
  blame: gitBlame,
  cherryPick: gitCherryPick,
  rebase: gitRebase,
  reset: gitReset,
  checkout: gitCheckout,
  show: gitShow,
  fetch: gitFetch,
  conflicts: gitConflicts,
  repoInfo: gitRepoInfo,
};
