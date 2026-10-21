import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { check } from '../src/check.js';
import { report } from '../src/main.js';

const repo = fileURLToPath(new URL('../', import.meta.url));
const milestone = 'docs/courses/first-steps/milestones/observe-data';
const unit = `${milestone}/units/observations`;
function fixture(t, template = 'course') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freecampus-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(path.join(repo, 'templates', template), dir, { recursive: true });
  return dir;
}
function write(dir, name, value) {
  fs.writeFileSync(path.join(dir, name), value);
}
function edit(dir, name, transform) {
  write(dir, name, transform(fs.readFileSync(path.join(dir, name), 'utf8')));
}
function codes(dir, contentDir) {
  return check(dir, contentDir).errors.map((error) => error.code);
}

for (const template of ['course', 'journey']) {
  test(`${template} template satisfies the contract`, (t) => {
    const result = check(fixture(t, template));
    assert.deepEqual(result.errors, []);
    assert.equal(result.counts.courses, template === 'course' ? 1 : 2);
    assert.equal(result.counts.lessons, template === 'course' ? 1 : 2);
  });
}
test('reports multiple missing challenges with their exact paths and fixes', (t) => {
  const dir = fixture(t);
  const names = [`${milestone}/challenge.qmd`, `${unit}/challenge.qmd`];
  for (const name of names) fs.unlinkSync(path.join(dir, name));
  const errors = check(dir).errors;
  for (const name of names)
    assert.ok(
      errors.some(
        (e) =>
          e.file === name && e.code === 'FC002' && e.fix.includes('Create'),
      ),
    );
});
test('every course must contain a milestone and every milestone a unit', (t) => {
  const dir = fixture(t, 'journey');
  fs.rmSync(path.join(dir, 'docs/courses/next-steps/milestones'), {
    recursive: true,
  });
  fs.rmSync(path.join(dir, milestone, 'units'), { recursive: true });
  assert.equal(check(dir).errors.filter((e) => e.code === 'FC008').length, 2);
});
test('overview, challenge and include fragments cannot substitute for a lesson', (t) => {
  const dir = fixture(t);
  fs.renameSync(
    path.join(dir, unit, 'notice-patterns.qmd'),
    path.join(dir, unit, '_fragment.qmd'),
  );
  assert.ok(codes(dir).includes('FC012'));
});
test('standalone and journey cardinality are enforced', (t) => {
  for (const template of ['course', 'journey']) {
    const dir = fixture(t, template);
    edit(dir, 'docs/_quarto.yml', (text) =>
      text.replace(
        `kind: ${template}`,
        `kind: ${template === 'course' ? 'journey' : 'course'}`,
      ),
    );
    assert.ok(codes(dir).includes('FC010'));
  }
});
test('unsupported schema version fails', (t) => {
  const dir = fixture(t);
  edit(dir, 'docs/_quarto.yml', (text) =>
    text.replace('schema-version: 1', 'schema-version: 42'),
  );
  assert.ok(codes(dir).includes('FC010'));
});
test('malformed YAML reports a line and independent structural errors', (t) => {
  const dir = fixture(t);
  write(dir, 'docs/_quarto.yml', 'project:\n  type: [website\n');
  fs.unlinkSync(path.join(dir, unit, 'challenge.qmd'));
  const errors = check(dir).errors;
  assert.ok(errors.some((e) => e.code === 'FC004' && e.line >= 2));
  assert.ok(errors.some((e) => e.file.endsWith('challenge.qmd')));
});
test('duplicate YAML keys fail instead of silently replacing requirements', (t) => {
  const dir = fixture(t);
  edit(
    dir,
    'docs/_quarto.yml',
    (text) => `${text}\nfreecampus: {kind: journey}\n`,
  );
  assert.ok(codes(dir).includes('FC004'));
});
test('front matter must be closed and valid', (t) => {
  const dir = fixture(t);
  write(dir, `${unit}/notice-patterns.qmd`, '---\ntitle: broken\n');
  assert.ok(codes(dir).includes('FC005'));
  write(
    dir,
    `${unit}/notice-patterns.qmd`,
    '---\ntitle: [broken\n---\nContent',
  );
  assert.ok(codes(dir).includes('FC004'));
});
test('Markdown titles, UTF-8 BOM and CRLF are supported', (t) => {
  const dir = fixture(t);
  write(
    dir,
    `${unit}/notice-patterns.qmd`,
    '\uFEFF# Observe\r\n\r\nTry counting the observations.\r\n',
  );
  assert.deepEqual(check(dir).errors, []);
});
test('empty pages, header-only pages and titleless pages fail', (t) => {
  const dir = fixture(t);
  for (const [text, code] of [
    ['', 'FC003'],
    ['---\ntitle: Empty\n---\n<!-- TODO -->', 'FC003'],
    ['Try this exercise.', 'FC006'],
    ['```markdown\n# Example only\n```', 'FC006'],
  ]) {
    write(dir, `${unit}/notice-patterns.qmd`, text);
    assert.ok(codes(dir).includes(code), text);
  }
});
test('invalid IDs are diagnosed', (t) => {
  const dir = fixture(t);
  fs.renameSync(
    path.join(dir, unit, 'notice-patterns.qmd'),
    path.join(dir, unit, 'Bad_Name.qmd'),
  );
  assert.ok(codes(dir).includes('FC007'));
});
test('missing navigation and nonexistent source links are diagnosed', (t) => {
  const dir = fixture(t);
  edit(dir, 'docs/_quarto.yml', (text) =>
    text.replace('notice-patterns.qmd', 'missing.qmd'),
  );
  const errors = check(dir).errors;
  assert.ok(
    errors.some(
      (e) => e.code === 'FC014' && e.message.includes('notice-patterns.qmd'),
    ),
  );
  assert.ok(
    errors.some((e) => e.code === 'FC002' && e.file.endsWith('missing.qmd')),
  );
});
test('href entries, sidebar arrays and external links work', (t) => {
  const dir = fixture(t);
  edit(dir, 'docs/_quarto.yml', (text) =>
    text
      .replace('  sidebar:\n    contents:', '  sidebar:\n    - contents:')
      .replace(/^(      - .*)$/gm, '  $1')
      .replace(
        '- index.qmd',
        '- href: index.qmd#start\n        - https://freecampus.org/',
      )
      .replace('format: html', 'format: {html: {toc: true}}'),
  );
  assert.deepEqual(check(dir).errors, []);
});
test('automatic navigation is rejected with advice', (t) => {
  const dir = fixture(t);
  edit(dir, 'docs/_quarto.yml', (text) =>
    text.replace('- index.qmd', '- auto: "**/*.qmd"'),
  );
  assert.ok(codes(dir).includes('FC013'));
});
test('HTML links and escaping navigation paths do not satisfy QMD navigation', (t) => {
  const dir = fixture(t);
  const original = fs.readFileSync(path.join(dir, 'docs/_quarto.yml'), 'utf8');
  for (const value of [
    'index.html',
    '../outside.qmd',
    '/index.qmd',
    'courses/*.qmd',
  ]) {
    write(
      dir,
      'docs/_quarto.yml',
      original.replace('- index.qmd', `- ${value}`),
    );
    assert.ok(codes(dir).includes('FC013'));
  }
});
test('legacy units without milestones get targeted migration advice', (t) => {
  const dir = fixture(t);
  fs.mkdirSync(path.join(dir, 'docs/courses/first-steps/units'));
  assert.ok(codes(dir).includes('FC011'));
});
test('content directory can be renamed or be the repository root', (t) => {
  const dir = fixture(t);
  fs.renameSync(path.join(dir, 'docs'), path.join(dir, 'content'));
  assert.deepEqual(check(dir, 'content').errors, []);
  fs.cpSync(path.join(dir, 'content'), dir, { recursive: true });
  assert.deepEqual(check(dir, '.').errors, []);
  assert.ok(codes(dir, '../outside').includes('FC001'));
});
test('required repository documentation and alternate license names are checked', (t) => {
  const dir = fixture(t);
  fs.renameSync(path.join(dir, 'LICENSE'), path.join(dir, 'LICENSE.md'));
  assert.deepEqual(check(dir).errors, []);
  fs.unlinkSync(path.join(dir, 'README.md'));
  fs.unlinkSync(path.join(dir, 'LICENSE.md'));
  assert.equal(check(dir).errors.filter((e) => e.code === 'FC002').length, 2);
});
test(
  'symlinked source files and directories are rejected',
  { skip: process.platform === 'win32' },
  (t) => {
    const dir = fixture(t);
    const file = path.join(dir, unit, 'notice-patterns.qmd');
    fs.unlinkSync(file);
    fs.symlinkSync(path.join(dir, 'README.md'), file);
    assert.ok(codes(dir).includes('FC001'));
    fs.rmSync(path.join(dir, milestone, 'units'), { recursive: true });
    fs.symlinkSync(os.tmpdir(), path.join(dir, milestone, 'units'));
    assert.ok(codes(dir).includes('FC001'));
  },
);
test('oversized or invalid UTF-8 sources fail cleanly', (t) => {
  const dir = fixture(t);
  write(dir, `${unit}/notice-patterns.qmd`, 'x'.repeat(1024 * 1024 + 1));
  assert.ok(codes(dir).includes('FC002'));
  write(dir, `${unit}/notice-patterns.qmd`, Buffer.from([0xc3, 0x28]));
  assert.ok(codes(dir).includes('FC002'));
});
test('cyclic and excessive YAML aliases cannot hang traversal', (t) => {
  const dir = fixture(t);
  edit(dir, 'docs/_quarto.yml', (text) =>
    text
      .replace('  sidebar:', '  sidebar: &sidebar')
      .replace('      - index.qmd', '      - *sidebar\n      - index.qmd'),
  );
  assert.doesNotThrow(() => check(dir));
  write(
    dir,
    'docs/_quarto.yml',
    'a: &a [1, 2]\nb: &b [*a, *a, *a, *a, *a, *a, *a, *a]\nc: [*b, *b, *b, *b, *b, *b, *b, *b]\n',
  );
  assert.ok(codes(dir).includes('FC004'));
});
test('report escapes workflow commands and HTML, and writes outputs on failure', (t) => {
  const dir = fixture(t);
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_WORKSPACE: path.dirname(dir),
    GITHUB_OUTPUT: path.join(dir, 'outputs'),
    GITHUB_STEP_SUMMARY: path.join(dir, 'summary'),
  };
  const logs = [];
  t.mock.method(console, 'log', (text) => logs.push(text));
  const error = {
    code: 'FC999',
    file: 'bad,\nname.qmd',
    line: 2,
    message: '<script>\n::warning::injected%',
    fix: 'Fix & retry',
  };
  assert.equal(
    report(
      {
        errors: [error],
        counts: { courses: 1, milestones: 1, units: 1, lessons: 1 },
      },
      dir,
      env,
    ),
    1,
  );
  assert.ok(logs[1].includes('%0A'));
  assert.ok(!logs[1].includes('\n'));
  assert.match(
    fs.readFileSync(env.GITHUB_OUTPUT, 'utf8'),
    /valid=false\nerror-count=1\ncourse-count=1/,
  );
  assert.ok(
    fs.readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8').includes('&lt;script&gt;'),
  );
});
test('CLI and committed bundle agree on passing and failing repositories', (t) => {
  const dir = fixture(t);
  const env = {
    ...process.env,
    GITHUB_ACTIONS: 'false',
    GITHUB_OUTPUT: '',
    GITHUB_STEP_SUMMARY: '',
  };
  for (const executable of ['src/entry.js', 'dist/index.cjs']) {
    let result = spawnSync(
      process.execPath,
      [path.join(repo, executable), dir],
      { encoding: 'utf8', env },
    );
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const challenge = path.join(dir, unit, 'challenge.qmd');
    const text = fs.readFileSync(challenge);
    fs.unlinkSync(challenge);
    result = spawnSync(process.execPath, [path.join(repo, executable), dir], {
      encoding: 'utf8',
      env,
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /challenge.qmd/);
    fs.writeFileSync(challenge, text);
  }
});
test('bad CLI arguments and action paths outside checkout fail clearly', (t) => {
  const dir = fixture(t);
  const entry = path.join(repo, 'dist/index.cjs');
  const env = {
    ...process.env,
    GITHUB_ACTIONS: 'false',
    GITHUB_OUTPUT: '',
    GITHUB_STEP_SUMMARY: '',
  };
  assert.equal(
    spawnSync(process.execPath, [entry, '--unknown'], { env }).status,
    2,
  );
  assert.equal(
    spawnSync(process.execPath, [entry, '--content-dir'], { env }).status,
    2,
  );
  const result = spawnSync(process.execPath, [entry], {
    encoding: 'utf8',
    env: {
      ...env,
      GITHUB_ACTIONS: 'true',
      GITHUB_WORKSPACE: dir,
      INPUT_PATH: '..',
    },
  });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /inside GITHUB_WORKSPACE/);
});
