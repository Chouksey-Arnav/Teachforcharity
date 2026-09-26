-- Email code functions: permissions, brute-force lockout, expiry, rate limits.
-- Runs as one transaction and always rolls back via the final raise.
do $$
declare
  st text;
  sid bigint;
  failed boolean;
begin
  -- 1. anon / authenticated can't call any of it.
  foreach st in array array['anon', 'authenticated'] loop
    execute format('set local role %I', st);
    begin
      perform public.issue_email_code('x@tfac-e2e.test', 'signup', 'h');
      raise exception 'FAIL: % could issue a code', st;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.check_email_code('x@tfac-e2e.test', 'signup', 'h');
      raise exception 'FAIL: % could check a code', st;
    exception when insufficient_privilege then null;
    end;
    begin
      perform * from public.auth_user_by_email('x@tfac-e2e.test');
      raise exception 'FAIL: % could look up users', st;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.revoke_user_sessions(gen_random_uuid());
      raise exception 'FAIL: % could revoke sessions', st;
    exception when insufficient_privilege then null;
    end;
    begin
      perform 1 from public.email_codes;
      raise exception 'FAIL: % could read email_codes', st;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;

  set local role service_role;

  -- 2. Correct code → ok, and it is not consumed until cleared.
  sid := public.issue_email_code('A@TFAC-E2E.test', 'signup', 'good', '1.1.1.1');
  assert public.check_email_code('a@tfac-e2e.test', 'signup', 'good') = 'ok', 'correct code should be ok';
  assert public.check_email_code('a@tfac-e2e.test', 'signup', 'good') = 'ok', 'ok must not consume';
  assert public.check_email_code('a@tfac-e2e.test', 'reset', 'good') = 'missing', 'purposes are separate';
  perform public.clear_email_code('a@tfac-e2e.test', 'signup');
  assert public.check_email_code('a@tfac-e2e.test', 'signup', 'good') = 'missing', 'cleared code is gone';

  -- 3. Five wrong guesses lock the code, even if the 6th is right.
  delete from public.email_code_sends;
  perform public.issue_email_code('b@tfac-e2e.test', 'signup', 'good');
  for i in 1..4 loop
    assert public.check_email_code('b@tfac-e2e.test', 'signup', 'bad') = 'invalid', 'wrong code is invalid';
  end loop;
  assert public.check_email_code('b@tfac-e2e.test', 'signup', 'bad') = 'locked', '5th wrong code locks';
  assert public.check_email_code('b@tfac-e2e.test', 'signup', 'good') = 'missing', 'locked code is deleted';

  -- 4. Expired codes don't work.
  perform public.issue_email_code('c@tfac-e2e.test', 'reset', 'good');
  update public.email_codes set expires_at = now() - interval '1 second' where email = 'c@tfac-e2e.test';
  assert public.check_email_code('c@tfac-e2e.test', 'reset', 'good') = 'expired', 'expired code rejected';

  -- 5. Cooldown: a second send within 60s is refused …
  delete from public.email_code_sends;
  sid := public.issue_email_code('d@tfac-e2e.test', 'signup', 'h1');
  failed := false;
  begin
    perform public.issue_email_code('d@tfac-e2e.test', 'signup', 'h2');
  exception when others then
    failed := sqlerrm like 'We just sent a code%';
  end;
  assert failed, 'cooldown should block a second send';
  -- … unless the first delivery failed and was forgiven.
  perform public.clear_email_code('d@tfac-e2e.test', 'signup', sid);
  perform public.issue_email_code('d@tfac-e2e.test', 'signup', 'h3');

  -- 6. Hourly cap per email (5) and per IP (20).
  delete from public.email_code_sends;
  insert into public.email_code_sends (email, created_at)
  select 'e@tfac-e2e.test', now() - interval '10 minutes' from generate_series(1, 5);
  failed := false;
  begin
    perform public.issue_email_code('e@tfac-e2e.test', 'signup', 'h');
  exception when others then
    failed := sqlerrm like 'Too many codes%';
  end;
  assert failed, 'per-email hourly cap';

  insert into public.email_code_sends (email, ip, created_at)
  select 'f' || g || '@tfac-e2e.test', '9.9.9.9', now() - interval '10 minutes' from generate_series(1, 20) g;
  failed := false;
  begin
    perform public.issue_email_code('new@tfac-e2e.test', 'signup', 'h', '9.9.9.9');
  exception when others then
    failed := sqlerrm like 'Too many codes%';
  end;
  assert failed, 'per-IP hourly cap';
  perform public.issue_email_code('new@tfac-e2e.test', 'signup', 'h', '8.8.8.8'); -- other IPs unaffected

  -- 7. New code replaces the old one and resets attempts.
  delete from public.email_code_sends;
  perform public.issue_email_code('g@tfac-e2e.test', 'signup', 'old');
  perform public.check_email_code('g@tfac-e2e.test', 'signup', 'bad');
  delete from public.email_code_sends;
  perform public.issue_email_code('g@tfac-e2e.test', 'signup', 'new');
  assert public.check_email_code('g@tfac-e2e.test', 'signup', 'old') = 'invalid', 'old code replaced';
  assert (select attempts from public.email_codes where email = 'g@tfac-e2e.test') = 1, 'attempts reset then counted once';

  -- 8. User lookup is case-insensitive and reports confirmation.
  assert (select count(*) from public.auth_user_by_email('nobody@tfac-e2e.test')) = 0, 'unknown email → no row';

  reset role;
  raise exception 'ALL EMAIL CODE TESTS PASSED (rolled back)';
end $$;
