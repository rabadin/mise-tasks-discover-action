/**
 * Integration test: runs `node dist/index.js` as a subprocess with
 * INPUT_* env vars and a temp GITHUB_OUTPUT file, then verifies
 * the output matches expected format.
 *
 * Requires: mise installed, dist/index.js built.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'
import { createFixture, Fixture } from './setup-fixture'

let fixture: Fixture

afterEach(() => {
  fixture?.cleanup()
})

interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
  outputs: Record<string, string>
}

function runAction(cwd: string, inputs: Record<string, string>): RunResult {
  const distPath = path.resolve(__dirname, '../../dist/index.js')

  // Create a temp file for GITHUB_OUTPUT
  const outputFile = path.join(os.tmpdir(), `github-output-${Date.now()}`)
  fs.writeFileSync(outputFile, '')

  const stateFile = path.join(os.tmpdir(), `github-state-${Date.now()}`)
  fs.writeFileSync(stateFile, '')

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    GITHUB_OUTPUT: outputFile,
    GITHUB_STATE: stateFile,
    MISE_YES: '1',
    MISE_EXPERIMENTAL: '1',
  }

  // Map inputs to INPUT_* env vars
  for (const [key, value] of Object.entries(inputs)) {
    env[`INPUT_${key.toUpperCase()}`] = value
  }

  let stdout = ''
  let stderr = ''
  let exitCode = 0

  try {
    stdout = execSync(`node "${distPath}"`, {
      cwd,
      encoding: 'utf-8',
      env,
      timeout: 30000,
    })
  } catch (err: unknown) {
    const error = err as { status?: number; stdout?: string; stderr?: string }
    exitCode = error.status ?? 1
    stdout = error.stdout ?? ''
    stderr = error.stderr ?? ''
  }

  // Parse GITHUB_OUTPUT file
  const outputs: Record<string, string> = {}
  if (fs.existsSync(outputFile)) {
    const content = fs.readFileSync(outputFile, 'utf-8')
    // GITHUB_OUTPUT format from @actions/core:
    //   key<<ghadelimiter_UUID\nvalue\nghadelimiter_UUID
    // or simple: key=value
    const lines = content.split('\n')
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      // Check heredoc format first: key<<delimiter
      const heredocMatch = line.match(/^([^<]+)<<(.+)$/)
      if (heredocMatch) {
        const [, name, delimiter] = heredocMatch
        const valueLines: string[] = []
        i++
        while (i < lines.length && lines[i] !== delimiter) {
          valueLines.push(lines[i])
          i++
        }
        outputs[name] = valueLines.join('\n')
      } else {
        // Simple format: key=value
        const simpleMatch = line.match(/^([^=]+)=(.*)$/)
        if (simpleMatch) {
          const [, name, value] = simpleMatch
          outputs[name] = value
        }
      }
      i++
    }
    fs.unlinkSync(outputFile)
  }
  if (fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile)
  }

  return { stdout, stderr, exitCode, outputs }
}

describe('end-to-end action execution', () => {
  it('discovers tasks and produces valid JSON output', () => {
    fixture = createFixture({
      miseToml: `
[tasks."ci:build"]
description = "Build the project"
run = "echo building"
sources = ["src/**/*.ts"]
outputs = ["dist/index.js"]

[tasks."ci:test"]
description = "Run tests"
run = "echo testing"
`,
      files: {
        'src/app.ts': 'console.log("hello")',
      },
    })

    const result = runAction(fixture.dir, {
      'TASK-PREFIX': 'ci:build',
      'BASE-REF': '',
    })

    expect(result.exitCode).toBe(0)
    expect(result.outputs.projects).toBeDefined()

    const projects = JSON.parse(result.outputs.projects)
    expect(Array.isArray(projects)).toBe(true)
    expect(projects.length).toBe(1)
    expect(projects[0].project).toBe('.')
    expect(projects[0].tasks).toContain('ci:build')
    // ci:test should NOT be included (prefix filter)
    expect(projects[0].tasks).not.toContain('ci:test')
  })

  it('returns empty array when no tasks match', () => {
    fixture = createFixture({
      miseToml: `
[tasks."ci:build"]
run = "echo building"
`,
      files: {},
    })

    const result = runAction(fixture.dir, {
      'TASK-PREFIX': 'ci:deploy',
      'BASE-REF': '',
    })

    expect(result.exitCode).toBe(0)
    expect(result.outputs.projects).toBeDefined()

    const projects = JSON.parse(result.outputs.projects)
    expect(projects).toEqual([])
  })

  it('applies change detection when base-ref is set', () => {
    fixture = createFixture({
      miseToml: `
[tasks."ci:build"]
description = "Build Python"
run = "echo build"
sources = ["src/**"]

[tasks."ci:build:docker"]
description = "Build Docker"
run = "echo docker"
sources = ["Dockerfile"]
`,
      files: {
        'src/app.ts': 'original',
        'Dockerfile': 'FROM node:20',
      },
      modifiedFiles: {
        // Only modify src/ — Dockerfile is unchanged
        'src/app.ts': 'modified',
      },
    })

    const result = runAction(fixture.dir, {
      'TASK-PREFIX': 'ci:build',
      'BASE-REF': fixture.baseRef,
    })

    expect(result.exitCode).toBe(0)
    const projects = JSON.parse(result.outputs.projects)
    expect(projects.length).toBe(1)
    // ci:build should be included (src/** changed)
    expect(projects[0].tasks).toContain('ci:build')
    // ci:build:docker should be excluded (Dockerfile unchanged)
    expect(projects[0].tasks).not.toContain('ci:build:docker')
  })

  it('returns all tasks when prefix is empty', () => {
    fixture = createFixture({
      miseToml: `
[tasks."ci:build"]
run = "echo build"
[tasks."ci:test"]
run = "echo test"
[tasks."dev:serve"]
run = "echo serve"
`,
      files: {},
    })

    const result = runAction(fixture.dir, {
      'TASK-PREFIX': '',
      'BASE-REF': '',
    })

    expect(result.exitCode).toBe(0)
    const projects = JSON.parse(result.outputs.projects)
    expect(projects.length).toBe(1)
    expect(projects[0].tasks).toContain('ci:build')
    expect(projects[0].tasks).toContain('ci:test')
    expect(projects[0].tasks).toContain('dev:serve')
  })
})
