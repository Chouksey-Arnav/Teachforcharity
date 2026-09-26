-- Teach for a Cause — storage, realtime, scheduled jobs, and seed data.

-- ---------------------------------------------------------------------------
-- Profile photos. Public-read by unguessable URL; writable only inside the
-- uploader's own folder: avatars/<user id>/<random>.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "avatar owners read their folder" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar owners upload to their folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar owners update their folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar owners delete from their folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Realtime (RLS still applies to every change a client receives)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.threads;
alter publication supabase_realtime add table public.sessions;

-- ---------------------------------------------------------------------------
-- Scheduled maintenance: expire stale requests, queue reminders.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
select cron.schedule('tfac-maintenance', '*/15 * * * *', $$select private.run_maintenance()$$);

-- ---------------------------------------------------------------------------
-- Instruments (band + orchestra). Families can type anything else; unknown
-- names become custom instruments an admin can tidy up later.
-- ---------------------------------------------------------------------------
insert into public.subjects (slug, name, family, aliases) values
  ('flute', 'Flute', 'woodwind', '{flutes}'),
  ('piccolo', 'Piccolo', 'woodwind', '{}'),
  ('oboe', 'Oboe', 'woodwind', '{}'),
  ('english-horn', 'English Horn', 'woodwind', '{"cor anglais"}'),
  ('bassoon', 'Bassoon', 'woodwind', '{contrabassoon}'),
  ('clarinet', 'Clarinet', 'woodwind', '{"bb clarinet","b flat clarinet","b-flat clarinet","eb clarinet"}'),
  ('bass-clarinet', 'Bass Clarinet', 'woodwind', '{"contra clarinet","contrabass clarinet","alto clarinet"}'),
  ('alto-saxophone', 'Alto Saxophone', 'woodwind', '{"alto sax",sax,saxophone,saxophones}'),
  ('tenor-saxophone', 'Tenor Saxophone', 'woodwind', '{"tenor sax"}'),
  ('baritone-saxophone', 'Baritone Saxophone', 'woodwind', '{"bari sax","baritone sax","bari saxophone"}'),
  ('soprano-saxophone', 'Soprano Saxophone', 'woodwind', '{"soprano sax"}'),
  ('trumpet', 'Trumpet', 'brass', '{cornet,flugelhorn,"bb trumpet"}'),
  ('french-horn', 'French Horn', 'brass', '{horn,"f horn","mellophone"}'),
  ('trombone', 'Trombone', 'brass', '{"tenor trombone",bone}'),
  ('bass-trombone', 'Bass Trombone', 'brass', '{}'),
  ('euphonium', 'Euphonium', 'brass', '{baritone,"baritone horn",euph}'),
  ('tuba', 'Tuba', 'brass', '{sousaphone}'),
  ('percussion', 'Concert Percussion', 'percussion', '{drums,drum,snare,"snare drum"}'),
  ('mallets', 'Mallet Percussion', 'percussion', '{marimba,xylophone,vibraphone,vibes,bells,glockenspiel,mallet}'),
  ('timpani', 'Timpani', 'percussion', '{timps,"kettle drums"}'),
  ('drum-set', 'Drum Set', 'percussion', '{"drum kit",drumset,"jazz drums"}'),
  ('violin', 'Violin', 'strings', '{fiddle}'),
  ('viola', 'Viola', 'strings', '{}'),
  ('cello', 'Cello', 'strings', '{violoncello}'),
  ('double-bass', 'Double Bass', 'strings', '{"upright bass","string bass",bass,contrabass,"stand up bass"}'),
  ('harp', 'Harp', 'strings', '{}'),
  ('piano', 'Piano', 'keyboard', '{keyboard,keys,"jazz piano"}'),
  ('guitar', 'Guitar', 'strings', '{"jazz guitar","electric guitar","acoustic guitar"}'),
  ('bass-guitar', 'Bass Guitar', 'strings', '{"electric bass","bass guitar"}');

-- ---------------------------------------------------------------------------
-- Quick messages
-- ---------------------------------------------------------------------------
insert into public.message_templates (key, audience, label, body, sort_order) values
  ('family_intro', 'family', 'Say hello', 'Hi! We''re excited to get started and looking forward to working with you.', 10),
  ('family_suggest_time', 'family', 'Ask for a time', 'Could you suggest a time that works for you this week? You can send it as a lesson request.', 20),
  ('family_running_late', 'family', 'Running late', 'We''re running about 5 minutes late — we''ll join the Meet shortly.', 30),
  ('family_reschedule', 'family', 'Need to reschedule', 'Something came up and we need to reschedule. We''ll send a new request soon.', 40),
  ('family_practice_q', 'family', 'What to practice?', 'What should we focus on practicing before the next lesson?', 50),
  ('family_materials', 'family', 'Materials?', 'Is there any music or material we should have ready for the next lesson?', 60),
  ('family_thanks', 'family', 'Say thank you', 'Thank you for the lesson today!', 70),
  ('tutor_welcome', 'tutor', 'Welcome', 'Hi! I''m looking forward to our lessons. Please have your instrument, a pencil, and any music you''re working on ready.', 10),
  ('tutor_joining', 'tutor', 'Meet is open', 'The Google Meet is open — I''m ready whenever you are.', 20),
  ('tutor_running_late', 'tutor', 'Running late', 'I''m running about 5 minutes late — I''ll be on the Meet shortly.', 30),
  ('tutor_reschedule', 'tutor', 'Need to reschedule', 'I need to reschedule our lesson. I''ll suggest a new time.', 40),
  ('tutor_practice', 'tutor', 'Practice plan', 'Before our next lesson, try to practice 15–20 minutes a day on what we worked on.', 50),
  ('tutor_materials', 'tutor', 'Bring your music', 'Please have the music you''re working on in band or orchestra ready for our next lesson.', 60),
  ('tutor_great_work', 'tutor', 'Great work', 'Great work today! Keep practicing what we covered — you''re making real progress.', 70),
  ('both_sounds_good', 'both', 'Sounds good', 'Sounds good — see you then!', 80),
  ('both_other_time', 'both', 'Try another time', 'Sorry, that time doesn''t work for us. Could we try another time?', 90);

-- ---------------------------------------------------------------------------
-- Current partner / cause. Links are left empty on purpose until the partner
-- confirms them — an admin fills these in from the dashboard.
-- ---------------------------------------------------------------------------
insert into public.partners (name, short_name, cause_title, cause_description, is_current, partnership_confirmed)
values ('Dedicated to Our Community of North Carolina', 'DOC NC',
        'Community initiatives across North Carolina',
        'DOC NC runs community service initiatives across North Carolina. Details about the current cause will be posted here.',
        true, false);
