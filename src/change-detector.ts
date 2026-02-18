/**
 * Source-based change detection using git diff.
 * Filters out tasks whose source files haven't changed since a base ref.
 */

import * as core from '@actions/core'
import * as exec from '@actions/exec'
import type { ParsedTask } from './task-parser.js'

/**
 * Filter tasks to only those whose sources overlap with changed files.
 *
 * For each task with non-empty sources:
 * - Build git pathspecs: ":(glob)project/glob" for monorepo, ":(glob)glob" for root
 * - Run `git diff --quiet <baseRef> HEAD -- <pathspecs>`
 * - Exit 0 → no changes → skip task
 * - Exit 1 → changes found → keep task
 * - Any other error → keep task (fail-open)
 *
 * Tasks with empty sources always pass through (no way to determine if changed).
 */
export async function filterByChangedSources(
  tasks: ParsedTask[],
  baseRef: string
): Promise<ParsedTask[]> {
  core.info(`Filtering tasks by changes since ${baseRef}...`)

  const result: ParsedTask[] = []

  for (const task of tasks) {
    if (task.sources.length === 0) {
      core.info(`  ${task.task}: no sources, included`)
      result.push(task)
      continue
    }

    const pathspecs = task.sources.map((glob) => {
      if (task.project === '.') {
        return `:(glob)${glob}`
      }
      return `:(glob)${task.project}/${glob}`
    })

    const args = ['diff', '--quiet', baseRef, 'HEAD', '--', ...pathspecs]

    try {
      const exitCode = await exec.exec('git', args, {
        ignoreReturnCode: true,
        silent: true,
      })

      if (exitCode === 0) {
        core.info(`  ${task.task}: unchanged, skipped`)
      } else {
        // Exit code 1 = changes found, any other code = error (fail-open)
        core.info(`  ${task.task}: changed, included`)
        result.push(task)
      }
    } catch {
      // exec threw (e.g., git not found) — fail-open
      core.warning(`  ${task.task}: git diff failed, included (fail-open)`)
      result.push(task)
    }
  }

  return result
}
