/**
 * The ABDM certification matrix, rebuilt from NHA's own workbooks.
 *
 * This script exists because of a specific failure. An audit of all published NHA test cases was
 * run in August 2026 and produced the verdict the sign-off decision still rests on — 169 mandatory,
 * 33 pass, 108 fail, 26 blocked, NOT READY. **None of its tooling was ever committed.** `BACKLOG.md`
 * said the report "regenerates from `abdm_audit.json`"; there was no such file, no extractor and no
 * matrix generator anywhere in the repository or its history. The number could not be checked, let
 * alone updated, and work landed for weeks against a figure nobody could reproduce.
 *
 * So the rule this file enforces is simple: **the matrix is derived, never transcribed.** Its only
 * inputs are the five `.xlsx` workbooks NHA publishes, committed under `docs/testcasesofficial/`.
 * If NHA republishes a workbook, replace the file and re-run; the numbers move on their own.
 *
 * ── WHY THE ROLE MATTERS ────────────────────────────────────────────────────
 * A case's requirement is not the word in its own row. NHA scopes whole *sections* by applicant
 * type, and a section header saying `Government` overrides every "Mandatory" beneath it. The nine
 * demographic cases (`CRT_ABHA_301…309`) are the reason this distinction is load-bearing: they read
 * "Mandatory" per row, and sit under a section headed *"Available Only for trusted entities"*. For
 * a private integrator they are **out of scope**, not failing — a ten-case swing in M1 alone.
 *
 *   npm run abdm:audit -w hms_backend                 # private integrator (our case)
 *   npm run abdm:audit -w hms_backend -- --role=government
 *   npm run abdm:audit -w hms_backend -- --json       # the full matrix, for diffing
 *
 * This script reads files and prints. It touches no database and calls nothing.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

export type Role = 'private' | 'government';
export type Requirement = 'mandatory' | 'conditional' | 'optional' | 'unstated' | 'out-of-scope';

export interface Case {
  milestone: string;
  section: string;
  applicableTo: string;
  id: string;
  statusText: string;
  functionality: string;
  testCase: string;
  expected: string;
  requirement: Requirement;
}

const WORKBOOK_DIR = join(process.cwd(), '..', 'docs', 'testcasesofficial');

/** Which workbook is which milestone. Matched on a filename prefix so NHA's hashes can change. */
const BOOKS: Array<{ prefix: string; milestone: string }> = [
  { prefix: 'M1_', milestone: 'M1' },
  { prefix: 'M2_', milestone: 'M2' },
  { prefix: 'M3_', milestone: 'M3' },
  { prefix: 'HFR', milestone: 'M4-HFR' },
  { prefix: 'HPR', milestone: 'M4-HPR' },
];

/**
 * Case ids across all five workbooks. Anything else on a row is prose, not a case.
 *
 * **Every prefix NHA actually uses, not the ones we remembered.** The first version of this list
 * held eight prefixes and silently dropped three more, because a row whose id does not match is
 * skipped without a word. What it dropped was not an edge: `VRFY_`/`PROF_`/`SHARE` is the entire
 * second half of the M1 workbook — the half its own title names (*ABHA Creation **and
 * Verification***) — and `USER_INIT_`/`Health_RECORD_` is a seventh of M2. M1 reported 12
 * mandatory cases when it has 26.
 *
 * So the rule is: **an unmatched id is a bug in this list, not a non-case.** `unmatchedIds`
 * below reports anything that looks like an id and is not claimed here, so the next prefix NHA
 * invents is loud rather than invisible.
 */
const CASE_ID =
  /^(CRT_|VRFY_|PROF_|SHARE_|SHARE _|HIP_|HIU_|USER_INIT_|HEALTH_RECORD_|TAGGING|HFR-|HPR-|LINK_|DISC_|CONS_)/i;

