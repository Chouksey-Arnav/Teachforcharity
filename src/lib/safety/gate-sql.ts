/**
 * Writes the database copy of the message gate (src/lib/safety/gate.ts) as
 * SQL, and the database test that holds it to the same corpus. Nothing here
 * runs in the app: gate-sql.test.ts checks that the newest migration contains
 * exactly this output, and with GATE_WRITE=1 writes it:
 *
 *   GATE_WRITE=1 npx vitest run src/lib/safety/gate-sql.test.ts
 */
import { DIGIT_RUN, GATE_RULES, HOMOGLYPHS, INVISIBLE, LEET, MARKS, NON_ASCII, NUMBER_WORDS, SLANG, SPACED, TRAILING, gateCheck, gateViews, type GateView } from "./gate";
import { ATTACKS, LESSON_TALK, type GateCase } from "./__eval__/gate-corpus";

export const BEGIN = "-- BEGIN GENERATED: message gate";
export const END = "-- END GENERATED: message gate";

/** A JavaScript pattern from gate.ts as a Postgres ARE: word boundaries are \y, and digits are ASCII only. */
export function toPg(re: string): string {
  return re.replace(/\\b/g, "\\y").replace(/\\d/g, "[0-9]");
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const dq = (s: string, tag = "re") => {
  if (s.includes(`$${tag}$`)) throw new Error(`can't dollar-quote ${s}`);
  return `$${tag}$${s}$${tag}$`;
};

function translatePair(map: Record<string, string>): [string, string] {
  const from = Object.keys(map);
  for (const k of from) if ([...k].length !== 1 || [...map[k]].length !== 1) throw new Error(`translate() needs single characters: ${k} → ${map[k]}`);
  return [from.join(""), from.map((k) => map[k]).join("")];
}

export function renderGateSql(): string {
  const [hFrom, hTo] = translatePair(HOMOGLYPHS);
  const [lFrom, lTo] = translatePair(LEET);
  const slang = JSON.stringify(SLANG);
  const numberWords = Object.entries(NUMBER_WORDS)
    .map(([k, v]) => `  t := regexp_replace(t, ${dq(toPg(`\\b${k}\\b`))}, ${lit(v)}, 'g');`)
    .join("\n");

  const views = `create or replace function private.gate_views(p text)
returns jsonb language plpgsql immutable set search_path = '' as $fn$
declare
  t text;
  v_base text;
  v_words text;
  v_canon text;
  v_squash text;
  v_digits text;
  v_pos int;
  v_from int := 1;
  v_match text;
  v_acc text := '';
begin
  t := regexp_replace(normalize(coalesce(p, ''), NFKC), ${dq(INVISIBLE)}, '', 'g');
  t := translate(t, ${lit(hFrom)}, ${lit(hTo)});
  v_base := lower(regexp_replace(normalize(t, NFD), ${dq(MARKS)}, '', 'g'));
  v_base := regexp_replace(translate(v_base, ${lit("’`")}, ${lit("''")}), ${dq(NON_ASCII)}, ' ', 'g');

  -- Words: join spaced letters, undo leetspeak, drop punctuation, shorten stretched letters.
  loop
    v_pos := regexp_instr(v_base, ${dq(toPg(SPACED))}, v_from);
    exit when v_pos = 0;
    v_match := regexp_substr(v_base, ${dq(toPg(SPACED))}, v_from);
    v_acc := v_acc || substr(v_base, v_from, v_pos - v_from) || regexp_replace(v_match, '[ ._*-]', '', 'g');
    v_from := v_pos + length(v_match);
  end loop;
  v_words := v_acc || substr(v_base, v_from);
  select string_agg(case when x ~ '[a-z]'
           then translate(left(x, length(x) - length(coalesce(substring(x from ${dq(TRAILING)}), ''))), ${lit(lFrom)}, ${lit(lTo)})
                || coalesce(substring(x from ${dq(TRAILING)}), '')
           else x end, ' ' order by n)
    into v_words from regexp_split_to_table(v_words, '\\s+') with ordinality as s (x, n);
  v_words := regexp_replace(v_words, ${dq("[^a-z0-9' ]+")}, ' ', 'g');
  v_words := regexp_replace(v_words, '([a-z])\\1{2,}', '\\1\\1', 'g');
  v_words := btrim(regexp_replace(v_words, '\\s+', ' ', 'g'));
  select string_agg(coalesce(${lit(slang)}::jsonb ->> x, x), ' ' order by n)
    into v_canon from regexp_split_to_table(v_words, ' ') with ordinality as s (x, n);
  v_squash := regexp_replace(v_words, '[^a-z]', '', 'g');

  -- Digits: number words → digits, "555-I234" → "5551234", then each run's groups joined by "-".
  t := v_base;
${numberWords}
  select string_agg(case when length(regexp_replace(x, '[^0-9]', '', 'g')) >= 3 then translate(x, 'oil', '011') else x end, ' ' order by n)
    into t from regexp_split_to_table(t, '\\s+') with ordinality as s (x, n);
  select string_agg(regexp_replace(m[1], '[^0-9]+', '-', 'g'), ' ' order by n)
    into v_digits from regexp_matches(t, ${dq(toPg(DIGIT_RUN))}, 'g') with ordinality as r (m, n);
  v_digits := ' ' || coalesce(v_digits, '') || ' ';

  return jsonb_build_object('base', v_base, 'canon', coalesce(v_canon, ''), 'squash', v_squash, 'digits', v_digits);
end $fn$;`;

  const col = (view: GateView) => `v_${view}`;
  const checks = GATE_RULES.map((r) => {
    const cond = [`${col(r.view)} ~ ${dq(toPg(r.pattern))}`];
    if (r.unless) cond.push(`not ${col(r.view)} ~ ${dq(toPg(r.unless))}`);
    if (r.also) cond.push(`${col(r.also.view)} ~ ${dq(toPg(r.also.pattern))}`);
    if (r.side) cond.push(`p_side = ${lit(r.side)}`);
    return `  if ${cond.join("\n     and ")} then
    rule := ${lit(r.id)}; category := ${lit(r.category)}; reason := ${lit(r.reason)}; return next; return;
  end if;`;
  }).join("\n");

  const check = `-- The first rule the text breaks (no row when it's fine). p_side: 'tutor', 'family' or null (unknown).
create or replace function private.gate_check(p text, p_side text)
returns table (rule text, category text, reason text) language plpgsql immutable set search_path = '' as $fn$
declare
  v jsonb;
  v_base text;
  v_canon text;
  v_squash text;
  v_digits text;
begin
  if coalesce(p, '') = '' then return; end if;
  v := private.gate_views(p);
  v_base := v ->> 'base';
  v_canon := v ->> 'canon';
  v_squash := v ->> 'squash';
  v_digits := v ->> 'digits';
${checks}
end $fn$;`;

  return `${BEGIN} from src/lib/safety/gate.ts. Don't edit by hand:
-- change gate.ts, then run GATE_WRITE=1 npx vitest run src/lib/safety/gate-sql.test.ts
${views}

${check}
${END}`;
}

/** supabase/tests/message_gate_test.sql: the corpus, and the exact views TypeScript computes, checked in the database. */
export function renderGateTestSql(): string {
  const cases: (GateCase & { expect: string | null })[] = [...ATTACKS, ...LESSON_TALK].map((c) => ({ ...c, expect: gateCheck(c.text, c.side)?.id ?? null }));
  const lines = cases.map((c) => {
    const side = c.side ? lit(c.side) : "null";
    const views = JSON.stringify(gateViews(c.text));
    return `  perform pg_temp.expect(${dq(c.text, "t")}, ${side}, ${c.expect ? lit(c.expect) : "null"}, ${dq(views, "v")});`;
  });
  return `-- GENERATED by src/lib/safety/gate-sql.ts from src/lib/safety/__eval__/gate-corpus.ts. Don't edit by hand.
-- The database message gate must agree with the TypeScript one on every case:
-- the same rule (or none), and the same normalized views of the text.
--
--   Success looks like:  ERROR: ALL MESSAGE GATE TESTS PASSED (rolled back): N cases
--   Failure looks like:  ERROR: FAIL message gate: ...

create or replace function pg_temp.expect(p_text text, p_side text, p_rule text, p_views text)
returns void language plpgsql as $fn$
declare
  v_rule text;
  v_views jsonb;
begin
  select rule into v_rule from private.gate_check(p_text, p_side);
  if v_rule is distinct from p_rule then
    raise exception 'FAIL message gate: % (side %) gave rule %, TypeScript gave %', p_text, p_side, v_rule, p_rule;
  end if;
  v_views := private.gate_views(p_text);
  if v_views <> p_views::jsonb then
    raise exception 'FAIL message gate views for %: database % / TypeScript %', p_text, v_views, p_views;
  end if;
  if (private.message_violation(p_text, p_side) is null) <> (p_rule is null) then
    raise exception 'FAIL message_violation disagrees with gate_check for %', p_text;
  end if;
end $fn$;

do $test$
begin
${lines.join("\n")}
  raise exception 'ALL MESSAGE GATE TESTS PASSED (rolled back): ${cases.length} cases';
end
$test$;
`;
}
