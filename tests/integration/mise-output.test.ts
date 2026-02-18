/**
 * Integration test: verifies real `mise tasks ls --all --json` output
 * can be parsed by our task-parser functions.
 *
 * Requires mise to be installed and on PATH.
 */

import { execSync } from 'child_process'
import { createFixture, Fixture } from './setup-fixture'
import { parseMiseTasks, filterByPrefix, groupByProject, MiseTask } from '../../src/task-parser'

let fixture: Fixture

beforeAll(() => {
  // Verify mise is available
  try {
    execSync('mise --version', { encoding: 'utf-8' })
  } catch {
    throw new Error('mise is not installed — required for integration tests')
  }
})

afterEach(() => {
  fixture?.cleanup()
})

function runMiseTasksLs(cwd: string): MiseTask[] {
  const output = execSync('mise tasks ls --all --json', {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      MISE_YES: '1',
      MISE_EXPERIMENTAL: '1',
    },
  })
  return JSON.parse(output) as MiseTask[]
}

describe('real mise output parsing', () => {
  it('parses tasks from a simple mise.toml', () => {
    fixture = createFixture({
      miseToml: `
[tasks."ci:build"]
description = "Build the project"
run = "echo building"
sources = ["src/**/*.ts"]
outputs = ["dist/index.js"]

[tasks."ci:build:docker"]
description = "Build Docker image"
run = "echo docker"
sources = ["Dockerfile"]
outputs = ["docker://myapp:latest"]

[tasks."ci:test"]
description = "Run tests"
run = "echo testing"

[tasks."ci:lint"]
description = "Lint code"
run = "echo linting"
`,
      files: {
        'src/app.ts': 'console.log("hello")',
        'Dockerfile': 'FROM node:20',
      },
    })

    const raw = runMiseTasksLs(fixture.dir)
    expect(raw.length).toBeGreaterThanOrEqual(4)

    const parsed = parseMiseTasks(raw)
    expect(parsed.length).toBeGreaterThanOrEqual(4)

    // All tasks should have project "." (non-monorepo)
    for (const task of parsed) {
      expect(task.project).toBe('.')
    }

    // Filter by ci:build prefix
    const builds = filterByPrefix(parsed, 'ci:build')
    expect(builds.length).toBe(2)
    expect(builds.map(t => t.localName).sort()).toEqual(['ci:build', 'ci:build:docker'])

    // Filter by ci:test prefix
    const tests = filterByPrefix(parsed, 'ci:test')
    expect(tests.length).toBe(1)
    expect(tests[0].localName).toBe('ci:test')

    // Group by project
    const groups = groupByProject(builds)
    expect(groups).toHaveLength(1)
    expect(groups[0].project).toBe('.')
    expect(groups[0].tasks).toContain('ci:build')
    expect(groups[0].tasks).toContain('ci:build:docker')
  })

  it('handles tasks with sources correctly', () => {
    fixture = createFixture({
      miseToml: `
[tasks."ci:build"]
description = "Build"
run = "echo build"
sources = ["src/**/*.ts", "package.json"]
outputs = ["dist/**"]
`,
      files: {
        'src/index.ts': 'export {}',
        'package.json': '{}',
      },
    })

    const raw = runMiseTasksLs(fixture.dir)
    const parsed = parseMiseTasks(raw)
    const buildTask = parsed.find(t => t.localName === 'ci:build')

    expect(buildTask).toBeDefined()
    expect(buildTask!.sources).toContain('src/**/*.ts')
    expect(buildTask!.sources).toContain('package.json')
  })

  it('returns MiseTask objects with expected fields', () => {
    fixture = createFixture({
      miseToml: `
[tasks."ci:build"]
description = "Build the project"
run = "echo build"
sources = ["src/**"]
outputs = ["dist/**"]
depends = []
`,
      files: { 'src/index.ts': '' },
    })

    const raw = runMiseTasksLs(fixture.dir)
    const task = raw.find(t => t.name === 'ci:build')

    expect(task).toBeDefined()
    expect(task!.name).toBe('ci:build')
    expect(typeof task!.description).toBe('string')
    expect(Array.isArray(task!.sources)).toBe(true)
    expect(Array.isArray(task!.outputs)).toBe(true)
    expect(Array.isArray(task!.depends)).toBe(true)
  })
})