/**
 * Anything shaped like a case id — an ALL-CAPS or Title_Case token with an underscore or dash and
 * a number. Used only to notice ids `CASE_ID` does not claim, never to admit them silently.
 */
const LOOKS_LIKE_ID = /^[A-Za-z][A-Za-z]*[_-][A-Za-z0-9_ -]*d/;

// ── xlsx reading ────────────────────────────────────────────────────────────
// An .xlsx is a zip of XML. Read it directly rather than shelling out to `unzip`, so the script
// runs the same on the VM, in CI and on a developer's Windows machine.

/** Every file in a zip, by name. Handles stored and deflated entries, which is all Excel emits. */
function readZip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  // Walk backwards to the End Of Central Directory record; the comment field makes it variable.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file — no end-of-central-directory record');

  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < entries; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // The local header repeats the name and extra fields, at its own lengths.
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);

    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function decodeXmlText(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Every worksheet in the workbook, as rows of trimmed cell strings.
 *
 * All of them, not the first: the HFR workbook spreads its 129 cases across several sheets, and
 * reading only `sheet1.xml` silently reported 9. A parser that undercounts a certification matrix
 * is worse than one that fails, because the number still looks like an answer.
 */
function sheetRows(files: Map<string, Buffer>): string[][] {
  const sharedXml = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  const shared = (sharedXml.match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) =>
    // A cell's text can be split across several <t> runs; joining them is not optional.
    (si.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? []).map(decodeXmlText).join(''),
  );

  const sheetNames = [...files.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => {
      const n = (s: string) => Number(/sheet(\d+)\.xml$/.exec(s)?.[1] ?? 0);
      return n(a) - n(b);
    });
  if (sheetNames.length === 0) return [];
  const xml = sheetNames.map((n) => files.get(n)!.toString('utf8')).join('\n');

  const rows: string[][] = [];
  for (const rowXml of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const out: string[] = [];
    for (const cell of rowXml.match(/<c[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
      const ref = /r="([A-Z]+\d+)"/.exec(cell)?.[1] ?? '';
      const type = /t="([^"]+)"/.exec(cell)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1];
      const inline = /<is>[\s\S]*?<\/is>/.exec(cell)?.[0];

      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr' && inline) value = decodeXmlText(inline);
      else if (v !== undefined) value = decodeXmlText(v);

      const i = columnIndex(ref);
      while (out.length < i) out.push('');
      out[i] = value.replace(/\s+/g, ' ').trim();
    }
    if (out.some((c) => c !== '')) rows.push(out);
  }
  return rows;
}

// ── scoping ─────────────────────────────────────────────────────────────────

/**
 * Does the section this case sits in apply to us at all?
 *
 * This is the check that moves ten cases, and it reads the SECTION header rather than the row.
 */
function sectionExcludes(applicableTo: string, sectionTitle: string, role: Role): boolean {
  if (role === 'government') return false;
  const both = `${applicableTo} ${sectionTitle}`.toLowerCase();
  if (/^government$/i.test(applicableTo.trim())) return true;
  if (both.includes('only for trusted entities')) return true;
  // We are an HMIS. A section written for a patient's own PHR application is not ours to pass.
  if (/\bphr app\b/.test(both)) return true;
  return false;
}

/**
 * Anything that reads like a requirement, in any of the three dialects the five workbooks use.
 *
 * M1–M3 say "Mandatory" / "Optional". The M4 workbooks are **field-level** and say "Yes" / "No" —
 * meaning *is this data field required*, not *is this scenario required*. They are counted here
 * because a mandatory field is still something an assessor checks, but the report labels M4
 * separately rather than pretending the two questions are the same one.
 */
// `any one of them` leads M3's group requirement for the seven HI-type fetches. Without it the
// phrase is not recognised as a requirement at all, the group falls through to the previous
// row's "Mandatory", and one requirement is reported as seven.
const REQUIREMENT_TOKEN = /^(mandatory|optional|non-mandatory|any one of them|yes|no)\b/i;

