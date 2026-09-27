export async function upgradeTenantSchema(client) {
  const { rows } = await client.execute('PRAGMA table_info(purchase_corrections)');
  const columns = new Set(rows.map((column) => column.name));
  const upgrades = [
    ['actor_id', 'TEXT'],
    ['previous_total', 'REAL'],
    ['corrected_total', 'REAL'],
  ];
  for (const [name, type] of upgrades) {
    if (!columns.has(name)) await client.execute(`ALTER TABLE purchase_corrections ADD COLUMN ${name} ${type}`);
  }
  if (columns.has('actor_email') && !columns.has('actor_id')) {
    await client.execute('UPDATE purchase_corrections SET actor_id=actor_email WHERE actor_id IS NULL');
  }
  await client.execute({
    sql: 'INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(2, ?)',
    args: [new Date().toISOString()],
  });
}
