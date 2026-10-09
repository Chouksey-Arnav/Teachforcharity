-- ===========================================================================
-- The message gate, rebuilt
--
-- private.message_violation() used to be a few regexes over lower(text), so
-- "ѕnapchat" (Cyrillic s), "s n a p", "my snap is…", "nine one nine five…",
-- "don't tell your mom" and "are you home alone" all went straight through to
-- a child. The scanner caught some of them afterwards, but only after the
-- message had been delivered.
--
-- Now:
--   1. private.gate_check(text, side) undoes the usual disguises (look-alike
--      letters, invisible characters, fullwidth/bold Unicode, leetspeak,
--      spaced or dotted letters, number words) and also blocks the messages no
--      lesson ever needs: secrecy from parents, deleting chats, "are you home
--      alone", photo requests, and (from a tutor) romantic or looks comments.
--      It is GENERATED from src/lib/safety/gate.ts so the site and the
--      database agree exactly (tested by supabase/tests/message_gate_test.sql).
--   2. Every free-text path keeps calling private.message_violation(); tutor
--      notes now say they're a tutor's.
--   3. A blocked chat message is recorded (message_blocks). A tutor trying a
--      grooming-type message, or anyone hitting the filter 3+ times in a day,
--      raises a flag for the safety team. Before, a blocked attempt vanished.
--
-- What is never blocked: a student talking about hurting themselves or saying
-- something felt wrong. Those are delivered, and the scanner alerts an adult.
-- ===========================================================================

