do $$
declare r record;
begin
  for r in select * from (values
    ('e2e-family@tfac-e2e.test', '{"role":"family","full_name":"Pat Parent"}'::jsonb),
    ('e2e-tutor@tfac-e2e.test', '{"role":"tutor","full_name":"Maya Rodriguez"}'::jsonb),
    ('e2e-tutor2@tfac-e2e.test', '{"role":"tutor","full_name":"Sam Okafor"}'::jsonb),
    ('e2e-admin@tfac-e2e.test', '{"role":"family","full_name":"Ari Admin"}'::jsonb)
  ) as t(email, meta)
  loop
    with u as (
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', r.email,
        extensions.crypt('E2eTest-2026', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', r.meta, now(), now(), '', '', '', '')
      returning id, email
    )
    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    select gen_random_uuid(), u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', u.id::text, now(), now(), now() from u;
  end loop;
  update public.profiles set role = 'admin' where email = 'e2e-admin@tfac-e2e.test';
end $$;
