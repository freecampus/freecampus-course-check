import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { check } from '../src/check.js';
import { report } from '../src/main.js';
import { diagnosticHelp, GUIDE_URL, RULE_TITLES } from '../src/diagnostics.js';
import { parseDocument, stringify } from 'yaml';

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
test('missing collections report their owner and fix without an empty-collection cascade', (t) => {
  const dir = fixture(t, 'journey');
  fs.rmSync(path.join(dir, 'docs/courses/next-steps/milestones'), {
    recursive: true,
  });
  fs.rmSync(path.join(dir, milestone, 'units'), { recursive: true });
  const errors = check(dir).errors;
  for (const [file, owner, requiredChild] of [
    [
      'docs/courses/next-steps/milestones',
      'course "next-steps"',
      'units/<unit-id>/',
    ],
    [`${milestone}/units`, 'milestone "observe-data"', 'lesson .qmd'],
  ]) {
    const matches = errors.filter((e) => e.file === file);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].code, 'FC002');
    assert.ok(matches[0].message.includes(owner));
    assert.ok(matches[0].fix.includes(requiredChild));
    assert.ok(matches[0].fix.includes('challenge.qmd'));
  }
  assert.ok(!errors.some((e) => e.code === 'FC008'));
});

test('readable empty course, milestone and unit collections still fail', (t) => {
  for (const collection of [
    'docs/courses',
    'docs/courses/first-steps/milestones',
    `${milestone}/units`,
  ]) {
    const dir = fixture(t);
    fs.rmSync(path.join(dir, collection), { recursive: true });
    fs.mkdirSync(path.join(dir, collection));
    const errors = check(dir).errors.filter((e) => e.file === collection);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'FC008');
    assert.match(errors[0].message, /at least one is required/);
  }
});

test('permission failures do not claim an unreadable collection is missing or empty', (t) => {
  const dir = fixture(t);
  const target = path.join(dir, milestone, 'units');
  const original = fs.readdirSync;
  t.mock.method(fs, 'readdirSync', (file, options) => {
    if (file === target)
      throw Object.assign(new Error('Denied'), { code: 'EACCES' });
    return original(file, options);
  });
  const errors = check(dir).errors.filter(
    (e) => e.file === `${milestone}/units`,
  );
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'FC002');
  assert.match(errors[0].message, /Access denied/);
  assert.match(errors[0].fix, /read.*traverse/);
  assert.doesNotMatch(errors[0].fix, /Create/);
});

test('file in place of a collection gets a directory-conflict diagnostic', (t) => {
  const dir = fixture(t);
  fs.rmSync(path.join(dir, milestone, 'units'), { recursive: true });
  write(dir, `${milestone}/units`, 'This is a file.');
  const errors = check(dir).errors.filter(
    (e) => e.file === `${milestone}/units`,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /ENOTDIR/);
  assert.match(errors[0].fix, /parent component/);
});

test('missing challenges distinguish milestone and unit work', (t) => {
  const dir = fixture(t);
  for (const prefix of [milestone, unit])
    fs.unlinkSync(path.join(dir, prefix, 'challenge.qmd'));
  const errors = check(dir).errors;
  for (const [prefix, role] of [
    [milestone, 'milestone'],
    [unit, 'unit'],
  ]) {
    const error = errors.find((e) => e.file === `${prefix}/challenge.qmd`);
    assert.match(error.message, new RegExp(`Missing ${role} challenge`));
    assert.match(error.fix, /ungraded task/);
    assert.match(error.fix, /self-review/);
  }
});

test('schema diagnostics show actual values and suggest the kind from discovered courses', (t) => {
  const dir = fixture(t, 'journey');
  edit(dir, 'docs/_quarto.yml', (text) =>
    text
      .replace('schema-version: 1', 'schema-version: "1"')
      .replace('kind: journey', 'kind: invalid'),
  );
  const errors = check(dir).errors.filter((e) => e.code === 'FC010');
  assert.equal(errors.length, 2);
  assert.ok(errors.some((e) => e.message.includes('found "1"')));
  assert.ok(errors.some((e) => e.message.includes('found "invalid"')));
  for (const error of errors)
    assert.match(error.fix, /kind: journey.*2 detected course directories/);
});