-- BEGIN GENERATED: message gate from src/lib/safety/gate.ts. Don't edit by hand:
-- change gate.ts, then run GATE_WRITE=1 npx vitest run src/lib/safety/gate-sql.test.ts
create or replace function private.gate_views(p text)
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
  t := regexp_replace(normalize(coalesce(p, ''), NFKC), $re$[\u00ad\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]$re$, '', 'g');
  t := translate(t, 'авеёкмнорстухіїјѕԁԛԝүһӏɡАВЕКМНОРСТУХЅІЈҮαβεηικνορτυχωΑΒΕΗΙΚΜΝΟΡΤΥΧΖıłøđħ', 'abeekmhopctyxiijsdqwyhlgabekmhopctyxsijyabenikvoptuxwabehikmnoptyxzilodh');
  v_base := lower(regexp_replace(normalize(t, NFD), $re$[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]$re$, '', 'g'));
  v_base := regexp_replace(translate(v_base, '’`', ''''''), $re$[^\u0001-\u007f]$re$, ' ', 'g');

  -- Words: join spaced letters, undo leetspeak, drop punctuation, shorten stretched letters.
  loop
    v_pos := regexp_instr(v_base, $re$\y(?:[a-z0-9@$][ ._*-]){2,}[a-z0-9@$]\y$re$, v_from);
    exit when v_pos = 0;
    v_match := regexp_substr(v_base, $re$\y(?:[a-z0-9@$][ ._*-]){2,}[a-z0-9@$]\y$re$, v_from);
    v_acc := v_acc || substr(v_base, v_from, v_pos - v_from) || regexp_replace(v_match, '[ ._*-]', '', 'g');
    v_from := v_pos + length(v_match);
  end loop;
  v_words := v_acc || substr(v_base, v_from);
  select string_agg(case when x ~ '[a-z]'
           then translate(left(x, length(x) - length(coalesce(substring(x from $re$[!?.,;:)'"]+$$re$), ''))), '0134578@$!|+', 'oieastbasilt')
                || coalesce(substring(x from $re$[!?.,;:)'"]+$$re$), '')
           else x end, ' ' order by n)
    into v_words from regexp_split_to_table(v_words, '\s+') with ordinality as s (x, n);
  v_words := regexp_replace(v_words, $re$[^a-z0-9' ]+$re$, ' ', 'g');
  v_words := regexp_replace(v_words, '([a-z])\1{2,}', '\1\1', 'g');
  v_words := btrim(regexp_replace(v_words, '\s+', ' ', 'g'));
  select string_agg(coalesce('{"u":"you","ya":"you","yu":"you","ur":"your","yur":"your","r":"are","youre":"you''re","u''re":"you''re","ig":"instagram","insta":"instagram","fb":"facebook","pic":"picture","pics":"pictures","pix":"pictures","piccy":"picture","vid":"video","vids":"videos","msg":"message","msgs":"messages","convo":"conversation","convos":"conversations","txt":"text","pls":"please","plz":"please","rn":"right now","tn":"tonight","tonite":"tonight","bf":"boyfriend","gf":"girlfriend","dont":"don''t","wont":"won''t","cant":"can''t","im":"i''m","ill":"i''ll","whats":"what''s","thats":"that''s","lets":"let''s","luv":"love","wanna":"want to","gonna":"going to","sum1":"someone","no1":"no one","ppl":"people"}'::jsonb ->> x, x), ' ' order by n)
    into v_canon from regexp_split_to_table(v_words, ' ') with ordinality as s (x, n);
  v_squash := regexp_replace(v_words, '[^a-z]', '', 'g');

  -- Digits: number words → digits, "555-I234" → "5551234", then each run's groups joined by "-".
  t := v_base;
  t := regexp_replace(t, $re$\yzero\y$re$, '0', 'g');
  t := regexp_replace(t, $re$\yoh\y$re$, '0', 'g');
  t := regexp_replace(t, $re$\yone\y$re$, '1', 'g');
  t := regexp_replace(t, $re$\ytwo\y$re$, '2', 'g');
  t := regexp_replace(t, $re$\ythree\y$re$, '3', 'g');
  t := regexp_replace(t, $re$\yfour\y$re$, '4', 'g');
  t := regexp_replace(t, $re$\yfive\y$re$, '5', 'g');
  t := regexp_replace(t, $re$\ysix\y$re$, '6', 'g');
  t := regexp_replace(t, $re$\yseven\y$re$, '7', 'g');
  t := regexp_replace(t, $re$\yeight\y$re$, '8', 'g');
  t := regexp_replace(t, $re$\ynine\y$re$, '9', 'g');
  select string_agg(case when length(regexp_replace(x, '[^0-9]', '', 'g')) >= 3 then translate(x, 'oil', '011') else x end, ' ' order by n)
    into t from regexp_split_to_table(t, '\s+') with ordinality as s (x, n);
  select string_agg(regexp_replace(m[1], '[^0-9]+', '-', 'g'), ' ' order by n)
    into v_digits from regexp_matches(t, $re$[0-9]+(?:[\s._()/|+*-]{1,3}[0-9]+)*$re$, 'g') with ordinality as r (m, n);
  v_digits := ' ' || coalesce(v_digits, '') || ' ';

  return jsonb_build_object('base', v_base, 'canon', coalesce(v_canon, ''), 'squash', v_squash, 'digits', v_digits);
end $fn$;

-- The first rule the text breaks (no row when it's fine). p_side: 'tutor', 'family' or null (unknown).
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
  if v_base ~ $re$[a-z0-9._%+-]+@[a-z0-9-]+$re$ then
    rule := 'email_address'; category := 'contact'; reason := 'email addresses'; return next; return;
  end if;
  if v_base ~ $re$\y[a-z0-9._%+-]+\s*[([]?\s*at\s*[)\]]?\s*[a-z0-9-]+\s*[([]?\s*dot\s*[)\]]?\s*(?:com|net|org|edu)\y$re$ then
    rule := 'email_spelled'; category := 'contact'; reason := 'email addresses'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:gmail|hotmail|icloud|ymail|protonmail|aol mail|yahoo mail|outlook com)\y$re$ then
    rule := 'email_provider'; category := 'contact'; reason := 'email addresses'; return next; return;
  end if;
  if v_base ~ $re$(?:\+?1[\s.-]?)?\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}$re$ then
    rule := 'phone_formatted'; category := 'contact'; reason := 'phone numbers'; return next; return;
  end if;
  if v_base ~ $re$\y[2-9][0-9]{2}[.-][0-9]{4}\y$re$ then
    rule := 'phone_local'; category := 'contact'; reason := 'phone numbers'; return next; return;
  end if;
  if v_digits ~ $re$ (?:1-)?[2-9]-[0-9]-[0-9]-[2-9](?:-[0-9]){6} $re$ then
    rule := 'phone_single_digits'; category := 'contact'; reason := 'phone numbers'; return next; return;
  end if;
  if v_digits ~ $re$ (?:1-?)?[2-9][0-9][0-9]-?[2-9](?:-?[0-9]){6} $re$ then
    rule := 'phone_grouped'; category := 'contact'; reason := 'phone numbers'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:my number|your number|phone|cell|call me|text me|reach me|digits)\y$re$
     and v_digits ~ $re$ [0-9](?:-?[0-9]){6,} $re$ then
    rule := 'phone_with_cue'; category := 'contact'; reason := 'phone numbers'; return next; return;
  end if;
  if v_base ~ $re$https?://|www\.$re$ then
    rule := 'link_scheme'; category := 'contact'; reason := 'links'; return next; return;
  end if;
  if v_base ~ $re$\y[a-z0-9-]+\.(?:com|net|org|io|gg|me|app|co|us|ly|tv|xyz|link|info|biz)\y$re$ then
    rule := 'link_domain'; category := 'contact'; reason := 'links'; return next; return;
  end if;
  if v_base ~ $re$[a-z0-9-]+\s*[[({]\s*(?:\.|dot)\s*[)}\]]\s*(?:com|net|org|io|gg|me|app|co|us|ly|tv|xyz|link|info|biz)\y$re$ then
    rule := 'link_defanged'; category := 'contact'; reason := 'links'; return next; return;
  end if;
  if v_canon ~ $re$\y[a-z0-9]+ dot (?:com|net|org|io|gg|me|app|tv|xyz)\y|\ywww?\y|\ywww?[a-z0-9]|\yhttps?\y|\ybit ly\y|\ytinyurl\y$re$ then
    rule := 'link_words'; category := 'contact'; reason := 'links'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:snapchat|snap chat|instagram|tiktok|tik tok|discord|whatsapp|whats app|telegram|kik|facebook|messenger|twitter|wechat|imessage|facetime|zoom|skype|venmo|cashapp|cash app|zelle|paypal|onlyfans|groupme|google voice|signal app)\y$re$ then
    rule := 'app_name'; category := 'contact'; reason := 'outside apps, social media, or payment apps'; return next; return;
  end if;
  if v_squash ~ $re$snapchat|instagram|whatsapp|telegram|facebook|onlyfans$re$ then
    rule := 'app_name_squashed'; category := 'contact'; reason := 'outside apps, social media, or payment apps'; return next; return;
  end if;
  if v_base ~ $re$(?:^|\s)@[a-z0-9_.]{3,}$re$ then
    rule := 'handle_at'; category := 'contact'; reason := 'social media handles'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:my (?:user ?name|handle|gamertag|gamer tag|tag) is|your (?:user ?name|handle|gamertag|gamer tag))\y$re$ then
    rule := 'handle_words'; category := 'contact'; reason := 'social media handles'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:my snap|your snap|on snap|snap me|my sc|your sc|on sc|sc me|dm me|text me|call me (?:at|on|tonight|later|when|after)|message me on|add me on|add me at|hit me up|my cell|your cell|my phone number|your phone number|my number is|what's your number|facetime me|email me|my email|your email)\y$re$ then
    rule := 'offsite_ask'; category := 'contact'; reason := 'requests to talk somewhere other than this site'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:meet up|meet me at|meet you at|meet (?:up )?in person|in person lessons?|lessons? in person)\y$re$
     and not v_canon ~ $re$\y(?:lesson link|the link|google meet|the meet|meet link|online|on here|on the site|waiting room)\y$re$ then
    rule := 'meet_up'; category := 'meetup'; reason := 'in-person meetups (lessons are online only)'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:irl|in real life|come over|my house|your house|my place|my address|your address|home address|pick you up|give you a ride|sleep ?over|hang out|hangout|come to my|visit you|drive you)\y$re$ then
    rule := 'meet_visit'; category := 'meetup'; reason := 'in-person meetups (lessons are online only)'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:fuck\w*|fck\w*|phuck\w*|fuk\w*|shit\w*|bitch\w*|asshole\w*|dick|dicks|pussy|cunt\w*|nigg\w*|fag\w*|retard\w*|slut\w*|whore\w*|porn\w*|nude|nudes|noodz|nudez|naked|sex|sexy|sexual\w*|kys|kill yourself)\y$re$ then
    rule := 'bad_language'; category := 'language'; reason := 'language that is not allowed'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:(?:don't|do not|never) tell (?:your|anyone|anybody|no one|nobody)|without your (?:mom|mum|mother|dad|father|parents|parent|family|guardian|guardians) knowing)\y$re$ then
    rule := 'secret_tell'; category := 'secrecy'; reason := 'requests to keep secrets from parents or delete messages'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:our (?:little )?secret|keep (?:this|it|that|this chat|our chats?|our messages|our talks?|our conversations?) (?:a )?(?:secret|private|to yourself|between us)|just between us|between the two of us|stays between us|(?:no one|nobody) (?:needs|has) to know)\y$re$ then
    rule := 'secret_keep'; category := 'secrecy'; reason := 'requests to keep secrets from parents or delete messages'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:(?:delete|erase|wipe|clear) (?:all )?(?:of )?(?:this |these |the |our |those |that |my |your )?(?:message|messages|chat|chats|conversation|conversations|dms|history))\y$re$ then
    rule := 'secret_delete'; category := 'secrecy'; reason := 'requests to keep secrets from parents or delete messages'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:are you (?:home )?alone|home alone|by yourself right now|is (?:anyone|anybody) (?:else )?(?:home|in the house|there with you))\y$re$ then
    rule := 'probe_alone'; category := 'probe'; reason := 'personal questions about being home alone, parents’ whereabouts, or where someone lives'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:(?:are|is) your (?:mom|mum|mother|dad|father|parents|parent|family|guardian|guardians) (?:home|around|there|asleep|awake|out|away|gone|at work)|when (?:do|does) your (?:mom|mum|mother|dad|father|parents|parent|family|guardian|guardians) (?:go to (?:bed|sleep|work)|leave|get home))\y$re$
     and not v_canon ~ $re$\y(?:lesson|lessons|join|sign|consent|form|say hi|meet them|nearby)\y$re$ then
    rule := 'probe_parents'; category := 'probe'; reason := 'personal questions about being home alone, parents’ whereabouts, or where someone lives'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:is your (?:bedroom |room )?door (?:locked|closed|shut)|lock your door|show me your (?:room|bedroom|bed))\y$re$ then
    rule := 'probe_room'; category := 'probe'; reason := 'personal questions about being home alone, parents’ whereabouts, or where someone lives'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:where do you live|what's your address|what street do you live|which house is yours)\y$re$ then
    rule := 'probe_where'; category := 'probe'; reason := 'personal questions about being home alone, parents’ whereabouts, or where someone lives'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:(?:send|show|take|snap|post|text) (?:me |us )?(?:a |some |another |more |the )?(?:picture|pictures|photo|photos|selfie|selfies) of (?:you|yourself)|selfie|selfies)\y$re$
     and not v_canon ~ $re$\y(?:play|plays|playing|practice|practicing|perform|performing|hold|holding|posture|hand|hands|finger|fingers|fingering|embouchure|bow|bowing|setup|instrument|stand|sheet|music|score|reed|mouthpiece|sticks|grip|page|part|assignment)\y$re$ then
    rule := 'photo_of_you'; category := 'photo'; reason := 'requests for photos of a person (photos of playing or sheet music are fine)'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:(?:picture|pictures|photo|photos) of your (?:body|legs|chest|feet)|take (?:off )?your (?:clothes|shirt|pants)|in your (?:underwear|bra))\y$re$ then
    rule := 'photo_body'; category := 'photo'; reason := 'requests for photos of a person (photos of playing or sheet music are fine)'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:what are you wearing|what you're wearing|in your (?:pajamas|pjs|bed))\y$re$
     and not v_canon ~ $re$\y(?:concert|recital|performance|perform|uniform|audition|gig|competition|black)\y$re$ then
    rule := 'photo_wearing'; category := 'photo'; reason := 'requests for photos of a person (photos of playing or sheet music are fine)'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:i love you|i miss you|thinking about you|can't stop thinking about you|kiss you|be my (?:girlfriend|boyfriend)|date me|go out with me|my favorite student|special to me)\y$re$
     and p_side = 'tutor' then
    rule := 'affection_love'; category := 'affection'; reason := 'comments on someone’s looks or romantic language'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:(?:you're|you are|you look|you looked|your so) (?:so |really |very |super |honestly |kinda |lowkey )*(?:cute|pretty|beautiful|gorgeous|hot|sexy|attractive|handsome|adorable)|mature for your age|you have (?:the )?(?:prettiest|cutest|nicest|most beautiful) (?:smile|eyes|face|hair))\y$re$
     and p_side = 'tutor' then
    rule := 'affection_looks'; category := 'affection'; reason := 'comments on someone’s looks or romantic language'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:gift ?cards?|robux|v ?bucks|i'll pay you|i will pay you|pay me|send you money|send me money|buy you (?:a|something|anything)|i'll buy you)\y$re$
     and not v_canon ~ $re$\y(?:pay you back|pay me back)\y$re$ then
    rule := 'money_gifts'; category := 'money'; reason := 'gifts or money (lessons are always free)'; return next; return;
  end if;
  if v_canon ~ $re$\y(?:your password|send me (?:the |your )?code|verify your account|login code|free robux|free vbucks)\y$re$ then
    rule := 'scam_codes'; category := 'scam'; reason := 'requests for passwords or login codes'; return next; return;
  end if;
