import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { run, execMiseTasksLs } from '../src/main'

jest.mock('@actions/core')
jest.mock('@actions/exec')

const mockGetInput = core.getInput as jest.MockedFunction<typeof core.getInput>
const mockSetOutput = core.setOutput as jest.MockedFunction<typeof core.setOutput>
const mockSetFailed = core.setFailed as jest.MockedFunction<typeof core.setFailed>
const mockInfo = core.info as jest.MockedFunction<typeof core.info>
const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>

/** Helper: mock mise tasks ls to return given JSON */
function mockMiseTasks(tasks: object[]): void {
  const json = JSON.stringify(tasks)
  mockExec.mockImplementationOnce(async (_cmd, _args, options) => {
    options?.listeners?.stdout?.(Buffer.from(json))
    return 0
  })
}

/** Minimal mise task object */
function miseTask(name: string, sources: string[] = []) {
  return { name, source: '', description: '', sources, outputs: [], depends: [] }
}

describe('execMiseTasksLs', () => {
  it('returns parsed tasks on success', async () => {
    const tasks = [miseTask('ci:build')]
    const json = JSON.stringify(tasks)
    mockExec.mockImplementationOnce(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from(json))
      return 0
    })
    const result = await execMiseTasksLs()
    expect(result).toEqual(tasks)
    expect(mockExec).toHaveBeenCalledWith(
      'mise',
      ['tasks', 'ls', '--all', '--json'],
      expect.anything()
    )
  })

  it('returns empty array when mise fails', async () => {
    mockExec.mockResolvedValueOnce(1)
    const result = await execMiseTasksLs()
    expect(result).toEqual([])
  })

  it('returns empty array on invalid JSON', async () => {
    mockExec.mockImplementationOnce(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from('not json'))
      return 0
    })
    const result = await execMiseTasksLs()
    expect(result).toEqual([])
  })
})

describe('run', () => {
  it('discovers and groups tasks without change detection', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'task-prefix') return 'ci:build'
      if (name === 'base-ref') return ''
      return ''
    })
    mockMiseTasks([
      miseTask('ci:build', ['src/**']),
      miseTask('ci:build:docker', ['Dockerfile']),
      miseTask('ci:test'),
      miseTask('ci:lint'),
    ])

    await run()

    expect(mockSetOutput).toHaveBeenCalledWith(
      'projects',
      JSON.stringify([
        { project: '.', tasks: 'ci:build ::: ci:build:docker' },
      ])
    )
    expect(mockSetFailed).not.toHaveBeenCalled()
  })

  it('handles monorepo tasks', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'task-prefix') return 'ci:build'
      if (name === 'base-ref') return ''
      return ''
    })
    mockMiseTasks([
      miseTask('//services/api:ci:build'),
      miseTask('//services/api:ci:build:docker'),
      miseTask('//services/worker:ci:build'),
    ])

    await run()

    expect(mockSetOutput).toHaveBeenCalledWith(
      'projects',
      JSON.stringify([
        { project: 'services/api', tasks: '//services/api:ci:build ::: //services/api:ci:build:docker' },
        { project: 'services/worker', tasks: '//services/worker:ci:build' },
      ])
    )
  })

  it('applies change detection when base-ref is set', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'task-prefix') return 'ci:build'
      if (name === 'base-ref') return 'abc123'
      return ''
    })
    // First call: mise tasks ls
    mockMiseTasks([
      miseTask('ci:build', ['src/**']),
      miseTask('ci:build:docker', ['Dockerfile']),
    ])
    // Second call: git diff for ci:build (changed)
    mockExec.mockResolvedValueOnce(1)
    // Third call: git diff for ci:build:docker (unchanged)
    mockExec.mockResolvedValueOnce(0)

    await run()

    expect(mockSetOutput).toHaveBeenCalledWith(
      'projects',
      JSON.stringify([
        { project: '.', tasks: 'ci:build' },
      ])
    )
  })

  it('returns empty array when no tasks match prefix', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'task-prefix') return 'ci:deploy'
      if (name === 'base-ref') return ''
      return ''
    })
    mockMiseTasks([
      miseTask('ci:build'),
      miseTask('ci:test'),
    ])

    await run()

    expect(mockSetOutput).toHaveBeenCalledWith('projects', '[]')
  })

  it('returns all tasks when prefix is empty', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'task-prefix') return ''
      if (name === 'base-ref') return ''
      return ''
    })
    mockMiseTasks([
      miseTask('ci:build'),
      miseTask('ci:test'),
      miseTask('dev:serve'),
    ])

    await run()

    expect(mockSetOutput).toHaveBeenCalledWith(
      'projects',
      JSON.stringify([
        { project: '.', tasks: 'ci:build ::: ci:test ::: dev:serve' },
      ])
    )
  })

  it('calls setFailed on unexpected error', async () => {
    mockGetInput.mockImplementation(() => {
      throw new Error('input error')
    })

    await run()

    expect(mockSetFailed).toHaveBeenCalledWith('input error')
  })

  it('handles non-Error throws', async () => {
    mockGetInput.mockImplementation(() => {
      throw 'string error'
    })

    await run()

    expect(mockSetFailed).toHaveBeenCalledWith('An unexpected error occurred')
  })

  it('logs discovered projects', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'task-prefix') return 'ci:build'
      if (name === 'base-ref') return ''
      return ''
    })
    mockMiseTasks([miseTask('ci:build')])

    await run()

    expect(mockInfo).toHaveBeenCalledWith("Discovered 1 project(s) matching 'ci:build*':")
    expect(mockInfo).toHaveBeenCalledWith('  .: ci:build')
  })
})
