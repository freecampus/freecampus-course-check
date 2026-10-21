import fs from 'node:fs';
import path from 'node:path';
import { check, inside } from './check.js';

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
  const summary = `FreeCampus structure: ${valid ? 'PASS' : 'FAIL'}; ${result.errors.length} error(s), ${result.counts.courses} course(s), ${result.counts.milestones} milestone(s), ${result.counts.units} unit(s), ${result.counts.lessons} lesson(s).`;
  console.log(summary);
  for (const error of result.errors) {
    const message = `[${error.code}] ${error.message} Fix: ${error.fix}`;
    // Prefix local output and escape all annotation fields to prevent command injection.
    if (env.GITHUB_ACTIONS === 'true') {
      const file = path
        .relative(env.GITHUB_WORKSPACE || root, path.resolve(root, error.file))
        .split(path.sep)
        .join('/');
      console.log(
        `::error file=${escapeProperty(file)},line=${error.line},title=${escapeProperty(error.code)}::${escapeData(message)}`,
      );
    } else
      console.log(
        `- ${JSON.stringify(error.file)}:${error.line} ${message.replace(/[\r\n]/g, ' ')}`,
      );
  }
  if (env.GITHUB_OUTPUT)
    fs.appendFileSync(
      env.GITHUB_OUTPUT,
      `valid=${valid}\nerror-count=${result.errors.length}\ncourse-count=${result.counts.courses}\n`,
    );
  if (env.GITHUB_STEP_SUMMARY) {
    // Keep summary well under GitHub's 1 MiB limit; the full diagnostic list is in the log.
    let details = '';
    for (const error of result.errors) {
      const item = `<li><code>${html(error.code)} ${html(error.file)}:${error.line}</code>: ${html(error.message)}<br>Fix: ${html(error.fix)}</li>\n`;
      if (Buffer.byteLength(details + item) > 800000) {
        details += '<li>Additional errors are listed in the job log.</li>';
        break;
      }
      details += item;
    }
    fs.appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `## FreeCampus course structure\n\n${summary}\n\n<ul>\n${details}</ul>\n`,
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
