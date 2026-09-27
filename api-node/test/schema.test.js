import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { controlSchema, tenantSchema } from '../src/db/control-schema.js';

async function databaseWith(schema) {
  const db = createClient({ url: 'file::memory:' });
  for (const statement of schema) await db.execute(statement);
  return db;
}

test('control-plane schema supports isolated stores and prevents two default stores per user', async () => {
  const db = await databaseWith(controlSchema);
  try {
    const store = await db.execute({
      sql: `INSERT INTO stores(name, code, database_name, database_url, database_token_ciphertext)
        VALUES('Test Store', 'TEST', 'test-db', 'libsql://test.turso.io', 'ciphertext') RETURNING id`,
    });
    await db.execute({ sql: "INSERT INTO users(id,email,password_hash) VALUES('u1','user@example.com','hash')" });
    await db.execute({ sql: 'INSERT INTO user_stores(user_id,store_id,is_default) VALUES(?,?,1)', args: ['u1', store.rows[0].id] });
    await assert.rejects(db.execute({ sql: 'INSERT INTO user_stores(user_id,store_id,is_default) VALUES(?,?,1)', args: ['u1', store.rows[0].id] }));
    const check = await db.execute('SELECT COUNT(*) AS count FROM stores');
    assert.equal(Number(check.rows[0].count), 1);
  } finally { await db.close(); }
});

test('tenant schema supports an atomic sale stock decrement and records stock movements', async () => {
  const db = await databaseWith(tenantSchema);
  try {
    const medicine = await db.execute({ sql: "INSERT INTO medicines(name) VALUES('Test medicine') RETURNING id" });
    const batch = await db.execute({
      sql: 'INSERT INTO batches(medicine_id,number,expiry_date,cost_price,sale_price,quantity) VALUES(?,?,?,?,?,1) RETURNING id',
      args: [medicine.rows[0].id, 'B1', '2030-01-01', 2, 5],
    });
    const tx = await db.transaction('write');
    const first = await tx.execute({ sql: 'UPDATE batches SET quantity=quantity-1, version=version+1 WHERE id=? AND quantity>=1 RETURNING quantity', args: [batch.rows[0].id] });
    assert.equal(Number(first.rows[0].quantity), 0);
    await tx.execute({ sql: "INSERT INTO stock_movements(batch_id,type,reference_id,quantity_change,balance_after,reason) VALUES(?,'Sale',1,-1,0,'INV-00000001')", args: [batch.rows[0].id] });
    await tx.commit();
    const second = await db.execute({ sql: 'UPDATE batches SET quantity=quantity-1 WHERE id=? AND quantity>=1 RETURNING quantity', args: [batch.rows[0].id] });
    assert.equal(second.rows.length, 0);
    const movements = await db.execute('SELECT COUNT(*) AS count FROM stock_movements');
    assert.equal(Number(movements.rows[0].count), 1);
  } finally { await db.close(); }
});
