import {
  parseMiseTasks,
  filterByPrefix,
  groupByProject,
  MiseTask,
  ParsedTask,
} from '../src/task-parser'

function makeMiseTask(overrides: Partial<MiseTask> & { name: string }): MiseTask {
  return {
    source: '',
    description: '',
    sources: [],
    outputs: [],
    depends: [],
    ...overrides,
  }
}

describe('parseMiseTasks', () => {
  it('parses non-monorepo tasks as project "."', () => {
    const raw = [
      makeMiseTask({ name: 'ci:build', sources: ['src/**/*.py'] }),
      makeMiseTask({ name: 'ci:test' }),
    ]
    const result = parseMiseTasks(raw)
    expect(result).toEqual([
      { project: '.', task: 'ci:build', localName: 'ci:build', sources: ['src/**/*.py'] },
      { project: '.', task: 'ci:test', localName: 'ci:test', sources: [] },
    ])
  })

  it('parses monorepo tasks with //path:task format', () => {
    const raw = [
      makeMiseTask({ name: '//services/api:ci:build', sources: ['src/**/*.py'] }),
      makeMiseTask({ name: '//services/worker:ci:build:docker', sources: ['Dockerfile'] }),
    ]
    const result = parseMiseTasks(raw)
    expect(result).toEqual([
      {
        project: 'services/api',
        task: '//services/api:ci:build',
        localName: 'ci:build',
        sources: ['src/**/*.py'],
      },
      {
        project: 'services/worker',
        task: '//services/worker:ci:build:docker',
        localName: 'ci:build:docker',
        sources: ['Dockerfile'],
      },
    ])
  })

  it('parses root monorepo tasks (//:task) as project "."', () => {
    const raw = [makeMiseTask({ name: '//:ci:build', sources: ['src/**'] })]
    const result = parseMiseTasks(raw)
    expect(result).toEqual([
      { project: '.', task: '//:ci:build', localName: 'ci:build', sources: ['src/**'] },
    ])
  })

  it('handles missing sources field', () => {
    const raw = [{ name: 'ci:build', source: '', description: '', outputs: [], depends: [] }]
    const result = parseMiseTasks(raw as MiseTask[])
    expect(result[0].sources).toEqual([])
  })

  it('handles empty array', () => {
    expect(parseMiseTasks([])).toEqual([])
  })

  it('handles deep monorepo paths', () => {
    const raw = [makeMiseTask({ name: '//charts/public-helm/redis:ci:build' })]
    const result = parseMiseTasks(raw)
    expect(result[0].project).toBe('charts/public-helm/redis')
    expect(result[0].localName).toBe('ci:build')
  })
})

describe('filterByPrefix', () => {
  const tasks: ParsedTask[] = [
    { project: '.', task: 'ci:build', localName: 'ci:build', sources: [] },
    { project: '.', task: 'ci:build:docker', localName: 'ci:build:docker', sources: [] },
    { project: '.', task: 'ci:test', localName: 'ci:test', sources: [] },
    { project: '.', task: 'ci:lint:ruff', localName: 'ci:lint:ruff', sources: [] },
    { project: '.', task: 'dev:serve', localName: 'dev:serve', sources: [] },
  ]

  it('filters by prefix', () => {
    const result = filterByPrefix(tasks, 'ci:build')
    expect(result).toHaveLength(2)
    expect(result.map((t) => t.localName)).toEqual(['ci:build', 'ci:build:docker'])
  })

  it('returns all tasks for empty prefix', () => {
    const result = filterByPrefix(tasks, '')
    expect(result).toHaveLength(5)
  })

  it('returns empty for non-matching prefix', () => {
    const result = filterByPrefix(tasks, 'deploy')
    expect(result).toHaveLength(0)
  })

  it('handles ci:lint prefix', () => {
    const result = filterByPrefix(tasks, 'ci:lint')
    expect(result).toHaveLength(1)
    expect(result[0].localName).toBe('ci:lint:ruff')
  })

  it('handles ci:test prefix', () => {
    const result = filterByPrefix(tasks, 'ci:test')
    expect(result).toHaveLength(1)
    expect(result[0].localName).toBe('ci:test')
  })
})

describe('groupByProject', () => {
  it('groups tasks from multiple projects', () => {
    const tasks: ParsedTask[] = [
      { project: 'services/api', task: '//services/api:ci:build', localName: 'ci:build', sources: [] },
      { project: 'services/api', task: '//services/api:ci:build:docker', localName: 'ci:build:docker', sources: [] },
      { project: 'services/worker', task: '//services/worker:ci:build', localName: 'ci:build', sources: [] },
    ]
    const result = groupByProject(tasks)
    expect(result).toEqual([
      { project: 'services/api', tasks: '//services/api:ci:build ::: //services/api:ci:build:docker' },
      { project: 'services/worker', tasks: '//services/worker:ci:build' },
    ])
  })

  it('handles single project', () => {
    const tasks: ParsedTask[] = [
      { project: '.', task: 'ci:build', localName: 'ci:build', sources: [] },
      { project: '.', task: 'ci:build:docker', localName: 'ci:build:docker', sources: [] },
    ]
    const result = groupByProject(tasks)
    expect(result).toEqual([
      { project: '.', tasks: 'ci:build ::: ci:build:docker' },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(groupByProject([])).toEqual([])
  })

  it('preserves insertion order', () => {
    const tasks: ParsedTask[] = [
      { project: 'b', task: 'b:ci:build', localName: 'ci:build', sources: [] },
      { project: 'a', task: 'a:ci:build', localName: 'ci:build', sources: [] },
      { project: 'b', task: 'b:ci:build:docker', localName: 'ci:build:docker', sources: [] },
    ]
    const result = groupByProject(tasks)
    expect(result[0].project).toBe('b')
    expect(result[1].project).toBe('a')
  })
})
