# FreeCampus Course Structure Check

Define and validate the minimum source structure for a **FreeCampus Community
Course** or **journey** built with [Quarto](https://quarto.org/). This repository
contains the structure contract, copyable starters, and a GitHub Action that
reports missing or inconsistent source files with actionable diagnostics.

The educational hierarchy follows the
[FreeCampus Course Author Guide](https://freecampus.org/course-author-guide/):

- A **journey** groups two or more courses in one repository. One course may stand alone.
- Every **course** has one or more milestones.
- Every **milestone** has one or more units **and a milestone challenge**.
- Every **unit** has one or more lessons **and a unit challenge**.
- Lessons use appropriate understanding checks; a separate lesson challenge is
  not required.

These are ungraded community learning materials. Challenges are required parts
of the structure, not graded examinations or pass gates.

**Scope:** this README proposes concrete folder and metadata conventions for
that hierarchy (schema version 1). The author guide defines the educational
requirements but does not prescribe a folder layout. The existing
[Python repository](https://github.com/freecampus/python) informed the Quarto/QMD
approach; its older course/unit layout is not a compliant example of this new
contract. This change does not migrate that repository.

## Start a course repository

Copy the **contents** of [templates/course](templates/course) into a new
repository for a standalone course, or copy
[templates/journey](templates/journey) for a journey. Do not copy this action
repository's `src/`, `dist/`, `node_modules/`, or CI workflow into a course.

1. Replace the sample titles, content, and stable folder IDs. The journey starter
   contains two deliberately small example courses; give real courses distinct
   outcomes and content before publishing.
2. Keep the required hierarchy and update `docs/_quarto.yml` when changing paths.
3. Update the repository README with audience, prerequisites, outcomes, learning
   order, preview/build instructions, contribution guidance, and license details.
4. Choose appropriate open-content terms for your additions. Preserve all required
   license and attribution notices for reused material. The checker only verifies
   that a license file exists; it does not determine license compatibility.
5. Install Quarto, then preview and render from the course repository root:

   ```sh
   quarto preview docs
   quarto render docs
   ```

6. Add the [consumer validation workflow](#use-the-github-action). Run rendering
   and any subject-specific tests as separate checks.

The starters need no Python package, notebook engine, database, or theme to render.
They deliberately contain no progress-tracking code. If you add browser-local
tracking, explain that it stays in the same browser and profile on the same
device, does not synchronize, and may be lost when site data is cleared or a
private session ends. Do not imply that the separate App restores this progress.

## Minimum layout

Paths below are relative to the **course repository root**, not this action
repository. `docs/` is the default Quarto source directory; use `content-dir` to
select another directory, including `.`. Use the same layout for a single course
and for each course in a journey.

| Required path                                                                        | Purpose                                                                     |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `README.md`                                                                          | Contributor-facing introduction, setup, authoring, and licensing guidance.  |
| `LICENSE`, `LICENSE.md`, or `LICENSE.txt`                                            | Nonempty license notice; at least one is required.                          |
| `docs/_quarto.yml`                                                                   | Website configuration, explicit sidebar navigation, and schema declaration. |
| `docs/index.qmd`                                                                     | Learner-facing course or journey home, with suggested learning order.       |
| `docs/courses/<course-id>/index.qmd`                                                 | Course audience, prerequisites, outcomes, and milestone sequence.           |
| `docs/courses/<course-id>/milestones/<milestone-id>/index.qmd`                       | Milestone goal and unit sequence.                                           |
| `docs/courses/<course-id>/milestones/<milestone-id>/challenge.qmd`                   | Required milestone challenge, integrating its units.                        |
| `docs/courses/<course-id>/milestones/<milestone-id>/units/<unit-id>/index.qmd`       | Unit overview and lesson sequence.                                          |
| `docs/courses/<course-id>/milestones/<milestone-id>/units/<unit-id>/<lesson-id>.qmd` | At least one lesson directly inside each unit.                              |
| `docs/courses/<course-id>/milestones/<milestone-id>/units/<unit-id>/challenge.qmd`   | Required unit challenge, integrating its lessons.                           |

For example, one complete course contains these source files:

```text
README.md
LICENSE
docs/_quarto.yml
docs/index.qmd
docs/courses/first-steps/index.qmd
docs/courses/first-steps/milestones/observe-data/index.qmd
docs/courses/first-steps/milestones/observe-data/challenge.qmd
docs/courses/first-steps/milestones/observe-data/units/observations/index.qmd
docs/courses/first-steps/milestones/observe-data/units/observations/notice-patterns.qmd
docs/courses/first-steps/milestones/observe-data/units/observations/challenge.qmd
```

For a journey, add at least a second `docs/courses/<course-id>/` with the same
complete structure and set `freecampus.kind: journey`. The repository's website
home is the journey home; a redundant `journeys/<id>/` layer is unnecessary.
A standalone repository uses `freecampus.kind: course` and exactly one course
directory. Its website home can briefly link to the course overview; do not
duplicate the full introduction.

### Names, identity, and discovery

- Course, milestone, unit, and lesson IDs use lowercase kebab-case: `first-steps`,
  `observe-data`, `notice-patterns`. Numbers are allowed. Display titles may be
  translated and need not match the IDs.
- Folder paths identify ownership. IDs need only be unique among siblings.
  Keep paths stable once published; coordinate URL and progress migrations when
  moving content.
- Every ordinary direct child directory of `courses/`, `milestones/`, or `units/`
  is treated as an educational item and must be complete. There is no draft bypass.
  Keep planning material outside these collections, or in `_drafts/`.
- Direct unit `.qmd` files other than `index.qmd`, `challenge.qmd`, and files
  beginning with `_` or `.` count as lessons. `lessons/` is not a second required
  directory layer. Do not put unrelated resource QMDs directly beside lessons.
- Dot/underscore directories are ignored during item discovery. The checker does
  not recursively scan unrelated assets, caches, notebooks, or dependencies.
- Checked files must be readable UTF-8, nonempty, regular files up to 1 MiB each.
  Source symlinks are rejected. Keep large data and binary assets in separate files.

## Quarto configuration

The smallest configuration for the example above is:

```yaml
project:
  type: website

freecampus:
  schema-version: 1
  kind: course

website:
  title: First Steps
  sidebar:
    contents:
      - index.qmd
      - courses/first-steps/index.qmd
      - courses/first-steps/milestones/observe-data/index.qmd
      - courses/first-steps/milestones/observe-data/units/observations/index.qmd
      - courses/first-steps/milestones/observe-data/units/observations/notice-patterns.qmd
      - courses/first-steps/milestones/observe-data/units/observations/challenge.qmd
      - courses/first-steps/milestones/observe-data/challenge.qmd

format: html

execute:
  eval: false
```

`freecampus` is custom project metadata for this checker, not a Quarto plugin.
`schema-version` must be the integer `1`. The checker requires `project.type:
website`, a nonempty `website.title`, and HTML output (`format: html` or a
`format.html` mapping entry). `execute.eval: false` is a starter choice, not a
requirement; enable computation where the course needs it.

Use `website.sidebar` to list **every required page**, including the website home,
course/milestone/unit overviews, lessons, and both kinds of challenge. Nested
sections, sidebar arrays, string paths, `href` entries, and a QMD-valued `section`
are supported:

```yaml
sidebar:
  contents:
    - href: index.qmd
      text: Start here
    - section: courses/first-steps/milestones/observe-data/index.qmd
      contents:
        - courses/first-steps/milestones/observe-data/units/observations/index.qmd
        # Include the remaining lessons and challenges here as well.
```

Sidebar paths are relative to the Quarto source directory and use `/`. Use source
`.qmd` paths rather than output `.html` links. Fragments and query strings are
ignored when checking source existence. HTTP(S), email, and fragment-only links
are allowed but do not satisfy the requirement to list a local page. Additional
local QMD pages listed in the sidebar are checked for existence and page validity.

Schema 1 intentionally requires **explicit navigation**: automatic discovery,
wildcards, parent-relative paths, and site-root-relative paths are unsupported in
the checked sidebar. A navbar link alone does not satisfy sidebar coverage.
The order should guide learners from overviews through lessons and unit challenges
to the milestone challenge; educational order is reviewed by people, not inferred
from filenames by this checker.

Keep the checked configuration in `_quarto.yml`. The validator does not merge
Quarto profiles, `metadata-files`, or directory `_metadata.yml` inheritance.
Those files may still supply optional styling and execution settings. A later
book/PDF profile should reuse these QMD sources rather than duplicate the course.

## QMD pages and teaching expectations

Every checked QMD needs a nonempty front-matter `title` **or a Markdown heading**,
plus nonempty body content. YAML front matter, when present, must be a valid
mapping enclosed by `---` (a closing `...` is also supported). Duplicate keys,
unknown YAML tags, and excessive alias expansion are reported. For example:

```markdown
---
title: Notice Patterns
---

Describe a small observation and show how to distinguish it from an assumption.

## Try it

Write one observation and one question that needs more evidence.

## Check your understanding

Explain why an arrival time alone cannot tell you whether two people are friends.
```

Authors should include the following; these are **human review expectations**, not
claims about semantic checks performed by this action:

| Page                | Expected teaching content                                                            |
| ------------------- | ------------------------------------------------------------------------------------ |
| Journey home        | Purpose, course list, prerequisites, and suggested order.                            |
| Course overview     | Audience, prerequisites, outcomes, milestones, and ungraded learning expectations.   |
| Milestone overview  | Integrated outcome and how the units prepare learners for its challenge.             |
| Unit overview       | Focused outcome, lesson order, prerequisites, and realistic effort estimate.         |
| Lesson              | Explanation, example, practice, and appropriate feedback or understanding checks.    |
| Unit challenge      | Task combining the unit's lessons, instructions, and useful self-review guidance.    |
| Milestone challenge | Task combining the milestone's units, instructions, and useful self-review guidance. |

Use quizzes, puzzles, reflection, notebooks, or Colab where useful. Lessons need
not all use the same activity type. Keep reading and navigation usable on phones;
identify activities requiring a computer or an external tool. Do not promise
instructor grading, individual review, certificates, or synchronized progress.
Community contributions are unpaid volunteering; separately contracted App work
does not create automatic compensation or royalties for community contributions.

Optional additions include `_metadata.yml`, shared `_includes/`, `_brand.yml`,
stylesheets, images, bibliographies, notebooks, data, translations, dependency
files, PDF/ebook build profiles, and deployment workflows. They do not replace
the required source hierarchy. A Python `pyproject.toml`, Conda environment,
Poetry, or a specific theme is not mandatory for a non-programming course.

## Use the GitHub Action

**Release status:** the first release and Marketplace listing are prepared by
this repository, not created merely by adding this workflow. The `v1` example
below becomes usable after maintainers publish the initial release and tag.
Before then, test with a reviewed commit SHA from the PR branch.

Save this as `.github/workflows/course-structure.yml` in the **consumer course
repository**:

```yaml
name: Course structure
on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  structure:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          persist-credentials: false
      - name: Validate FreeCampus sources
        id: structure
        uses: freecampus/freecampus-course-check@v1
```

For reproducible use, replace `v1` with the full reviewed release commit SHA.
The Action uses the runner's Node.js 24 runtime and the committed bundle; consumers
do **not** need `npm install`, `setup-node`, Python, or Quarto to run this check.
Use a GitHub-hosted runner or a self-hosted runner supporting Node 24 actions.
CI exercises Linux, macOS, and Windows.

| Input         | Default | Meaning                                                                   |
| ------------- | ------- | ------------------------------------------------------------------------- |
| `path`        | `.`     | Checked-out course repository directory, relative to `GITHUB_WORKSPACE`.  |
| `content-dir` | `docs`  | Quarto source directory relative to `path`, including `.` if appropriate. |

The action checks the **consumer checkout**, not its own repository. A monorepo
can invoke it once per independently configured course/journey project:

```yaml
- uses: freecampus/freecampus-course-check@v1
  with:
    path: education/data-journey
    content-dir: content
```

Both paths must remain inside the checked-out workspace/project. Inputs are read
as strings, never interpolated into shell commands. The checker does not request
a token, access the network, render Quarto, execute code cells, or run repository
hooks. Use `pull_request`, not a privileged workflow that executes untrusted PR
code. Rendering belongs in a separately configured job.

| Output         | Meaning                                                              |
| -------------- | -------------------------------------------------------------------- |
| `valid`        | `true` if no validation errors were found; otherwise `false`.        |
| `error-count`  | Total diagnostics; written on both successful and failed validation. |
| `course-count` | Number of course directories discovered.                             |

Validation errors fail the step with exit code `1`. Invocation or runtime failures
use exit code `2`. Successful checks return `0`. Each error appears in the job log
and as a GitHub annotation with a path, rule code, line where available, explanation,
and suggested fix. A job summary lists the findings and item counts. GitHub may
limit displayed annotations; the job log retains the full list. Very large summaries
are truncated with a pointer to that log.

Example diagnostic:

```text
[FC002] docs/courses/first-steps/milestones/observe-data/challenge.qmd:1
Cannot read required file (ENOENT).
Fix: Create this file as UTF-8 text and ensure it is readable.
```

### Diagnostic reference

| Code    | Meaning and typical correction                                                                  |
| ------- | ----------------------------------------------------------------------------------------------- |
| `FC000` | Invocation/runtime error: check inputs and permissions, or report the failure.                  |
| `FC001` | Unsafe path or symlink: use regular source paths inside the selected checkout.                  |
| `FC002` | Missing, unreadable, oversized, non-text file, or missing directory: create/fix the named path. |
| `FC003` | Empty file or page body: add meaningful content.                                                |
| `FC004` | Invalid YAML: fix syntax, mapping type, duplicate keys, tags, or aliases at the reported line.  |
| `FC005` | Unclosed front matter: add a closing delimiter.                                                 |
| `FC006` | Missing page title: add a YAML title or Markdown heading.                                       |
| `FC007` | Invalid educational ID: use lowercase kebab-case.                                               |
| `FC008` | Empty course/milestone/unit collection: add at least one complete child item.                   |
| `FC009` | Missing website configuration: set website project type, title, and HTML format.                |
| `FC010` | Invalid schema/kind or course count: use version 1 and the correct course/journey kind.         |
| `FC011` | Legacy course-level `units/`: place units inside milestones and update links.                   |
| `FC012` | No unit lesson: add a non-reserved `.qmd` directly in the unit.                                 |
| `FC013` | Unsupported sidebar shape/path: list explicit, relative `.qmd` source links.                    |
| `FC014` | Required page missing from sidebar: add it in the learner's sequence.                           |

Checks accumulate independent failures, rather than stopping at the first missing
file. Fixing a missing directory may resolve several related diagnostics.

### What passing does not prove

This is a minimum **source structure** check, not Quarto's complete schema validator
or a teaching-quality assessment. It does not validate page-body links, assets,
external URLs, notebook execution, license compatibility, accessibility, factual
accuracy, or the quality/completeness of practice and feedback. It does not enforce
specific English headings, word counts, grades, or progress implementation.

Quarto profiles, includes, rendering exclusions, and other advanced settings can
change the final output. Run `quarto render` and inspect the built site separately;
a listed source file is not proof that every publication profile renders it.

## Migrate an existing course

For a repository using `docs/courses/<course>/units/<unit>/`:

1. Decide how its units group into meaningful milestones.
2. Move each unit into `milestones/<milestone-id>/units/<unit-id>/` under its course.
3. Add each milestone's overview and integrated challenge. Keep each unit's
   overview, lessons, and required unit challenge.
4. Set the schema metadata and use `kind: journey` for multiple courses.
5. Update sidebar entries, relative links, notebook generators, catalog metadata,
   PDF builds, tests, and any existing progress IDs affected by the move.
6. Review published URLs and progress compatibility with maintainers. Do not
   silently reorganize a live course merely to satisfy the checker.
7. Run this check, render the site, and review the learning sequence and content.

## Maintain and test the action

Maintainers need Node.js 24 and npm:

```sh
npm ci
npm run verify
```

The test suite covers both starters, missing hierarchy/challenges/lessons, YAML,
navigation, path containment, symlinks, diagnostics, outputs, and bundled execution.
`npm run build` bundles `src/entry.js` and the YAML parser into `dist/index.cjs` and
copies the parser's license. Commit **both source and rebuilt `dist/`**. CI checks
bundle reproducibility, invokes the actual Action, and renders both templates with
Quarto 1.8.27. Dependency updates require rebuilding the bundle too.

To check a local course without installing the action's development dependencies,
use Node 24 and the checked-in bundle:

```sh
node /path/to/freecampus-course-check/dist/index.cjs /path/to/course
node /path/to/freecampus-course-check/dist/index.cjs /path/to/course --content-dir content
```

Implementation layout:

| Path                          | Responsibility                                                        |
| ----------------------------- | --------------------------------------------------------------------- |
| `action.yml`                  | Single root Marketplace action metadata and public inputs/outputs.    |
| `src/check.js`                | Read-only source validation and diagnostics.                          |
| `src/main.js`, `src/entry.js` | CLI/action inputs, annotations, outputs, summary, and exit codes.     |
| `scripts/build.js`, `dist/`   | Reproducible runtime packaging; consumers need no install step.       |
| `templates/`                  | Copyable source starters and integration fixtures.                    |
| `tests/`                      | Contract and runtime regression tests.                                |
| `.github/workflows/ci.yml`    | Cross-platform tests, bundle verification, and real Quarto rendering. |

## Publish to GitHub Marketplace

Publishing is a maintainer operation **after review and merge**; this PR does not
publish a release, create a `v1` tag, or accept Marketplace terms.

1. Keep this repository public and dedicated to this single action. The templates
   are examples and test fixtures for the action. Preserve the root `action.yml`,
   BSD-3-Clause license, README, and committed runtime bundle.
2. Confirm all CI jobs pass on the intended release commit and verify the action
   name is available. GitHub checks Marketplace naming requirements at publication.
3. Review [GitHub's publishing requirements](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace).
   An authorized owner must accept the Marketplace Developer Agreement if it has
   not already been accepted.
4. Set the package version to `1.0.0` for the initial stable release, update its
   lockfile, rebuild, and merge that release preparation if needed. Create a release
   tagged `v1.0.0` from the tested commit. Select **Publish this Action to the GitHub
   Marketplace**, choose an appropriate category, and publish the release.
5. Create the convenience `v1` tag at the same reviewed release commit. Move only
   that major tag for compatible releases; retain immutable full-version tags.
6. Verify a separate consumer repository can run the pinned release. Update the
   release-status notice above once the version and Marketplace listing exist.

Use semantic versioning. Tightening the minimum structure can break existing course
repositories; reserve incompatible contract changes for a new schema/action major
version with migration guidance. Review security and compatibility fixes before
moving a major tag.

## License and references

The action and included starter examples use [BSD-3-Clause](LICENSE). The bundled
YAML parser retains its ISC license in [dist/yaml-LICENSE](dist/yaml-LICENSE).
Course authors remain responsible for the licenses and credit of their own content.

- [FreeCampus Course Author Guide](https://freecampus.org/course-author-guide/)
- [Quarto website navigation](https://quarto.org/docs/websites/website-navigation.html)
- [Quarto project basics](https://quarto.org/docs/projects/quarto-projects.html)
- [GitHub action metadata](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax)
