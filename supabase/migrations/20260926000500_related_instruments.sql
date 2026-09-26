-- Related instruments: a tutor who plays a closely related instrument (e.g. alto
-- sax for a clarinet student) can be requested when no exact match exists.
-- Mirrors RELATED_GROUPS in src/lib/matching/index.ts.
alter table public.subjects add column related_group text check (related_group ~ '^[a-z_]+$');

update public.subjects set related_group = g.grp from (values
  ('flute', 'flutes'), ('piccolo', 'flutes'),
  ('oboe', 'double_reed_oboe'), ('english-horn', 'double_reed_oboe'),
  ('clarinet', 'single_reed'), ('bass-clarinet', 'single_reed'), ('alto-saxophone', 'single_reed'),
  ('tenor-saxophone', 'single_reed'), ('baritone-saxophone', 'single_reed'), ('soprano-saxophone', 'single_reed'),
  ('trombone', 'low_brass'), ('bass-trombone', 'low_brass'), ('euphonium', 'low_brass'), ('tuba', 'low_brass'),
  ('percussion', 'percussion'), ('mallets', 'percussion'), ('timpani', 'percussion'), ('drum-set', 'percussion'),
  ('violin', 'upper_strings'), ('viola', 'upper_strings'),
  ('cello', 'low_strings'), ('double-bass', 'low_strings'),
  ('guitar', 'guitars'), ('bass-guitar', 'guitars')
) as g(slug, grp) where subjects.slug = g.slug;

create or replace function private.tutor_can_teach(p_tutor uuid, p_subject uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tutor_subjects ts
    join public.subjects a on a.id = ts.subject_id
    join public.subjects b on b.id = p_subject
    where ts.tutor_id = p_tutor
      and (ts.subject_id = p_subject or (a.related_group is not null and a.related_group = b.related_group))
  )
$$;
revoke execute on function private.tutor_can_teach(uuid, uuid) from public, anon, authenticated;

-- request_session: accept the exact instrument OR a related one.
do $$
declare
  def text;
  old_check constant text := 'if not exists (select 1 from public.tutor_subjects where tutor_id = p_tutor and subject_id = p_subject) then';
begin
  select pg_get_functiondef('public.request_session(uuid,uuid,uuid,timestamptz,integer,text)'::regprocedure) into def;
  if position(old_check in def) = 0 then
    raise exception 'request_session no longer contains the expected subject check';
  end if;
  execute replace(def, old_check, 'if not private.tutor_can_teach(p_tutor, p_subject) then');
end $$;
