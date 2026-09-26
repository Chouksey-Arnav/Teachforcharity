# Browser end-to-end tests

Drives the real site in Chromium against a real Supabase project: two tutors and a family onboard through the questionnaires, an admin approves tutors, the family gets matched, requests a lesson, the tutor counters, the family accepts, both sides message, the lesson is logged → confirmed → verified, and a safety report auto-pauses the tutor.

1. Run `setup.sql` in the Supabase SQL editor (creates confirmed test accounts on `@tfac-e2e.test`, password `E2eTest-2026`).
2. `npm run build && npm start`, then in another terminal:
   ```bash
   npm i --no-save playwright && npx playwright install chromium
   node tests/e2e/phase1.mjs
   ```
3. Run the SQL in `time-travel.sql` (moves the booked lesson into the past), then `node tests/e2e/phase2.mjs`.
4. **Always** run `cleanup.sql` afterwards — it removes every test account and record.
