update public.sessions set start_at = now() - interval '3 hours', end_at = now() - interval '3 hours' + interval '45 minutes'
where status = 'scheduled' and tutor_id = (select id from public.profiles where email = 'e2e-tutor@tfac-e2e.test');
