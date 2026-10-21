# Troubleshooting course structure checks

Use the rule code in a failed **FreeCampus Course Structure Check** to find its
cause, correction, and examples below. The [README](README.md#minimum-layout)
defines the full source contract; this guide explains how to repair violations.

Each diagnostic includes a title, the affected path, the problem, a suggested fix,
and a **Help** URL to the matching section here. The path is repeated in the
message body so it remains visible in downloaded logs, not only GitHub annotations.
The job summary also contains clickable help links.

## Read the result

- On GitHub, paths are relative to `GITHUB_WORKSPACE`, including any `path` input
  prefix. Local CLI paths are relative to the selected course repository.
- A path ending in `:1` is usually a file/directory-level finding. It does not
  necessarily identify an incorrect first line. YAML syntax errors include the
  parser's line number, adjusted for QMD front matter.
- `error-count` counts reported diagnostics, not unique files or courses.
  Different problems can affect one file.
- Counts show what the checker **discovered in the expected hierarchy**. For
  example, zero lessons can mean that missing milestones prevented discovery of
  lessons still stored under the old layout. It does not prove the repository
  contains no lesson content.
- A missing/unreadable collection gets `FC002`, without an additional `FC008`
  claiming it is empty. A readable collection with no eligible child directories
  gets `FC008`. Both still fail validation.
- Exit `0` means the source check passed; exit `1` means structural errors;
  exit `2` means invocation/runtime failure. A pass does not replace Quarto
  rendering, link checks, accessibility checks, or teaching-content review.

Help URLs point to this guide on `main`. A workflow pinned to an older release
keeps that release's behavior until its action reference is updated. These
improved diagnostics need a release containing this change; release `0.1.0`
does not acquire them automatically.

## Start with the parent structure

For an existing repository that has course-level `units/` and no milestones:

1. Confirm `path` selects the intended checkout and `content-dir` selects its
   Quarto source directory. The default is `docs/`.
2. Set the schema metadata in `_quarto.yml`. A repository with multiple courses
   uses `kind: journey`; see [FC010](#fc010).
3. Group existing units into meaningful milestones, with an overview and
   integrated challenge for each milestone; see [FC011](#fc011).
4. Preserve each unit's overview, lessons, and challenge. Update relative links,
   includes, notebook generators, catalogs, tests, and any affected progress IDs.
5. List all required QMD sources in the sidebar, including the website home;
   see [FC014](#fc014).
6. Rerun the check, then render and review the website. Resolving a parent problem
   may reveal additional child-file issues that could not previously be checked.

Do not create empty placeholder milestones or remove real course content just
to turn a check green. A milestone must express a learning outcome and contain
units plus an ungraded milestone challenge. Coordinate changes to published URLs
and saved learner progress with maintainers.

## Rule index

| Code            | Problem                                       |
| --------------- | --------------------------------------------- |
| [FC000](#fc000) | Action setup or runtime error                 |
| [FC001](#fc001) | Invalid source path or symbolic link          |
| [FC002](#fc002) | Missing or unreadable source                  |
| [FC003](#fc003) | Empty source content                          |
| [FC004](#fc004) | Invalid YAML                                  |
| [FC005](#fc005) | Unclosed QMD front matter                     |
| [FC006](#fc006) | Missing page title                            |
| [FC007](#fc007) | Invalid course, milestone, unit, or lesson ID |
| [FC008](#fc008) | Empty learning collection                     |
| [FC009](#fc009) | Incomplete Quarto website configuration       |
| [FC010](#fc010) | Invalid schema or course/journey declaration  |
| [FC011](#fc011) | Legacy units need milestones                  |
| [FC012](#fc012) | Unit has no lessons                           |
| [FC013](#fc013) | Unsupported sidebar navigation                |
| [FC014](#fc014) | Required page is missing from the sidebar     |

## FC000

**Action setup or runtime error.** The checker could not complete a normal
validation run. Causes include an incorrect action `path`, an unknown CLI flag,
unwritable GitHub output/summary files, or an unexpected runtime failure.

Check out the consumer repository before running the action. If checkout uses
`path: learning`, give the checker the same path; `content-dir` is relative to it:

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      path: learning
      persist-credentials: false
  - uses: freecampus/freecampus-course-check@0.1.0
    with:
      path: learning
      content-dir: docs
```

The workflow above illustrates the inputs using an existing release. For the
improved messages, use a reviewed release/commit that contains this guide. Pin
actions to reviewed full commit SHAs in production workflows.

For local usage, run `node dist/index.cjs --help` with Node 24. If inputs and
permissions are correct, report the action version/commit and relevant logs in
an issue, with secrets removed. A runtime error uses exit code `2`.

## FC001

**Invalid source path or symbolic link.** `path` must select a directory inside
the checkout workspace; `content-dir` must stay inside that selected repository.
The checker also rejects symbolic links along checked source paths, even links
whose target is inside the repository.

Use `path: learning` and `content-dir: docs`, not an absolute path or `../outside`.
If `_quarto.yml` is in the repository root, use `content-dir: .`. Correct an
incorrect input rather than copying unrelated sources into the checkout. Replace
source symlinks with regular files/directories when adopting this contract.

## FC002

**Missing or unreadable source.** Read the **File** and **Problem** fields together.
The message identifies the file's role, such as a unit challenge or a milestone
collection belonging to a named course.

| Detail                  | Meaning                                                       | Correction                                                            |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `ENOENT`                | The expected file or directory is absent.                     | Create the required source, or correct a mistaken path/configuration. |
| `ENOTDIR`               | A path component expected to be a directory is a file.        | Inspect the named path and its parents; resolve the conflict.         |
| `EACCES` / `EPERM`      | The runner cannot read/traverse the path.                     | Fix read/traversal permissions; do not replace existing content.      |
| Not a regular text file | A directory or another object occupies a file path.           | Put the required regular file at that path.                           |
| Not valid UTF-8         | The source has invalid text encoding or contains binary data. | Save it as UTF-8; keep binary assets separate.                        |
| Over 1 MiB              | A checked source exceeds the size limit.                      | Move large data/images into assets referenced by the source.          |

For a missing `docs/courses/python-foundations/milestones/`, a complete small
milestone could use these paths (names are illustrative):

```text
docs/courses/python-foundations/milestones/everyday-data/index.qmd
docs/courses/python-foundations/milestones/everyday-data/challenge.qmd
docs/courses/python-foundations/milestones/everyday-data/units/values/index.qmd
docs/courses/python-foundations/milestones/everyday-data/units/values/explore-values.qmd
docs/courses/python-foundations/milestones/everyday-data/units/values/challenge.qmd
```

Give each page a title and meaningful body content and list it in the sidebar.
The milestone challenge combines its units; the unit challenge combines its
lessons. Both are ungraded and should include instructions and useful self-review
guidance. If existing units need moving, follow [FC011](#fc011).

Other common missing files:

- `README.md`: add contributor setup, authoring, and licensing guidance.
- `LICENSE`, `LICENSE.md`, or `LICENSE.txt`: add appropriate terms and retain
  required notices; this checker does not assess license compatibility.
- `_quarto.yml`: add the configuration shown under [FC009](#fc009) and [FC010](#fc010).
- A QMD named only in the sidebar: create the intended page or correct the stale
  sidebar entry. Do not remove a required learning page from navigation to hide it.

## FC003

**Empty source content.** A required file is empty/whitespace-only, or a QMD body
contains nothing except comments after its front matter. A title by itself in
front matter does not make a complete page.

Replace an empty scaffold with meaningful content for its role. For example:

```markdown
---
title: Observe Data
---

By the end of this milestone you will describe a small dataset using evidence.
Work through the Values unit, then use its ideas in the milestone challenge.
```

The checker only tests for nonempty content. Authors must still supply accurate,
useful explanations, practice, and feedback.

## FC004

**Invalid YAML.** `_quarto.yml` and QMD front matter must be YAML mappings with
unique keys. Syntax errors, duplicate keys, unknown tags, scalar/list documents,
and excessive alias expansion all cause this diagnostic.

Inspect the reported line, including the preceding line for an unclosed quote or
bracket. Use spaces for indentation. Quote titles containing a colon followed by
a space. This header is valid:

```yaml
title: 'Values: observe and explain'
description: Compare an observation with an assumption.
```

For duplicate keys, merge settings into one mapping rather than declaring, for
example, `website:` twice. Use ordinary YAML data instead of executable custom
tags. Simplify recursive or excessive aliases; the checker limits expansion.

## FC005

**Unclosed QMD front matter.** The page begins with `---` but its YAML header has
no closing delimiter. Put a closing `---` (or `...`) on a line of its own, before
the Markdown body:

```markdown
---
title: Explore Values
---

Start by predicting what each value represents.
```

## FC006

**Missing page title.** Add a nonempty YAML `title` or a Markdown heading outside
comments/code fences. Either of these is supported:

```markdown
---
title: Explore Values
---

Compare these observations before reading the explanation.
```

```markdown
# Explore Values

Compare these observations before reading the explanation.
```

The checker reads the page itself. A title inherited only from `_metadata.yml`
does not satisfy this source check.

## FC007

**Invalid course, milestone, unit, or lesson ID.** IDs are directory names and
lesson filename stems. Use lowercase letters, digits, and single separating
hyphens: `everyday-data`, `unit-1`, `explore-values.qmd`.

For example, change `Everyday_Data/` to `everyday-data/`. Avoid spaces, uppercase
letters, underscores, and leading/trailing/doubled hyphens. The page's display
title can still use normal capitalization and other languages. Update references
to renamed paths and review published URL/progress compatibility before moving them.

## FC008

**Empty learning collection.** The collection directory exists and is readable,
but contains no eligible direct child directories. Every `courses/` needs a
course; every course's `milestones/` needs a milestone; every milestone's `units/`
needs a unit.

For example, `milestones/overview.qmd` alone is not a milestone. Add a directory
such as `milestones/everyday-data/`, with its `index.qmd`, `challenge.qmd`, and
`units/` content as illustrated under [FC002](#fc002).

Names beginning with `.` or `_` are excluded from collection discovery. A
`.gitkeep` file or `_drafts/` directory does not satisfy the minimum. When the
collection cannot be read at all, resolve [FC002](#fc002) first.

## FC009

**Incomplete Quarto website configuration.** In the selected source directory's
`_quarto.yml`, declare a website project, a nonempty website title, and HTML output:

```yaml
project:
  type: website
website:
  title: Python Journey
format: html
```

You can instead use `format: { html: { toc: true } }`. This is a partial example;
you also need [schema metadata](#fc010), [sidebar navigation](#fc014), and the
required source hierarchy. A book/PDF profile can be added separately, reusing
the QMD content. The checker does not merge profiles or inherited metadata.

## FC010

**Invalid schema or course/journey declaration.** Set this top-level mapping in
`_quarto.yml`, beside `project` and `website`:

```yaml
freecampus:
  schema-version: 1
  kind: journey
```

Use `kind: course` for exactly one course directory. Use `kind: journey` for two
or more. For the Python repository's six courses, `journey` is the appropriate
declaration. The diagnostic uses the number of discovered course directories
to suggest a kind; it does not judge whether those courses are complete.

`schema-version` is the **integer** `1`, not the string `"1"`, a release number
such as `0.1.0`, or `v1`. Do not nest `freecampus` under `website`. If the mapping
already exists, edit it rather than adding a duplicate key.

With zero discovered courses, check `content-dir` and the `courses/` hierarchy
first. Changing the kind alone does not fix missing courses, milestones, or
challenges.

## FC011

**Legacy units need milestones.** Units directly under a course's `units/`
directory bypass the required milestone layer. Choose meaningful milestone
outcomes, then move each existing unit beneath the appropriate milestone.

| Before                                                            | After (example)                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `docs/courses/python-foundations/units/values/index.qmd`          | `docs/courses/python-foundations/milestones/everyday-data/units/values/index.qmd`          |
| `docs/courses/python-foundations/units/values/explore-values.qmd` | `docs/courses/python-foundations/milestones/everyday-data/units/values/explore-values.qmd` |
| `docs/courses/python-foundations/units/values/challenge.qmd`      | `docs/courses/python-foundations/milestones/everyday-data/units/values/challenge.qmd`      |

Also add `milestones/everyday-data/index.qmd` and
`milestones/everyday-data/challenge.qmd` within that course. The milestone
challenge integrates its units; it does not replace their individual challenges.

Update the sidebar, relative includes/links, catalog and outcome metadata,
notebook paths/generators, ebook builds, tests, and any affected progress IDs.
Remove the obsolete course-level `units/` directory once its contents and
references have been migrated. Do not duplicate all teaching content or invent
empty milestones. Coordinate any published URL/progress migration with maintainers.

The checker also requires milestones for courses using other legacy layouts,
even when they produce `FC002` rather than this specific legacy-path diagnostic.

## FC012

**Unit has no lessons.** At least one lesson `.qmd` must be directly beside the
unit's `index.qmd` and `challenge.qmd`:

```text
units/values/index.qmd
units/values/explore-values.qmd
units/values/challenge.qmd
```

`index.qmd` and `challenge.qmd` are not lessons. Dot/underscore-prefixed files are
excluded, and a nested `lessons/` directory is not scanned. Add a real lesson or
move existing lessons into the unit, updating their links and sidebar entries.

## FC013

**Unsupported sidebar navigation.** Schema 1 requires explicit local QMD paths
under `website.sidebar`. Local paths are relative to the Quarto source directory,
use `/`, and end in `.qmd`. Do not use absolute/parent-relative paths, output HTML,
globs, or `auto` discovery in the checked sidebar.

| Unsupported local entry                           | Correction                                              |
| ------------------------------------------------- | ------------------------------------------------------- |
| `docs/index.qmd` when the project root is `docs/` | `index.qmd` (otherwise the wrong path leads to `FC002`) |
| `/index.qmd` or `../index.qmd`                    | `index.qmd`                                             |
| `index.html`                                      | `index.qmd`                                             |
| `auto: "**/*.qmd"`                                | List each required QMD source explicitly.               |
| `contents: index.qmd`                             | Use a list: `contents: [index.qmd]`.                    |

String paths, `href` entries, nested `section`/`contents`, and arrays of sidebars
are supported. HTTP(S), email, and fragment-only links are allowed but cannot
stand in for local learning pages. See the nested example under [FC014](#fc014).

## FC014

**Required page is missing from the sidebar.** A page can exist and be linked from
the navbar or another page while still being absent from `website.sidebar`.
Add its exact source path to the appropriate sidebar section in `_quarto.yml`.

For a missing website home, add `index.qmd` to an existing sidebar's `contents`.
Do not replace the rest of the navigation or add a second `website:` key. This
example lists a complete small course, including both required challenges:

```yaml
website:
  title: First Steps
  sidebar:
    contents:
      - href: index.qmd
        text: Start here
      - courses/first-steps/index.qmd
      - section: courses/first-steps/milestones/observe-data/index.qmd
        contents:
          - section: courses/first-steps/milestones/observe-data/units/observations/index.qmd
            contents:
              - courses/first-steps/milestones/observe-data/units/observations/notice-patterns.qmd
              - courses/first-steps/milestones/observe-data/units/observations/challenge.qmd
          - courses/first-steps/milestones/observe-data/challenge.qmd
```

This fragment matches [templates/course](templates/course). Combine it with the
other required settings from that template. All courses in a journey need their
own complete navigation. Use `.qmd` source paths, not `.html` output links, and
verify the resulting learning order after rendering.
