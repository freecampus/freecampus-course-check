import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const mapping = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) =>
  typeof value === 'string' && value.trim().length > 0;
const slash = (value) => value.split(path.sep).join('/');
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

  function read(file) {
    if (!safe(file)) return null;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) {
        add(
          'FC002',
          file,
          'Expected a regular text file.',
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
      add(
        'FC002',
        file,
        `Cannot read required file (${error.code || 'invalid UTF-8'}).`,
        'Create this file as UTF-8 text and ensure it is readable.',
      );
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

  function page(file) {
    requiredPages.add(file);
    if (checkedPages.has(file)) return;
    checkedPages.add(file);
    const text = read(file);
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

  function entries(dir) {
    if (!safe(dir)) return [];
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name, 'en'));
    } catch (error) {
      add(
        'FC002',
        dir,
        `Cannot read required directory (${error.code}).`,
        'Create this directory and add the required content.',
      );
      return [];
    }
  }

  function children(dir, kind) {
    const result = [];
    for (const entry of entries(dir)) {
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
        `Expected at least one ${kind} directory; found none.`,
        `Add a ${kind} with index.qmd and its required child content. Underscore and dot directories are ignored.`,
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
  read(path.join(root, 'README.md'));
  const license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].find((name) =>
    fs.existsSync(path.join(root, name)),
  );
  read(path.join(root, license || 'LICENSE'));
  if (!safe(content)) return { errors, counts };
  const configFile = path.join(content, '_quarto.yml');
  const configText = read(configFile);
  const config = configText === null ? null : yaml(configText, configFile);
  if (config) {
    if (config.project?.type !== 'website')
      add(
        'FC009',
        configFile,
        'project.type must be website for this template.',
        'Use project: { type: website }. Book/PDF profiles may be added separately.',
      );
    if (!nonempty(config.website?.title))
      add(
        'FC009',
        configFile,
        'website.title is required.',
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
        'An HTML format is required for the public website.',
        'Set format: html or add format.html.',
      );
    if (config.freecampus?.['schema-version'] !== 1)
      add(
        'FC010',
        configFile,
        'freecampus.schema-version must be the integer 1.',
        'Add freecampus: { schema-version: 1, kind: course } (or kind: journey).',
      );
    if (!['course', 'journey'].includes(config.freecampus?.kind))
      add(
        'FC010',
        configFile,
        'freecampus.kind must be course or journey.',
        'Use course for one course, journey for two or more.',
      );
  }
  page(path.join(content, 'index.qmd'));
  const courses = children(path.join(content, 'courses'), 'course');
  counts.courses = courses.length;
  if (config?.freecampus?.kind === 'course' && courses.length !== 1)
    add(
      'FC010',
      configFile,
      `Standalone course mode requires exactly one course; found ${courses.length}.`,
      'Use kind: journey when the repository groups multiple courses.',
    );
  if (config?.freecampus?.kind === 'journey' && courses.length < 2)
    add(
      'FC010',
      configFile,
      `A journey groups at least two courses; found ${courses.length}.`,
      'Add the other course(s), or use kind: course for a standalone course.',
    );
  for (const course of courses) {
    page(path.join(course, 'index.qmd'));
    if (fs.existsSync(path.join(course, 'units')))
      add(
        'FC011',
        path.join(course, 'units'),
        'Legacy course/units layout bypasses milestones.',
        'Move units into milestones/<milestone-id>/units/, add a milestone overview and challenge, and update navigation.',
      );
    for (const milestone of children(
      path.join(course, 'milestones'),
      'milestone',
    )) {
      counts.milestones++;
      page(path.join(milestone, 'index.qmd'));
      page(path.join(milestone, 'challenge.qmd'));
      for (const unit of children(path.join(milestone, 'units'), 'unit')) {
        counts.units++;
        page(path.join(unit, 'index.qmd'));
        page(path.join(unit, 'challenge.qmd'));
        const lessons = entries(unit).filter(
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
            'Unit contains no lesson .qmd files.',
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
          page(file);
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
          'Add this source path to the appropriate course, milestone, or unit section.',
        );
    }
  }
  return { errors, counts };
}
