with u as (select id from public.profiles where email like '%@tfac-e2e.test')
, a as (delete from public.audit_log where actor_id in (select id from u) or target_id in (select id::text from u) returning 1)
, i as (delete from public.incidents where reporter_id in (select id from u) or tutor_id in (select id from u) returning 1)
, e as (delete from public.email_outbox where to_email like '%tfac-e2e.test' returning 1)
select (select count(*) from a) + (select count(*) from i) + (select count(*) from e) as removed;
delete from auth.users where email like '%@tfac-e2e.test';