end $fn$;
-- END GENERATED: message gate

-- Why the text can't be sent (null when it can). p_side: who wrote it ('tutor', 'family'), or null if unknown.
create or replace function private.message_violation(p text, p_side text)
returns text language sql immutable set search_path = '' as $$
  select reason from private.gate_check(p, p_side)
$$;

-- Unknown author: every rule except the tutor-only ones.
create or replace function private.message_violation(p text)
returns text language sql immutable set search_path = '' as $$
  select private.message_violation(p, null)
$$;

revoke execute on function private.gate_views(text), private.gate_check(text, text), private.message_violation(text, text)
  from public, anon, authenticated;

-- ---- Tutors' notes to families are checked as a tutor's words ----
select private.patch_function('public.tutor_offer(uuid,uuid,text)'::regprocedure,
  $o$private.message_violation(v_note)$o$, $n$private.message_violation(v_note, 'tutor')$n$);
select private.patch_function('public.tutor_propose_session(uuid,uuid,timestamp with time zone,integer,text,integer,boolean)'::regprocedure,
  $o$private.message_violation(v_note)$o$, $n$private.message_violation(v_note, 'tutor')$n$);
select private.patch_function('public.log_session(uuid,boolean,text,text,boolean)'::regprocedure,
  $o$private.message_violation(v_practice)$o$, $n$private.message_violation(v_practice, 'tutor')$n$);

