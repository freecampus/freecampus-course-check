import fs from 'node:fs';
import path from 'node:path';
import { check, inside } from './check.js';
import { diagnosticHelp, GUIDE_URL } from './diagnostics.js';

const escapeData = (value) =>
  String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
const escapeProperty = (value) =>
  escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
const html = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function report(result, root, env = process.env) {
  const valid = result.errors.length === 0;
  const displayFile = (error) =>
    env.GITHUB_ACTIONS === 'true'
      ? path
          .relative(
            env.GITHUB_WORKSPACE || root,
            path.resolve(root, error.file),
          )
          .split(path.sep)
          .join('/')
      : error.file;
  const summary = `FreeCampus structure: ${valid ? 'PASS' : 'FAIL'}; ${result.errors.length} error(s), ${result.counts.courses} course(s), ${result.counts.milestones} milestone(s), ${result.counts.units} unit(s), ${result.counts.lessons} lesson(s).`;
  console.log(summary);
  for (const error of result.errors) {
    const help = diagnosticHelp(error.code);
    const title = `${error.code}: ${help.title}`;
    const file = displayFile(error);
    // GitHub's plain job log omits annotation file/title properties. Repeat both
    // in the body so the downloaded log is useful without the annotation UI.
    const message = [
      `[${error.code}] ${help.title}`,
      `File: ${JSON.stringify(file)}:${error.line}`,
      `Problem: ${error.message}`,
      `Fix: ${error.fix}`,
      `Help: ${help.url}`,
    ].join('\n');
    // Prefix local output and escape all annotation fields to prevent command injection.
    if (env.GITHUB_ACTIONS === 'true') {
      console.log(
        `::error file=${escapeProperty(file)},line=${error.line},title=${escapeProperty(title)}::${escapeData(message)}`,
      );
    } else console.log(`- ${message.replace(/\r\n|\r|\n/g, '\n  ')}`);
  }
  const discoveryNote =
    'Counts describe discovered structure. A missing parent directory can leave existing content uncounted; fix parent paths before interpreting zero counts.';
  if (!valid) console.log(discoveryNote);
  if (env.GITHUB_OUTPUT)
    fs.appendFileSync(
      env.GITHUB_OUTPUT,
      `valid=${valid}\nerror-count=${result.errors.length}\ncourse-count=${result.counts.courses}\n`,
    );
  if (env.GITHUB_STEP_SUMMARY) {
    // Keep summary well under GitHub's 1 MiB limit; the full diagnostic list is in the log.
    let details = '';
    for (const error of result.errors) {
      const help = diagnosticHelp(error.code);
      const item = `<li><strong>${html(error.code)}: ${html(help.title)}</strong><br><strong>File:</strong> <code>${html(displayFile(error))}:${error.line}</code><br><strong>Problem:</strong> ${html(error.message)}<br><strong>Fix:</strong> ${html(error.fix)}<br><a href="${html(help.url)}">Help and examples for ${html(error.code)}</a></li>\n`;
      if (Buffer.byteLength(details + item) > 800000) {
        details += '<li>Additional errors are listed in the job log.</li>';
        break;
      }
      details += item;
    }
    fs.appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `## FreeCampus course structure\n\n${summary}\n\n${valid ? '' : `${discoveryNote}\n\n`}[Troubleshooting guide](${GUIDE_URL})\n\n<ul>\n${details}</ul>\n`,
    );
  }
  return valid ? 0 : 1;
}

export function run(args = process.argv.slice(2), env = process.env) {
  let root = process.cwd();
  try {
    let contentDir = 'docs';
    if (env.GITHUB_ACTIONS === 'true' && args.length === 0) {
      const workspace = fs.realpathSync(env.GITHUB_WORKSPACE || process.cwd());
      const input = env.INPUT_PATH || '.';
      root = path.resolve(workspace, input);
      if (
        path.isAbsolute(input) ||
        !inside(workspace, root) ||
        !inside(workspace, fs.realpathSync(root))
      )
        throw new Error(
          'path must select a checked-out directory inside GITHUB_WORKSPACE.',
        );
      contentDir = env['INPUT_CONTENT-DIR'] || 'docs';
    } else {
      if (args.includes('--help')) {
        console.log(
          'Usage: node dist/index.cjs [repository-path] [--content-dir docs]\nChecks source structure only. Exit 0: valid; 1: validation errors; 2: invocation/runtime error.',
        );
        return 0;
      }
      let positional = false;
      for (let i = 0; i < args.length; i++) {
        if (
          args[i] === '--content-dir' &&
          args[i + 1] &&
          !args[i + 1].startsWith('--')
        )
          contentDir = args[++i];
        else if (!args[i].startsWith('--') && !positional) {
          root = path.resolve(args[i]);
          positional = true;
        } else
          throw new Error(
            `Unknown or incomplete argument: ${args[i]}. Use --help.`,
          );
      }
    }
    return report(check(root, contentDir), root, env);
  } catch (error) {
    report(
      {
        errors: [
          {
            code: 'FC000',
            file: '.',
            line: 1,
            message: error.message,
            fix: 'Check the inputs and file permissions. Report unexpected failures with the action version and log.',
          },
        ],
        counts: { courses: 0, milestones: 0, units: 0, lessons: 0 },
      },
      root,
      env,
    );
    return 2;
  }
}
