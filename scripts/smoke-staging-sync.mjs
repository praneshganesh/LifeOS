/**
 * Smoke test for the household row-sync schema (run after `db push`):
 *   node scripts/smoke-staging-sync.mjs
 * Reads EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY from .env.
 * Uses two anonymous users to also prove RLS household isolation.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Missing Supabase env in .env');
console.log('Target:', url);

function fresh() {
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fail(step, error) {
  console.error(`FAIL at ${step}:`, error?.message ?? error);
  process.exit(1);
}

// --- User A: bootstrap household, write + read a thing and a reminder ---
const a = fresh();
{
  const { error } = await a.auth.signInAnonymously();
  if (error) await fail('anonymous sign-in', error);
}
const { data: hid, error: hhErr } = await a.rpc('ensure_household');
if (hhErr || !hid) await fail('ensure_household', hhErr);
console.log('ensure_household →', hid);

const { data: hid2 } = await a.rpc('ensure_household');
if (hid2 !== hid) await fail('ensure_household idempotency', `got ${hid2}`);

const thingId = crypto.randomUUID();
{
  const { error } = await a.from('things').upsert({
    id: thingId,
    household_id: hid,
    name: 'Smoke test espresso machine',
    category: 'Appliance',
    is_document: false,
    body: { name: 'Smoke test espresso machine', serial: 'SMOKE-1' },
    client_mutated_at: new Date().toISOString(),
  });
  if (error) await fail('insert thing', error);
}
const reminderId = crypto.randomUUID();
{
  const { error } = await a.from('reminders').upsert({
    id: reminderId,
    household_id: hid,
    thing_id: thingId,
    label: 'Smoke test descale',
    remind_at: new Date(Date.now() + 86400000).toISOString(),
    remind_interval: { value: 3, unit: 'months' },
    body: { label: 'Smoke test descale', logs: [] },
  });
  if (error) await fail('insert reminder', error);
}
{
  const { data, error } = await a.from('things').select('id,name,updated_at').eq('id', thingId);
  if (error || data?.length !== 1) await fail('read back thing', error ?? 'not found');
  console.log('thing read back:', data[0].name, '| server updated_at:', data[0].updated_at);
}

// --- Tombstone update (delete path used by the sync engine) ---
{
  const { error } = await a
    .from('reminders')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', reminderId);
  if (error) await fail('tombstone reminder', error);
}

// --- User B: must see nothing of household A ---
const b = fresh();
{
  const { error } = await b.auth.signInAnonymously();
  if (error) await fail('second anonymous sign-in', error);
}
{
  const { data, error } = await b.from('things').select('id').eq('id', thingId);
  if (error) await fail('RLS probe', error);
  if (data.length !== 0) await fail('RLS isolation', 'user B can see household A rows!');
  console.log('RLS isolation: user B sees 0 of household A rows ✓');
}
{
  const { error } = await b.from('things').upsert({
    id: crypto.randomUUID(),
    household_id: hid,
    name: 'RLS bypass attempt',
    body: {},
  });
  if (!error) await fail('RLS write isolation', 'user B wrote into household A!');
  console.log('RLS write isolation: cross-household insert rejected ✓');
}

// --- Invite flow: A invites, B joins, B can now read ---
const { data: code, error: invErr } = await a.rpc('create_household_invite', {
  p_household: hid,
});
if (invErr || !code) await fail('create_household_invite', invErr);
const { data: joined, error: accErr } = await b.rpc('accept_household_invite', {
  p_code: code,
});
if (accErr || joined !== hid) await fail('accept_household_invite', accErr ?? `joined ${joined}`);
{
  const { data } = await b.from('things').select('id').eq('id', thingId);
  if (data?.length !== 1) await fail('member visibility', 'B joined but cannot read');
  console.log('invite flow: B joined household and can read ✓');
}

// --- Cleanup ---
await a.from('reminders').delete().eq('id', reminderId);
await a.from('things').delete().eq('id', thingId);
console.log('\nAll smoke checks passed.');
