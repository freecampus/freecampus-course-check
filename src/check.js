import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const mapping = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) =>
  typeof value === 'string' && value.trim().length > 0;
const slash = (value) => value.split(path.sep).join('/');
const describe = (value) => {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'a mapping';
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
};
const pageFixes = {
  'website home':
    'Create index.qmd with a title and an introduction linking to the course(s), then list it in website.sidebar.',
  'course overview':
    'Create index.qmd with the course audience, prerequisites, outcomes, and milestone sequence; list it in website.sidebar.',
  'milestone overview':
    'Create index.qmd explaining the milestone outcome and unit sequence; list it in website.sidebar.',
  'milestone challenge':
    'Create challenge.qmd with an ungraded task combining the milestone units, instructions, and self-review guidance; list it in website.sidebar.',
  'unit overview':
    'Create index.qmd with the unit outcome and lesson sequence; list it in website.sidebar.',
  'unit challenge':
    'Create challenge.qmd with an ungraded task combining the unit lessons, instructions, and self-review guidance; list it in website.sidebar.',
  lesson:
    'Create this .qmd lesson with a title, explanation, practice, and feedback; list it in website.sidebar.',
};
export const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
};

/** Read source data only: no Quarto, code blocks, hooks, or repository scripts execute. */
export function check(root, contentDir = 'docs') {
  root = path.resolve(root);
  const errors = [];
  const counts = { courses: 0, milestones: 0, units: 0, lessons: 0 };
  const requiredPages = new Set();
  const checkedPages = new Set();
  const add = (code, file, message, fix, line = 1) => {
    errors.push({
      code,
      file: slash(path.relative(root, file)) || '.',
      line,
      message,
      fix,
    });
  };

  // Reject symlinks at every component, including internal ones, and never follow them.
  function safe(file) {
    if (!inside(root, file)) {
      add(
        'FC001',
        root,
        'A source path escapes the selected repository.',
        'Use a relative path inside the repository.',
      );
      return false;
    }
    let current = root;
    const parts = path.relative(root, file).split(path.sep).filter(Boolean);
    for (const part of ['', ...parts]) {
      if (part) current = path.join(current, part);
      try {
        if (fs.lstatSync(current).isSymbolicLink()) {
          add(
            'FC001',
            current,
            'Symbolic links are not supported for checked source files or directories.',
            'Replace the link with a regular file or directory.',
          );
          return false;
        }
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return true;
        add(
          'FC002',
          current,
          `Cannot inspect path (${error.code}).`,
          'Check file permissions and retry.',
        );
        return false;
      }
    }
    return true;
  }

  function readFailure(error, file, label, missingFix) {
    let message = `Cannot read ${label} (${error.code || 'unknown error'}).`;
    let fix = 'Check this path and file permissions, then rerun the action.';
    if (error.code === 'ENOENT') {
      message = `Missing ${label} (ENOENT).`;
      fix = missingFix;
    } else if (error.code === 'ENOTDIR') {
      message = `Cannot read ${label}: an expected directory is a file (ENOTDIR).`;
      fix =
        'Check this path and each parent component; replace the conflicting file with the required directory.';
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      message = `Access denied while reading ${label} (${error.code}).`;
      fix =
        'Allow the runner to read this source and traverse its parent directories. Do not replace existing content.';
    } else if (error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') {
      message = `The ${label} is not valid UTF-8 text.`;
      fix =
        'Save this source as UTF-8 text; keep binary assets in separate files.';
    }
    add('FC002', file, message, fix);
  }

  function read(
    file,
    label = 'required source file',
    missingFix = 'Create this file as UTF-8 text and ensure it is readable.',
  ) {
    if (!safe(file)) return null;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) {
        add(
          'FC002',
          file,
          `The ${label} must be a regular UTF-8 text file; this path is not a file.`,
          'Replace this path with the required file.',
        );
        return null;
      }
      if (stat.size > 1024 * 1024) {
        add(
          'FC002',
          file,
          'Source file exceeds the 1 MiB validation limit.',
          'Move large data or embedded images into separate assets.',
        );
        return null;
      }
      const text = new TextDecoder('utf-8', { fatal: true })
        .decode(fs.readFileSync(file))
        .replace(/^\uFEFF/, '');
      if (!text.trim())
        add(
          'FC003',
          file,
          'Required file is empty.',
          'Add meaningful source content.',
        );
      return text;
    } catch (error) {
      readFailure(error, file, label, missingFix);
      return null;
    }
  }

  function yaml(text, file, offset = 0) {
    try {
      const document = parseDocument(text, { uniqueKeys: true });
      const problems = [...document.errors, ...document.warnings];
      if (problems.length) {
        for (const issue of problems) {
          add(
            'FC004',
            file,
            issue.message,
            'Fix the YAML at this location; use unique keys and standard YAML values.',
            (issue.linePos?.[0]?.line || 1) + offset,
          );
        }
        return null;
      }
      const value = document.toJS({ maxAliasCount: 50 });
      if (!mapping(value)) {
        add(
          'FC004',
          file,
          'Expected a YAML mapping.',
          'Use named keys such as title: My course.',
          offset + 1,
        );
        return null;
      }
      return value;
    } catch (error) {
      add(
        'FC004',
        file,
        `Cannot parse YAML: ${error.message}`,
        'Remove recursive or excessively expanded aliases and correct the YAML.',
        offset + 1,
      );
      return null;
    }
  }

  function page(file, role = 'sidebar page') {
    requiredPages.add(file);
    if (checkedPages.has(file)) return;
    checkedPages.add(file);
    const text = read(
      file,
      role,
      pageFixes[role] ||
        'Create the .qmd page named by this sidebar entry, or correct/remove the entry if it is a typo. Paths are relative to the Quarto source directory.',
    );
    if (text === null) return;
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let body = text;
    let metadata = {};
    if (lines[0].trim() === '---') {
      const end = lines.findIndex(
        (line, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(line),
      );
      if (end < 0) {
        add(
          'FC005',
          file,
          'YAML front matter has no closing delimiter.',
          'Close the header with --- on its own line.',
        );
        return;
      }
      metadata = yaml(lines.slice(1, end).join('\n'), file, 1);
      body = lines.slice(end + 1).join('\n');
    }
    // Ignore comments and fenced examples when looking for a real Markdown title.
    const visible = body
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '')
      .trim();
    if (
      metadata &&
      !nonempty(metadata.title) &&
      !/^#{1,6}\s+\S/m.test(visible)
    ) {
      add(
        'FC006',
        file,
        'Page has no title.',
        'Add a nonempty YAML title or a Markdown heading.',
      );
    }
    if (!body.replace(/<!--[\s\S]*?-->/g, '').trim()) {
      add(
        'FC003',
        file,
        'Page has no learning or orientation content after its front matter.',
        'Add the overview, lesson, or challenge instructions.',
      );
    }
  }

  function entries(
    dir,
    label = 'source directory',
    missingFix = 'Create this directory and add the required content.',
  ) {
    if (!safe(dir)) return null;
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name, 'en'));
    } catch (error) {
      readFailure(error, dir, label, missingFix);
      return null;
    }
  }

  function children(dir, kind) {
    const result = [];
    const owner =
      kind === 'course'
        ? 'the Quarto project'
        : `${kind === 'milestone' ? 'course' : 'milestone'} ${JSON.stringify(path.basename(path.dirname(dir)))}`;
    const example = `${slash(path.relative(root, dir))}/<${kind}-id>/`;
    const contents = {
      course:
        'index.qmd and milestones/<milestone-id>/ with its overview, challenge, and units',
      milestone:
        'index.qmd, challenge.qmd, and units/<unit-id>/ with an overview, lessons, and unit challenge',
      unit: 'index.qmd, at least one lesson .qmd, and challenge.qmd',
    }[kind];
    const fix = `Create ${example} containing ${contents}. Add the QMD pages to website.sidebar. Do not add empty placeholder folders.`;
    const listing = entries(dir, `${kind} collection for ${owner}`, fix);
    // An unreadable/missing directory is not evidence that it is empty. Its
    // FC002 (or unsafe-path FC001) already explains the blocking problem.
    if (listing === null) return [];
    for (const entry of listing) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        safe(file);
        continue;
      }
      if (!entry.isDirectory()) continue;
      if (!slug.test(entry.name))
        add(
          'FC007',
          file,
          `Invalid ${kind} directory name: ${entry.name}.`,
          'Use a stable lowercase kebab-case ID, for example everyday-data.',
        );
      result.push(file);
    }
    if (!result.length)
      add(
        'FC008',
        dir,
        `No ${kind} directories were found for ${owner}; at least one is required.`,
        `${fix} Dot/underscore directories and loose files do not count as ${kind} directories.`,
      );
    return result;
  }

  if (!safe(root) || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    add(
      'FC001',
      root,
      'Selected repository directory does not exist or is not a regular directory.',
      'Check out the course repository first and correct the path input.',
    );
    return { errors, counts };
  }
  const content = path.resolve(root, contentDir);
  if (
    !nonempty(contentDir) ||
    path.isAbsolute(contentDir) ||
    !inside(root, content)
  ) {
    add(
      'FC001',
      root,
      'content-dir must be a relative directory inside the repository.',
      'Use docs, . or another contained source directory.',
    );
    return { errors, counts };
  }
  read(
    path.join(root, 'README.md'),
    'repository README',
    'Create README.md with the course/journey overview, setup instructions, contribution guidance, and license details.',
  );
  const license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].find((name) =>
    fs.existsSync(path.join(root, name)),
  );
  read(
    path.join(root, license || 'LICENSE'),
    'license notice',
    'Create LICENSE, LICENSE.md, or LICENSE.txt with appropriate licensing terms and preserve required contributor notices.',
  );
  if (!safe(content)) return { errors, counts };
  const configFile = path.join(content, '_quarto.yml');
  const configText = read(
    configFile,
    'Quarto project configuration',
    'Create _quarto.yml in the selected content-dir with project.type, website.title, format, and freecampus metadata. See the configuration example in the guide.',
  );
  const config = configText === null ? null : yaml(configText, configFile);
  if (config) {
    if (config.project?.type !== 'website')
      add(
        'FC009',
        configFile,
        `project.type must be website; found ${describe(config.project?.type)}.`,
        'Use project: { type: website }. Book/PDF profiles may be added separately.',
      );
    if (!nonempty(config.website?.title))
      add(
        'FC009',
        configFile,
        `website.title must be a nonempty string; found ${describe(config.website?.title)}.`,
        'Set the standalone course or journey title.',
      );
    const format = config.format;
    if (!(
      format === 'html' ||
      (mapping(format) && Object.hasOwn(format, 'html'))
    ))
      add(
        'FC009',
        configFile,
        `An HTML format is required for the public website; format is ${describe(format)}.`,
        'Set format: html or add format.html.',
      );
  }
  page(path.join(content, 'index.qmd'), 'website home');
  const courses = children(path.join(content, 'courses'), 'course');
  counts.courses = courses.length;
  if (config) {
    const kindAdvice =
      courses.length > 0
        ? `Use freecampus.kind: ${courses.length === 1 ? 'course' : 'journey'} for the ${courses.length} detected course director${courses.length === 1 ? 'y' : 'ies'}.`
        : 'Add the course directories first; use kind: course for one or kind: journey for two or more.';
    if (config.freecampus?.['schema-version'] !== 1)
      add(
        'FC010',
        configFile,
        `freecampus.schema-version must be the integer 1; found ${describe(config.freecampus?.['schema-version'])}.`,
        `Set schema-version: 1 inside the top-level freecampus mapping in _quarto.yml (not inside website and not quoted). ${kindAdvice}`,
      );
    if (!['course', 'journey'].includes(config.freecampus?.kind))
      add(
        'FC010',
        configFile,
        `freecampus.kind must be course or journey; found ${describe(config.freecampus?.kind)}.`,
        kindAdvice,
      );
  }
  if (config?.freecampus?.kind === 'course' && courses.length !== 1)
    add(
      'FC010',
      configFile,
      `Standalone course mode requires exactly one course; found ${courses.length}.`,
      courses.length > 1
        ? 'Use kind: journey when the repository groups multiple courses.'
        : 'Add one complete course under courses/ in the selected Quarto source directory, or correct content-dir if it points to the wrong project.',
    );
  if (config?.freecampus?.kind === 'journey' && courses.length < 2)
    add(
      'FC010',
      configFile,
      `A journey groups at least two courses; found ${courses.length}.`,
      'Add the other course(s), or use kind: course for a standalone course.',
    );
  for (const course of courses) {
    page(path.join(course, 'index.qmd'), 'course overview');
    if (fs.existsSync(path.join(course, 'units')))
      add(
        'FC011',
        path.join(course, 'units'),
        `Course ${JSON.stringify(path.basename(course))} has a legacy units/ directory outside any milestone. Every course must group its units into milestones.`,
        `Group these units by learning outcome under ${slash(path.relative(root, course))}/milestones/<milestone-id>/units/. Add each milestone's index.qmd and challenge.qmd; update sidebar entries, relative links, catalogs, notebook paths, tests, and any affected progress IDs.`,
      );
    for (const milestone of children(
      path.join(course, 'milestones'),
      'milestone',
    )) {
      counts.milestones++;
      page(path.join(milestone, 'index.qmd'), 'milestone overview');
      page(path.join(milestone, 'challenge.qmd'), 'milestone challenge');
      for (const unit of children(path.join(milestone, 'units'), 'unit')) {
        counts.units++;
        page(path.join(unit, 'index.qmd'), 'unit overview');
        page(path.join(unit, 'challenge.qmd'), 'unit challenge');
        const unitEntries = entries(unit);
        if (unitEntries === null) continue;
        const lessons = unitEntries.filter(
          (entry) =>
            !entry.name.startsWith('_') &&
            !entry.name.startsWith('.') &&
            entry.name.endsWith('.qmd') &&
            !['index.qmd', 'challenge.qmd'].includes(entry.name),
        );
        if (!lessons.length)
          add(
            'FC012',
            unit,
            `Unit ${JSON.stringify(path.basename(unit))} contains no lesson .qmd files directly beside its overview and challenge.`,
            'Add at least one lesson directly beside index.qmd and challenge.qmd, for example explore-values.qmd.',
          );
        for (const lesson of lessons) {
          const file = path.join(unit, lesson.name);
          if (!slug.test(lesson.name.slice(0, -4)))
            add(
              'FC007',
              file,
              'Invalid lesson filename.',
              'Use lowercase kebab-case with the .qmd extension.',
            );
          counts.lessons++;
          page(file, 'lesson');
        }
      }
    }
  }

  if (config) {
    const linked = new Set();
    const visited = new Set();
    const navError = (message) =>
      add(
        'FC013',
        configFile,
        message,
        'List source .qmd paths explicitly in website.sidebar using strings, href, or section/contents. Do not use auto or globs in the checked sidebar.',
      );
    function link(value) {
      if (!nonempty(value)) {
        navError('Navigation paths must be nonempty strings.');
        return;
      }
      if (/^(https?:\/\/|mailto:|#)/i.test(value)) return;
      const source = value.split(/[?#]/, 1)[0];
      if (
        source.includes('\\') ||
        path.posix.isAbsolute(source) ||
        source.split('/').includes('..') ||
        /[*\[\]{}]/.test(source) ||
        !source.endsWith('.qmd')
      ) {
        navError(
          `Unsupported sidebar source path: ${value}. Local pages must use relative .qmd paths.`,
        );
        return;
      }
      const file = path.resolve(content, source);
      linked.add(file);
      page(file);
    }
    function walk(node, depth = 0) {
      if (depth > 30) {
        navError('Sidebar nesting exceeds 30 levels.');
        return;
      }
      if (typeof node === 'string') {
        link(node);
        return;
      }
      if (!node || typeof node !== 'object') {
        navError('Invalid sidebar entry.');
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);
      if (Array.isArray(node)) {
        node.forEach((entry) => walk(entry, depth + 1));
        return;
      }
      if (Object.hasOwn(node, 'auto'))
        navError(
          'Automatic sidebar discovery is not supported by schema version 1.',
        );
      if (Object.hasOwn(node, 'href')) link(node.href);
      if (
        typeof node.section === 'string' &&
        /\.qmd(?:[?#].*)?$/.test(node.section)
      )
        link(node.section);
      if (Object.hasOwn(node, 'contents')) {
        if (!Array.isArray(node.contents))
          navError('Sidebar contents must be an array.');
        else walk(node.contents, depth + 1);
      }
    }
    if (!config.website?.sidebar)
      navError(
        'website.sidebar is required so learners can find every required page.',
      );
    else walk(config.website.sidebar);
    for (const file of requiredPages) {
      if (!linked.has(file))
        add(
          'FC014',
          configFile,
          `Required page is absent from website.sidebar: ${slash(path.relative(content, file))}.`,
          `Add "${slash(path.relative(content, file))}" to website.sidebar.contents or an appropriate nested section in _quarto.yml. Use the .qmd source path relative to the Quarto directory; a navbar or page-body link alone does not satisfy sidebar coverage.`,
        );
    }
  }
  return { errors, counts };
}
