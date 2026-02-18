import * as exec from '@actions/exec'
import * as core from '@actions/core'
import { filterByChangedSources } from '../src/change-detector'
import type { ParsedTask } from '../src/task-parser'

jest.mock('@actions/exec')
jest.mock('@actions/core')

const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>
const mockInfo = core.info as jest.MockedFunction<typeof core.info>
const mockWarning = core.warning as jest.MockedFunction<typeof core.warning>

function makeTask(overrides: Partial<ParsedTask> & { task: string }): ParsedTask {
  return {
    project: '.',
    localName: overrides.task,
    sources: [],
    ...overrides,
  }
}

describe('filterByChangedSources', () => {
  const baseRef = 'abc123'

  it('includes tasks with no sources (always run)', async () => {
    const tasks = [makeTask({ task: 'ci:build', sources: [] })]
    const result = await filterByChangedSources(tasks, baseRef)
    expect(result).toHaveLength(1)
    expect(result[0].task).toBe('ci:build')
    // Should not call git diff for tasks with no sources
    expect(mockExec).not.toHaveBeenCalled()
  })

  it('includes tasks whose sources changed (git diff exits 1)', async () => {
    mockExec.mockResolvedValueOnce(1)
    const tasks = [makeTask({ task: 'ci:build', sources: ['src/**/*.py'] })]
    const result = await filterByChangedSources(tasks, baseRef)
    expect(result).toHaveLength(1)
    expect(mockExec).toHaveBeenCalledWith(
      'git',
      ['diff', '--quiet', baseRef, 'HEAD', '--', ':(glob)src/**/*.py'],
      expect.objectContaining({ ignoreReturnCode: true, silent: true })
    )
  })

  it('excludes tasks whose sources are unchanged (git diff exits 0)', async () => {
    mockExec.mockResolvedValueOnce(0)
    const tasks = [makeTask({ task: 'ci:build', sources: ['src/**/*.py'] })]
    const result = await filterByChangedSources(tasks, baseRef)
    expect(result).toHaveLength(0)
  })

  it('prefixes pathspecs with project path for monorepo tasks', async () => {
    mockExec.mockResolvedValueOnce(1)
    const tasks = [
      makeTask({
        task: '//services/api:ci:build',
        project: 'services/api',
        sources: ['src/**/*.py', 'pyproject.toml'],
      }),
    ]
    await filterByChangedSources(tasks, baseRef)
    expect(mockExec).toHaveBeenCalledWith(
      'git',
      [
        'diff', '--quiet', baseRef, 'HEAD', '--',
        ':(glob)services/api/src/**/*.py',
        ':(glob)services/api/pyproject.toml',
      ],
      expect.anything()
    )
  })

  it('does not prefix pathspecs for root project', async () => {
    mockExec.mockResolvedValueOnce(1)
    const tasks = [
      makeTask({ task: 'ci:build', project: '.', sources: ['src/**'] }),
    ]
    await filterByChangedSources(tasks, baseRef)
    expect(mockExec).toHaveBeenCalledWith(
      'git',
      ['diff', '--quiet', baseRef, 'HEAD', '--', ':(glob)src/**'],
      expect.anything()
    )
  })

  it('fail-open: includes task when git diff throws', async () => {
    mockExec.mockRejectedValueOnce(new Error('git not found'))
    const tasks = [makeTask({ task: 'ci:build', sources: ['src/**'] })]
    const result = await filterByChangedSources(tasks, baseRef)
    expect(result).toHaveLength(1)
    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('fail-open')
    )
  })

  it('handles mixed changed and unchanged tasks', async () => {
    // Task 1: no sources (always included)
    // Task 2: changed (exit 1)
    // Task 3: unchanged (exit 0)
    // Task 4: changed (exit 1)
    mockExec
      .mockResolvedValueOnce(1) // task 2
      .mockResolvedValueOnce(0) // task 3
      .mockResolvedValueOnce(1) // task 4

    const tasks = [
      makeTask({ task: 'ci:build', sources: [] }),
      makeTask({ task: 'ci:build:docker', sources: ['Dockerfile'] }),
      makeTask({ task: 'ci:build:helm', sources: ['charts/**'] }),
      makeTask({ task: 'ci:test', sources: ['tests/**'] }),
    ]
    const result = await filterByChangedSources(tasks, baseRef)
    expect(result.map((t) => t.task)).toEqual([
      'ci:build',
      'ci:build:docker',
      'ci:test',
    ])
  })

  it('includes task on non-standard exit codes (fail-open)', async () => {
    mockExec.mockResolvedValueOnce(128) // e.g., bad ref
    const tasks = [makeTask({ task: 'ci:build', sources: ['src/**'] })]
    const result = await filterByChangedSources(tasks, baseRef)
    expect(result).toHaveLength(1)
  })

  it('logs filtering header', async () => {
    await filterByChangedSources([], baseRef)
    expect(mockInfo).toHaveBeenCalledWith(
      `Filtering tasks by changes since ${baseRef}...`
    )
  })
})
