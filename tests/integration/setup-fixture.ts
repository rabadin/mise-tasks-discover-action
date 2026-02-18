/**
 * Test fixture helper: creates temporary git repos with mise.toml files
 * for integration testing against real mise and git.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'

export interface Fixture {
  /** Absolute path to the temp directory */
  dir: string
  /** Git SHA of the initial commit (base ref for change detection) */
  baseRef: string
  /** Clean up the temp directory */
  cleanup: () => void
}

interface FixtureOptions {
  /** mise.toml content */
  miseToml: string
  /** Files to create in the initial commit: { relativePath: content } */
  files?: Record<string, string>
  /** Files to modify in a second commit (for change detection tests) */
  modifiedFiles?: Record<string, string>
}

function git(dir: string, args: string): string {
  return execSync(`git ${args}`, {
    cwd: dir,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@test.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@test.com',
    },
  }).trim()
}

export function createFixture(options: FixtureOptions): Fixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mise-discover-test-'))

  // Initialize git repo
  git(dir, 'init -b main')

  // Write mise.toml and trust it
  fs.writeFileSync(path.join(dir, 'mise.toml'), options.miseToml)
  execSync('mise trust', { cwd: dir, encoding: 'utf-8' })

  // Write additional files
  if (options.files) {
    for (const [relPath, content] of Object.entries(options.files)) {
      const fullPath = path.join(dir, relPath)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content)
    }
  }

  // Initial commit
  git(dir, 'add -A')
  git(dir, 'commit -m "initial"')
  const baseRef = git(dir, 'rev-parse HEAD')

  // Optional second commit with modifications
  if (options.modifiedFiles) {
    for (const [relPath, content] of Object.entries(options.modifiedFiles)) {
      const fullPath = path.join(dir, relPath)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content)
    }
    git(dir, 'add -A')
    git(dir, 'commit -m "modify files"')
  }

  return {
    dir,
    baseRef,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  }
}