/**
 * Which column holds the requirement — it moves, and not only between workbooks.
 *
 * The header says column D throughout. In practice M1–M3 put it in B; HFR uses D for most rows but
 * B across the whole Search block; HPR uses A for most rows and D for the first of each group. That
 * is merged cells in NHA's own authoring, not a parsing error, so the resolver looks for the value
 * rather than trusting a position. D first, because that is where the header promises it.
 */
function resolveRequirementText(row: string[]): string {
  for (const i of [3, 1, 0, 2]) {
    const v = (row[i] ?? '').trim();
    if (v && REQUIREMENT_TOKEN.test(v)) return v;
  }
  return '';
}

/** What the row itself claims, once the section has been allowed through. */
function requirementOf(statusText: string, role: Role): Requirement {
  const s = statusText.toLowerCase().trim();
  if (!s) return 'unstated';

  // M4's field-level dialect. Checked first: "No" must not fall through to a prefix test below.
  if (/^no\b/.test(s)) return 'optional';
  // "Yes, if …" / "Yes (only if …)" is a real conditional — the field is required once something
  // else is chosen, which is a different demonstration from an always-required field.
  if (/^yes\s*[,(]/.test(s) || (/^yes\b/.test(s) && s.includes('if'))) return 'conditional';
  if (/^yes\b/.test(s)) return 'mandatory';

  if (s.startsWith('optional') || s.includes('non-mandatory')) return 'optional';
  // "Either of X or Y is mandatory for Government, Optional for Private"
  if (s.includes('either of the test cases'))
    return role === 'government' ? 'mandatory' : 'optional';
  if (s.includes('mandatory if the intergrator is implementing')) return 'conditional';
  // "Any one of them is mandatory" (M3's seven HI-type fetches): the GROUP must be demonstrated,
  // no single member of it must. Conditional is the honest label — calling each one mandatory
  // would invent six requirements, and calling them optional would lose the group's real one.
  if (s.includes('any one of them is mandatory')) return 'conditional';
  if (s.includes('mandatory for government') && !s.includes('private')) {
    return role === 'government' ? 'mandatory' : 'optional';
  }
  if (s.startsWith('mandatory')) return 'mandatory';
  return 'unstated';
}

// ── the matrix ──────────────────────────────────────────────────────────────

/**
 * How many rows were dropped as repeats of a case already seen. Reported, never silent.
 *
 * The HFR workbook repeats its whole Bridge-linkage block (`HFR-118…123`) on a second sheet, so the
 * row count is 129 and the case count is 123. A case is a case, not a row — but a matrix that
 * quietly shrinks is exactly what this tool exists to stop, so the number is printed.
 */
let duplicateRows = 0;

/**
 * Ids that look like a case but no prefix in `CASE_ID` claims.
 *
 * Empty is the only acceptable value. A non-empty set means the matrix is short by exactly that
 * many cases, and nobody would otherwise know — the failure this whole file exists to prevent.
 */
const unmatchedIds = new Set<string>();

export function buildMatrix(role: Role): Case[] {
  if (!existsSync(WORKBOOK_DIR)) {
    throw new Error(
      `No workbooks at ${WORKBOOK_DIR}. Download the five .xlsx files from the sandbox's Test Cases page ` +
        `(https://sandbox.abdm.gov.in/sandbox/v3/new-documentation?doc=TestCases) and commit them there.`,
    );
  }
  const present = readdirSync(WORKBOOK_DIR).filter((f) => f.toLowerCase().endsWith('.xlsx'));
  const cases: Case[] = [];
  const seen = new Set<string>();
  duplicateRows = 0;
  unmatchedIds.clear();

  for (const book of BOOKS) {
    const file = present.find((f) => f.startsWith(book.prefix));
    if (!file) {
      // Said out loud rather than silently producing a smaller total.
      process.stderr.write(
        `  ! no workbook found for ${book.milestone} (prefix "${book.prefix}")\n`,
      );
      continue;
    }
    const rows = sheetRows(readZip(readFileSync(join(WORKBOOK_DIR, file))));

    let section = '';
    let applicableTo = '';
    // The requirement a SECTION header carries, when it carries one. M3's "Expiry of Consent
    // Request" states `Mandatory` on the header and leaves the case row beneath it blank.
    let sectionRequirement = '';
    // Within one group a blank requirement means "as the row above" — NHA merges the cell rather
    // than repeating it, and losing that reads a merged group as unstated.
    let groupRequirement = '';

    for (const row of rows) {
      const sno = row[0] ?? '';
      const colE = (row[4] ?? '').trim();
      const colB = (row[1] ?? '').trim();
      // The id is normally in column E. M2 and M3 put it in column B for whole blocks — the seven
      // HI-type fetches, `USER_INIT_LINK_601`, `HIU_FLOW_301` — and reading only column E dropped
      // every one of them. Column B is accepted ONLY when it holds something `CASE_ID` claims, so
      // a `Function` title is never mistaken for a case.
      const idInColumnB = !colE && CASE_ID.test(colB);
      const id = colE || (idInColumnB ? colB : '');

      // A section header: a bare integer S.No, a title, and no case id of its own. This is how
      // M1–M3 mark them, and it is where `Applicable To` — the scoping that matters — lives.
      if (/^\d+$/.test(sno) && row[1] && !CASE_ID.test(id)) {
        section = row[1] ?? '';
        applicableTo = row[2] ?? '';
        sectionRequirement = REQUIREMENT_TOKEN.test(row[3] ?? '') ? (row[3] ?? '').trim() : '';
        groupRequirement = '';
        continue;
      }
      if (!CASE_ID.test(id)) {
        // Not a case — but if it LOOKS like one, this list is out of date and the matrix is
        // quietly short. Say so rather than dropping it.
        for (const candidate of [colE, colB]) {
          if (candidate && LOOKS_LIKE_ID.test(candidate))
            unmatchedIds.add(`${book.milestone}::${candidate}`);
        }
        continue;
      }

      const key = `${book.milestone}::${id}`;
      if (seen.has(key)) {
        duplicateRows += 1;
        continue;
      }
      seen.add(key);

      // A row whose id sits in column B has no requirement text of its own — column B is spent
      // on the id. Fall back to the group it belongs to, then to the section header.
      const ownStatus = idInColumnB ? '' : resolveRequirementText(row);
      if (ownStatus) groupRequirement = ownStatus;
      // Inheritance is for the LAYOUT SHIFT only. A row that simply has no requirement stays
      // unstated: NHA states the requirement once for a pair of alternates (CRT_ABHA_114/115) and
      // leaves the sibling blank on purpose, and filling that in invents a requirement.
      const statusText = idInColumnB ? groupRequirement || sectionRequirement : ownStatus;

      // M4 groups its cases differently: no numbered header row, just a `Function` in column B on
      // the first case of each group ("Facility search", "Bridge linkage", …) which then merges
      // down. Carry it forward so the breakdown is grouped by something a person can act on
      // rather than by one anonymous run of 54.
      const fn = idInColumnB ? '' : colB;
      if (fn && fn !== statusText && !REQUIREMENT_TOKEN.test(fn)) section = fn;
      cases.push({
        milestone: book.milestone,
        section,
        applicableTo,
        id,
        statusText,
        functionality: row[5] ?? '',
        testCase: row[6] ?? '',
        expected: row[8] ?? '',
        requirement: sectionExcludes(applicableTo, section, role)
          ? 'out-of-scope'
          : requirementOf(statusText, role),
      });
    }
  }
  return cases;
}

function main(): void {
  const roleArg = process.argv.find((a) => a.startsWith('--role='))?.split('=')[1];
  const role: Role = roleArg === 'government' ? 'government' : 'private';
  const cases = buildMatrix(role);

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ role, generated: cases.length, cases }, null, 2)}\n`);
    return;
  }

  const kinds: Requirement[] = ['mandatory', 'conditional', 'optional', 'unstated', 'out-of-scope'];
  const byMilestone = new Map<string, Map<Requirement, number>>();
  for (const c of cases) {
    const m = byMilestone.get(c.milestone) ?? new Map<Requirement, number>();
    m.set(c.requirement, (m.get(c.requirement) ?? 0) + 1);
    byMilestone.set(c.milestone, m);
  }

  if (unmatchedIds.size > 0) {
    // Loud, and on stderr, because a short matrix that looks complete is exactly the failure this
    // script exists to end. Add the prefix to CASE_ID — never ignore this.
    process.stderr.write(
      `\n  !! ${unmatchedIds.size} row(s) look like a case but no prefix in CASE_ID claims them.\n` +
        `     The matrix below is SHORT by that many. Add the prefix and re-run:\n` +
        `${[...unmatchedIds].map((i) => `       ${i}`).join('\n')}\n`,
    );
  }

  const pad = (s: string, n: number) => s.padEnd(n);
  process.stdout.write(`\nABDM certification matrix — applicant type: ${role.toUpperCase()}\n`);
  process.stdout.write(`Derived from ${WORKBOOK_DIR}\n`);
  if (duplicateRows > 0) {
    process.stdout.write(
      `${duplicateRows} duplicate row(s) collapsed — NHA repeats some blocks across sheets ` +
        `(HFR's Bridge linkage appears twice). Counting cases, not rows.\n`,
    );
  }
  process.stdout.write('\n');
  process.stdout.write(`${pad('milestone', 10)}${kinds.map((k) => pad(k, 14)).join('')}total\n`);

  const totals = new Map<Requirement, number>();
  for (const [milestone, counts] of byMilestone) {
    const line = kinds.map((k) => {
      const n = counts.get(k) ?? 0;
      totals.set(k, (totals.get(k) ?? 0) + n);
      return pad(String(n), 14);
    });
    const sum = kinds.reduce((a, k) => a + (counts.get(k) ?? 0), 0);
    process.stdout.write(`${pad(milestone, 10)}${line.join('')}${sum}\n`);
  }
  const grand = kinds.reduce((a, k) => a + (totals.get(k) ?? 0), 0);
  process.stdout.write(
    `${pad('TOTAL', 10)}${kinds.map((k) => pad(String(totals.get(k) ?? 0), 14)).join('')}${grand}\n\n`,
  );

  if (role === 'private') {
    const excluded = cases.filter((c) => c.requirement === 'out-of-scope').length;
    process.stdout.write(
      `${excluded} case(s) are out of scope for a private integrator — sections NHA scopes to\n` +
        `government or trusted entities. Registering as a government entity makes them mandatory:\n` +
        `re-run with --role=government to see that number.\n\n`,
    );
  }
  process.stdout.write(
    'M1-M3 count SCENARIOS ("Mandatory"/"Optional"). M4 counts FIELDS ("Yes"/"No" — is this data\n' +
      'field required). Both are things an assessor checks, but they are not the same question, and\n' +
      'adding them into one headline number would flatter M4.\n\n' +
      'A handful of cases stay "unstated" on purpose: NHA states the requirement once for a PAIR of\n' +
      'alternates (CRT_ABHA_114/115, 209/210) and leaves the sibling blank. Guessing there would\n' +
      'invent a requirement rather than read one.\n\n' +
      'This counts REQUIREMENTS, not results. It says what must be demonstrated, never what passes —\n' +
      'pass/fail is decided by NHA during functional testing, not here.\n',
  );
}

// Run only when invoked directly. `abdm-evidence.ts` imports `buildMatrix` from here, and importing
// a module must never print a report as a side effect.
if (process.argv[1]?.includes('abdm-audit')) main();
