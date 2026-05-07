#!/usr/bin/env node
/**
 * Auto-commit and push script
 * Watches for file changes and automatically commits and pushes them
 * 
 * Usage: node scripts/auto-commit-push.js
 * Or: npm run auto-commit
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let isCommitting = false;
let commitTimeout = null;

function getGitStatus() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    return status.trim();
  } catch (error) {
    return '';
  }
}

function hasChanges() {
  const status = getGitStatus();
  return status.length > 0;
}

function commitAndPush() {
  if (isCommitting) {
    return;
  }

  if (!hasChanges()) {
    return;
  }

  isCommitting = true;
  console.log('\n[Auto-commit] Changes detected, committing...');

  try {
    // Stage all changes
    execSync('git add -A', { stdio: 'inherit' });

    // Create commit message with timestamp
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'Asia/Manila',
      dateStyle: 'short',
      timeStyle: 'short'
    });
    const commitMessage = `Auto-commit: ${timestamp} (Manila time)`;

    // Commit
    execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });

    // Push
    const branch = execSync('git symbolic-ref --short HEAD', { encoding: 'utf-8' }).trim();
    console.log(`[Auto-commit] Pushing to origin/${branch}...`);
    execSync(`git push origin ${branch}`, { stdio: 'inherit' });

    console.log('[Auto-commit] ✅ Changes committed and pushed successfully!\n');
  } catch (error) {
    console.error('[Auto-commit] ❌ Error:', error.message);
  } finally {
    isCommitting = false;
  }
}

function watchForChanges() {
  const watchDirs = [
    path.join(process.cwd(), 'app'),
    path.join(process.cwd(), 'components'),
    path.join(process.cwd(), 'lib'),
    path.join(process.cwd(), 'public'),
  ];

  console.log('🔍 Watching for changes...');
  console.log('Press Ctrl+C to stop\n');

  watchDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.watch(dir, { recursive: true }, (eventType, filename) => {
        // Ignore node_modules, .next, .git, etc.
        if (filename && (
          filename.includes('node_modules') ||
          filename.includes('.next') ||
          filename.includes('.git') ||
          filename.includes('package-lock.json') ||
          filename.includes('.log')
        )) {
          return;
        }

        // Debounce - wait 2 seconds after last change before committing
        if (commitTimeout) {
          clearTimeout(commitTimeout);
        }

        commitTimeout = setTimeout(() => {
          commitAndPush();
        }, 2000);
      });
    }
  });
}

// Start watching
watchForChanges();

