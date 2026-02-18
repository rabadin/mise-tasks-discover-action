# mise-tasks-discover-action

GitHub Action that discovers mise tasks matching a prefix, with optional source-based change detection.

## Dev flow

### Prerequisites

- [mise](https://mise.jdx.dev/) installed (act is managed by mise)

### Setup

```bash
mise install      # installs node 20 + act
mise run install  # npm install
```

### Commands

```bash
mise run build            # bundle with ncc -> dist/index.js
mise run test             # unit tests with coverage
mise run test:integration # integration tests (real mise + git)
mise run test:act         # act-based end-to-end tests
mise run test:all         # all test layers
mise run lint             # type-check with tsc
mise run release          # tag + push patch release (use -- --minor or -- --major)
```

### Test layers

1. **Unit tests** (`mise run test`): Fast, all I/O mocked. Tests parsing logic, change detection, and main orchestration.
2. **Integration tests** (`mise run test:integration`): Runs real `mise tasks ls` and `git diff` against temp fixtures. Verifies actual mise JSON output parsing and git pathspec behavior.
3. **act tests** (`mise run test:act`): Runs the full action in a local GitHub Actions environment via act. Tests the composite action wiring (mise install, node execution, output propagation).

### Conventional commits

All commit messages **must** follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.

Examples:
```
feat: add monorepo task discovery
fix: handle empty sources array in change detection
test: add integration tests for git pathspecs
docs: update README with usage examples
```

### Release flow

```bash
mise run release              # patch bump (v1.0.0 -> v1.0.1)
mise run release -- --minor   # minor bump (v1.0.0 -> v1.1.0)
mise run release -- --major   # major bump (v1.0.0 -> v2.0.0)
```

The `release` task:
1. Detects the latest git tag
2. Bumps the version (patch by default)
3. Creates and pushes the new tag (e.g., `v1.2.3`)
4. Updates sliding tags (`v1.2`, `v1`) to point at the same commit

Consumers can pin to:
- `v1.2.3` -- exact version (most stable)
- `v1.2` -- latest patch in minor (recommended)
- `v1` -- latest minor in major (living on the edge)

### Building for release

The `dist/` directory is committed to the repo (required for GitHub Actions). After modifying source code:

```bash
mise run build
git add dist/
```

Always commit `dist/index.js` changes alongside source changes.