test('zero discovered courses do not suggest switching to a journey to hide missing sources', (t) => {
  const dir = fixture(t);
  fs.rmSync(path.join(dir, 'docs/courses'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/courses'));
  const error = check(dir).errors.find((e) => e.code === 'FC010');
  assert.match(error.fix, /Add one complete course/);
  assert.doesNotMatch(error.fix, /Use kind: journey/);
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
  assert.ok(logs[1].includes(`Help: ${GUIDE_URL}`));
  assert.match(
    fs.readFileSync(env.GITHUB_OUTPUT, 'utf8'),
    /valid=false\nerror-count=1\ncourse-count=1/,
  );
  assert.ok(
    fs.readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8').includes('&lt;script&gt;'),
  );
});

test('every emitted rule has a stable help anchor and matching guide section', () => {
  const source = ['src/check.js', 'src/main.js']
    .map((file) => fs.readFileSync(path.join(repo, file), 'utf8'))
    .join('\n');
  const emitted = [
    ...new Set(
      [...source.matchAll(/'((?:FC)\d{3})'/g)].map((match) => match[1]),
    ),
  ].sort();
  assert.deepEqual(emitted, Object.keys(RULE_TITLES).sort());
  const guide = fs.readFileSync(path.join(repo, 'TROUBLESHOOTING.md'), 'utf8');
  const sections = [...guide.matchAll(/^## (FC\d{3})$/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(sections, emitted);
  for (const code of emitted)
    assert.equal(
      diagnosticHelp(code).url,
      `${GUIDE_URL}#${code.toLowerCase()}`,
    );
});

test('annotations repeat file paths in the body and summaries link to every rule', (t) => {
  const dir = fixture(t);
  const errors = Object.keys(RULE_TITLES).map((code) => ({
    code,
    file: 'docs/example.qmd',
    line: 4,
    message: 'Example problem',
    fix: 'Example fix',
  }));
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_WORKSPACE: path.dirname(dir),
    GITHUB_STEP_SUMMARY: path.join(dir, 'summary'),
  };
  const logs = [];
  t.mock.method(console, 'log', (value) => logs.push(value));
  report(
    { errors, counts: { courses: 1, milestones: 0, units: 0, lessons: 0 } },
    dir,
    env,
  );
  const summary = fs.readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8');
  const annotations = logs.filter((line) => line.startsWith('::error '));
  assert.equal(annotations.length, errors.length);
  for (let i = 0; i < annotations.length; i++) {
    const body = decodeURIComponent(
      annotations[i].slice(annotations[i].indexOf('::', 2) + 2),
    );
    assert.ok(
      body.includes(`File: "${path.basename(dir)}/docs/example.qmd":4`),
    );
    assert.ok(body.includes(`Help: ${diagnosticHelp(errors[i].code).url}`));
    assert.ok(summary.includes(`href="${diagnosticHelp(errors[i].code).url}"`));
  }
  assert.match(summary, /existing content uncounted/);
  assert.ok(summary.includes(`${path.basename(dir)}/docs/example.qmd:4`));
});

test('local output includes guide links without exposing injected workflow commands', (t) => {
  const dir = fixture(t);
  const logs = [];
  t.mock.method(console, 'log', (value) => logs.push(value));
  report(
    {
      errors: [
        {
          code: 'FC002',
          file: 'docs/example.qmd',
          line: 1,
          message: 'Missing\n::error::injected',
          fix: 'Create it\r::warning::injected',
        },
      ],
      counts: { courses: 0, milestones: 0, units: 0, lessons: 0 },
    },
    dir,
    {},
  );
  const text = logs.join('\n');
  assert.match(text, /File: "docs\/example.qmd":1/);
  assert.ok(text.includes(`${GUIDE_URL}#fc002`));
  assert.doesNotMatch(text, /^::(?:error|warning)::/m);
});

test('guide YAML examples parse and its complete sidebar passes the real starter check', (t) => {
  const guide = fs.readFileSync(path.join(repo, 'TROUBLESHOOTING.md'), 'utf8');
  const yamlBlocks = [...guide.matchAll(/```yaml\n([\s\S]*?)\n```/g)].map(
    (match) => match[1],
  );
  for (const block of yamlBlocks)
    assert.deepEqual(parseDocument(block).errors, []);
  const sidebar = parseDocument(
    yamlBlocks.find((block) => block.includes('sidebar:')),
  ).toJS();
  const dir = fixture(t);
  const config = parseDocument(
    fs.readFileSync(path.join(dir, 'docs/_quarto.yml'), 'utf8'),
  ).toJS();
  config.website = sidebar.website;
  write(dir, 'docs/_quarto.yml', stringify(config));
  assert.deepEqual(check(dir).errors, []);
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

test('action inputs select the consumer checkout and its source directory', (t) => {
  const dir = fixture(t);
  fs.renameSync(path.join(dir, 'docs'), path.join(dir, 'content'));
  const output = path.join(dir, 'action-output');
  const summary = path.join(dir, 'action-summary');
  const result = spawnSync(
    process.execPath,
    [path.join(repo, 'dist/index.cjs')],
    {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'true',
        GITHUB_WORKSPACE: path.dirname(dir),
        INPUT_PATH: path.basename(dir),
        'INPUT_CONTENT-DIR': 'content',
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(
    fs.readFileSync(output, 'utf8'),
    /valid=true\nerror-count=0\ncourse-count=1/,
  );
  assert.match(fs.readFileSync(summary, 'utf8'), /PASS/);
});
