/**
 * Integration test: verifies real git diff pathspec behavior
 * matches what change-detector.ts produces.
 *
 * Requires git to be installed.
 */

import { execSync } from 'child_process'
import { createFixture, Fixture } from './setup-fixture'

let fixture: Fixture

afterEach(() => {
  fixture?.cleanup()
})

function gitDiffQuiet(cwd: string, baseRef: string, pathspecs: string[]): number {
  try {
    execSync(
      `git diff --quiet ${baseRef} HEAD -- ${pathspecs.map(p => `'${p}'`).join(' ')}`,
      { cwd, encoding: 'utf-8' }
    )
    return 0 // no changes
  } catch (err: unknown) {
    const error = err as { status?: number }
    return error.status ?? 128
  }
}

describe('real git diff pathspec behavior', () => {
  it('detects changes in matching glob paths', () => {
    fixture = createFixture({
      miseToml: `
[tasks."ci:build"]
run = "echo build"
sources = ["src/**/*.ts"]
`,
      files: {
        'src/index.ts': 'original',
        'tests/test.ts': 'test',
      },
      modifiedFiles: {
        'src/index.ts': 'modified',
      },
    })

    // src/**/*.ts should show changes
    const srcResult = gitDiffQuiet(fixture.dir, fixture.baseRef, [':(glob)src/**/*.ts'])
    expect(srcResult).toBe(1) // changes found

    // tests/**/*.ts should NOT show changes
    const testResult = gitDiffQuiet(fixture.dir, fixture.baseRef, [':(glob)tests/**/*.ts'])
    expect(testResult).toBe(0) // no changes
  })

  it('detects changes with multiple pathspecs', () => {
    fixture = createFixture({
      miseToml: `
[tasks."ci:build"]
run = "echo build"
sources = ["src/**", "package.json"]
`,
      files: {
        'src/app.ts': 'original',
        'package.json': '{"name": "test"}',
        'README.md': 'readme',
      },
      modifiedFiles: {
        'package.json': '{"name": "test", "version": "2.0.0"}',
      },
    })

    // Either pathspec matching = changes detected
    const result = gitDiffQuiet(fixture.dir, fixture.baseRef, [
      ':(glob)src/**',
      ':(glob)package.json',
    ])
    expect(result).toBe(1)

    // Unrelated path = no changes
    const readmeResult = gitDiffQuiet(fixture.dir, fixture.baseRef, [':(glob)README.md'])
    expect(readmeResult).toBe(0)
  })

  it('returns 0 (no changes) when files match but are unmodified', () => {
    fixture = createFixture({
      miseToml: `
[tasks."ci:build"]
run = "echo build"
sources = ["src/**"]
`,
      files: {
        'src/index.ts': 'unchanged',
      },
      // No modifiedFiles — second commit modifies something else
      modifiedFiles: {
        'docs/README.md': 'new doc',
      },
    })

    const result = gitDiffQuiet(fixture.dir, fixture.baseRef, [':(glob)src/**'])
    expect(result).toBe(0) // src/** unchanged
  })

  it('handles subdirectory pathspecs (monorepo simulation)', () => {
    fixture = createFixture({
      miseToml: `
[tasks."ci:build"]
run = "echo build"
`,
      files: {
        'services/api/src/handler.ts': 'original',
        'services/worker/src/worker.ts': 'original',
      },
      modifiedFiles: {
        'services/api/src/handler.ts': 'modified',
      },
    })

    // services/api/** should show changes
    const apiResult = gitDiffQuiet(fixture.dir, fixture.baseRef, [':(glob)services/api/src/**'])
    expect(apiResult).toBe(1)

    // services/worker/** should NOT show changes
    const workerResult = gitDiffQuiet(fixture.dir, fixture.baseRef, [':(glob)services/worker/src/**'])
    expect(workerResult).toBe(0)
  })

  it('handles new files as changes', () => {
    fixture = createFixture({
      miseToml: `
[tasks."ci:build"]
run = "echo build"
sources = ["src/**"]
`,
      files: {
        'src/existing.ts': 'exists',
      },
      modifiedFiles: {
        'src/new-file.ts': 'brand new',
      },
    })

    const result = gitDiffQuiet(fixture.dir, fixture.baseRef, [':(glob)src/**'])
    expect(result).toBe(1)
  })
})
