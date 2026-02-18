/**
 * Pure functions for parsing mise task JSON output.
 * No side effects, no I/O — fully testable with plain objects.
 */

/** Raw task object from `mise tasks ls --all --json` */
export interface MiseTask {
  name: string
  source: string
  description: string
  sources: string[]
  outputs: string[]
  depends: string[]
  [key: string]: unknown
}

/** Parsed task with monorepo project extracted */
export interface ParsedTask {
  /** Project path: "." for root, or "services/api" for monorepo */
  project: string
  /** Full task name as returned by mise, usable with `mise run` */
  task: string
  /** Local name with //path: prefix stripped, used for prefix matching */
  localName: string
  /** Source file globs from the task definition */
  sources: string[]
}

/** A group of tasks belonging to the same project */
export interface ProjectGroup {
  project: string
  /** Task names joined with " ::: " separator */
  tasks: string
}

/**
 * Parse raw mise task JSON into structured ParsedTask objects.
 *
 * Handles monorepo task names like "//services/api:ci:build" by extracting
 * the project path and local name. Non-monorepo tasks get project = ".".
 */
export function parseMiseTasks(raw: MiseTask[]): ParsedTask[] {
  return raw.map((t) => {
    const name = t.name
    let project: string
    let localName: string

    if (name.startsWith('//')) {
      // Monorepo format: //path:task or //:task (root)
      const withoutPrefix = name.slice(2) // strip "//"
      const colonIdx = withoutPrefix.indexOf(':')
      if (colonIdx >= 0) {
        project = withoutPrefix.slice(0, colonIdx)
        localName = withoutPrefix.slice(colonIdx + 1)
      } else {
        // No colon after // — treat entire thing as project, no local name
        project = withoutPrefix
        localName = ''
      }
      // Empty project path (from "//:task") means root
      if (project === '') {
        project = '.'
      }
    } else {
      project = '.'
      localName = name
    }

    return {
      project,
      task: name,
      localName,
      sources: t.sources ?? [],
    }
  })
}

/**
 * Filter tasks whose local name starts with the given prefix.
 * Empty prefix matches all tasks.
 */
export function filterByPrefix(
  tasks: ParsedTask[],
  prefix: string
): ParsedTask[] {
  if (prefix === '') return tasks
  return tasks.filter((t) => t.localName.startsWith(prefix))
}

/**
 * Group tasks by project, joining task names with " ::: " separator.
 * Preserves the order of first appearance for each project.
 */
export function groupByProject(tasks: ParsedTask[]): ProjectGroup[] {
  const map = new Map<string, string[]>()
  for (const t of tasks) {
    const existing = map.get(t.project)
    if (existing) {
      existing.push(t.task)
    } else {
      map.set(t.project, [t.task])
    }
  }
  const result: ProjectGroup[] = []
  for (const [project, taskList] of map) {
    result.push({ project, tasks: taskList.join(' ::: ') })
  }
  return result
}