-- ===========================================================================
-- Blocked attempts
-- ===========================================================================
create table public.message_blocks (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.threads (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  side text not null check (side in ('tutor', 'family')),
  rule text not null check (char_length(rule) <= 60),
  category text not null check (char_length(category) <= 40),
  reason text not null check (char_length(reason) <= 200),
  body text not null check (char_length(body) <= 800),
  created_at timestamptz not null default now()
);
create index message_blocks_sender_idx on public.message_blocks (sender_id, created_at desc);
create index message_blocks_thread_idx on public.message_blocks (thread_id, created_at desc);

alter table public.message_blocks enable row level security;
-- The sender reads their own (the site shows why it wasn't sent); admins read all.
create policy "senders and admins read message blocks" on public.message_blocks for select to authenticated
  using (sender_id = (select auth.uid()) or (select private.is_admin()));
grant select on public.message_blocks to authenticated;

-- Records a blocked chat message and, when it's worth a person's time, flags it:
--   - a tutor trying secrecy, personal probing, photo requests or romance → high
--   - 3+ blocked messages from one person in 24 hours (someone testing the filter)
--     → high for a tutor, medium for a family
-- One flag per person per conversation per day, so a new day's attempts are
-- seen even if an earlier flag was dismissed.
create or replace function private.record_message_block(p_thread uuid, p_sender uuid, p_side text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g record;
  v_recent int;
  v_serious boolean;
  v_severity text;
begin
  select * into g from private.gate_check(p_body, p_side);
  if g.rule is null then return; end if;
  insert into public.message_blocks (thread_id, sender_id, side, rule, category, reason, body)
  values (p_thread, p_sender, p_side, g.rule, g.category, g.reason, left(p_body, 800));

  select count(*) into v_recent from public.message_blocks where sender_id = p_sender and created_at > now() - interval '24 hours';
  v_serious := p_side = 'tutor' and g.category in ('secrecy', 'probe', 'photo', 'affection');
  if not v_serious and v_recent < 3 then return; end if;
  v_severity := case when v_serious or p_side = 'tutor' then 'high' else 'medium' end;

  perform public.moderation_apply(null, jsonb_build_array(jsonb_build_object(
    'source_type', 'thread',
    'source_id', p_thread || ':blocked:' || p_sender || ':' || to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD'),
    'thread_id', p_thread,
    'author_id', p_sender,
    'category', 'blocked_attempts',
    'severity', v_severity,
    'score', case when v_severity = 'high' then 7.5 else 5 end,
    'evidence', (select coalesce(jsonb_agg(jsonb_build_object('rule', b.rule, 'reason', b.reason, 'text', left(b.body, 200), 'at', b.created_at)
                   order by b.created_at desc), '[]'::jsonb)
                 from (select * from public.message_blocks where sender_id = p_sender and thread_id = p_thread
                       order by created_at desc limit 8) b),
    'excerpt', format('%s blocked message%s from the %s in 24 hours. Latest: “%s”', v_recent, case when v_recent = 1 then '' else 's' end,
                      p_side, left(p_body, 400)),
    'actions', '[]'::jsonb)), null);
end $$;
revoke execute on function private.record_message_block(uuid, uuid, text, text) from public, anon, authenticated;

-- send_message: a blocked message is recorded and nothing is sent. It returns
-- NULL (instead of raising, which would roll the record back); the site reads
-- the reason from message_blocks.
select private.patch_function('public.send_message(uuid,text,text)'::regprocedure,
  $o$    v_violation := private.message_violation(v_body);
    if v_violation is not null then
      raise exception 'For everyone''s safety, messages can''t include %. Keep all contact inside Teach for a Cause.', v_violation
        using hint = 'MESSAGE_BLOCKED';
    end if;$o$,
  $n$    v_violation := private.message_violation(v_body, v_side);
    if v_violation is not null then
      if (select count(*) from public.message_blocks where sender_id = v_uid and created_at > now() - interval '10 minutes') >= 20 then
        raise exception 'You''re sending messages quickly. Please wait a few minutes.' using hint = 'RATE_LIMIT';
      end if;
      perform private.record_message_block(th.id, v_uid, v_side, v_body);
      return null;
    end if;$n$);

-- Kept for 180 days, like other safety records the team reviews.
create or replace function private.purge_message_blocks()
returns void language sql security definer set search_path = '' as $$
  delete from public.message_blocks where created_at < now() - interval '180 days'
$$;
revoke execute on function private.purge_message_blocks() from public, anon, authenticated;
select cron.schedule('tfac-message-blocks-retention', '29 6 * * *', $$select private.purge_message_blocks()$$);
