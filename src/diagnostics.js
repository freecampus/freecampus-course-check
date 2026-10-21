export const GUIDE_URL =
  'https://github.com/freecampus/freecampus-course-check/blob/main/TROUBLESHOOTING.md';

// Keep these stable codes and their guide headings in sync. Tests verify coverage.
export const RULE_TITLES = Object.freeze({
  FC000: 'Action setup or runtime error',
  FC001: 'Invalid source path or symbolic link',
  FC002: 'Missing or unreadable source',
  FC003: 'Empty source content',
  FC004: 'Invalid YAML',
  FC005: 'Unclosed QMD front matter',
  FC006: 'Missing page title',
  FC007: 'Invalid course, milestone, unit, or lesson ID',
  FC008: 'Empty learning collection',
  FC009: 'Incomplete Quarto website configuration',
  FC010: 'Invalid schema or course/journey declaration',
  FC011: 'Legacy units need milestones',
  FC012: 'Unit has no lessons',
  FC013: 'Unsupported sidebar navigation',
  FC014: 'Required page is missing from the sidebar',
});

export function diagnosticHelp(code) {
  return Object.hasOwn(RULE_TITLES, code)
    ? { title: RULE_TITLES[code], url: `${GUIDE_URL}#${code.toLowerCase()}` }
    : { title: 'Validation error', url: GUIDE_URL };
}
