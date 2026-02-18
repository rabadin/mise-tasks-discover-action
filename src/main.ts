/**
 * Main orchestration for mise-tasks-discover.
 * Gets inputs, runs mise, parses/filters/groups tasks, sets outputs.
 */

import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { parseMiseTasks, filterByPrefix, groupByProject } from './task-parser.js'
import { filterByChangedSources } from './change-detector.js'
import type { MiseTask } from './task-parser.js'

/**
 * Execute `mise tasks ls --all --json` and return the parsed JSON array.
 * Returns an empty array if mise fails (e.g., no mise.toml found).
 */
export async function execMiseTasksLs(): Promise<MiseTask[]> {
  let stdout = ''

  const exitCode = await exec.exec('mise', ['tasks', 'ls', '--all', '--json'], {
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString()
      },
    },
  })

  if (exitCode !== 0) {
    core.warning('mise tasks ls failed, returning empty task list')
    return []
  }

  try {
    return JSON.parse(stdout) as MiseTask[]
  } catch {
    core.warning('Failed to parse mise tasks ls output as JSON')
    return []
  }
}

export async function run(): Promise<void> {
  try {
    const prefix = core.getInput('task-prefix')
    const baseRef = core.getInput('base-ref')

    const raw = await execMiseTasksLs()
    const parsed = parseMiseTasks(raw)
    const matched = filterByPrefix(parsed, prefix)

    const filtered = baseRef
      ? await filterByChangedSources(matched, baseRef)
      : matched

    const projects = groupByProject(filtered)
    core.setOutput('projects', JSON.stringify(projects))

    const count = projects.length
    core.info(`Discovered ${count} project(s) matching '${prefix}*':`)
    for (const p of projects) {
      core.info(`  ${p.project}: ${p.tasks}`)
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed('An unexpected error occurred')
    }
  }
}
