import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { join } from 'node:path';

describe('recovery ownership migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20261024061119_recovery_claim_permission_and_expiry.sql'
    ),
    'utf8'
  );

  it('only lets owners bind a household to a recovery code', () => {
    assert.match(sql, /only an owner can bind a recovery code to a household/);
    assert.match(sql, /household_permission\(p_household\)/);
    assert.match(sql, /caller_perm is distinct from 'owner'/);
  });

  it('claims with stored permission instead of hard-coded owner', () => {
    assert.match(sql, /coalesce\(claim_permission, 'editor'\)/);
    assert.match(sql, /values \(hid, auth\.uid\(\), perm\)/);
    assert.match(sql, /set permission = excluded\.permission/);
  });

  it('clears recovery rows when a member leaves', () => {
    assert.match(sql, /trg_clear_recovery_on_member_leave/);
    assert.match(sql, /_clear_recovery_on_member_leave/);
  });
});
