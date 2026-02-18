# mise-tasks-discover-action

A GitHub Action that discovers [mise](https://mise.jdx.dev/) tasks matching a given prefix, groups them by project, and outputs a JSON array. Supports monorepo task namespacing and source-based change detection.

## What it does

1. Runs `mise tasks ls --all --json` to discover all defined tasks
2. Parses task names, handling monorepo format (`//path:task`)
3. Filters tasks by a name prefix (e.g., `ci:build`, `ci:test`)
4. Optionally filters out tasks whose `sources` haven't changed since a base ref (using `git diff`)
5. Groups remaining tasks by project and outputs a JSON array

## Usage

```yaml
- name: Discover build tasks
  id: discover
  uses: rabadin/mise-tasks-discover-action@v1
  with:
    task-prefix: ci:build
    base-ref: ${{ github.event.pull_request.base.sha }}

- name: Use discovered tasks
  run: |
    echo "Projects: ${{ steps.discover.outputs.projects }}"
    # Example output:
    # [{"project":".","tasks":"ci:build ::: ci:build:docker"}]
```

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `task-prefix` | No | `""` | Task name prefix to filter on. Only tasks whose local name starts with this value are included. Examples: `ci:build`, `ci:test`, `""` (all tasks). |
| `base-ref` | No | `""` | Git ref to diff against for source-based filtering. Tasks whose `sources` don't overlap with changed files are excluded. Tasks without `sources` are always included. Leave empty to skip filtering. |

### Outputs

| Output | Description |
|--------|-------------|
| `projects` | JSON array. Each entry has `project` (path) and `tasks` (:::-separated task names usable directly with `mise run`). Empty array when no tasks match. |

## Output format

```json
[
  {
    "project": ".",
    "tasks": "ci:build ::: ci:build:docker"
  },
  {
    "project": "services/api",
    "tasks": "//services/api:ci:build ::: //services/api:ci:build:docker"
  }
]
```

- **`project`**: The config root path. `"."` for root-level tasks, or a subdirectory path for monorepo sub-projects.
- **`tasks`**: Space-and-triple-colon-separated task names, exactly as returned by `mise tasks ls`. These can be passed directly to `mise run`.

## Monorepo support

For repos using mise's monorepo mode (`experimental_monorepo_root = true`), tasks are automatically namespaced by their config root path:

```
//services/api:ci:build        -> project: "services/api"
//services/worker:ci:build     -> project: "services/worker"
//:ci:build                    -> project: "." (root)
ci:build                       -> project: "." (non-monorepo)
```

The action groups tasks by project, making it straightforward to build job matrices that run each project's tasks independently.

## Change detection

When `base-ref` is provided, the action uses `git diff --quiet` with pathspec globs to determine which tasks have changed sources. For each task:

- **No `sources` defined**: Always included (no way to determine if changed)
- **`sources` match changed files**: Included
- **`sources` don't match changed files**: Excluded
- **`git diff` fails**: Included (fail-open)

For monorepo tasks, source globs are automatically prefixed with the project path (e.g., `src/**` becomes `services/api/src/**`).

## Example: CI matrix

```yaml
jobs:
  plan:
    runs-on: ubuntu-latest
    outputs:
      build-projects: ${{ steps.discover-build.outputs.projects }}
    steps:
      - uses: actions/checkout@v4
      - id: discover-build
        uses: rabadin/mise-tasks-discover-action@v1
        with:
          task-prefix: ci:build
          base-ref: ${{ github.event.pull_request.base.sha }}

  build:
    needs: plan
    if: needs.plan.outputs.build-projects != '[]'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include: ${{ fromJson(needs.plan.outputs.build-projects) }}
    steps:
      - uses: actions/checkout@v4
      - uses: jdx/mise-action@v2
      - name: Build
        run: |
          while IFS= read -r task; do
            mise run "$task"
          done < <(echo "${{ matrix.tasks }}" | sed 's/ ::: /\n/g')
```

## Development

See [CLAUDE.md](./CLAUDE.md) for development setup, testing, and contribution guidelines.

## License

MIT
