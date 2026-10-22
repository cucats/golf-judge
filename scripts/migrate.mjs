import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
	await client.query('BEGIN');
	await client.query('SELECT pg_advisory_xact_lock(1730162400)');
	// Continue the existing migration history; replaying old migrations would destroy data.
	await client.query(`CREATE TABLE IF NOT EXISTS _sqlx_migrations (
        version BIGINT PRIMARY KEY, description TEXT NOT NULL,
        installed_on TIMESTAMPTZ NOT NULL DEFAULT now(), success BOOLEAN NOT NULL,
        checksum BYTEA NOT NULL, execution_time BIGINT NOT NULL)`);
	const applied = new Map(
		(await client.query('SELECT version,checksum,success FROM _sqlx_migrations')).rows.map((r) => [
			Number(r.version),
			r
		])
	);
	for (const file of (await readdir('migrations')).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()) {
		const version = Number(file.split('_')[0]);
		const sql = await readFile(`migrations/${file}`);
		const checksum = createHash('sha384').update(sql).digest();
		const old = applied.get(version);
		if (old) {
			if (!old.success || !old.checksum.equals(checksum))
				throw new Error(`Migration ${file} does not match the database`);
			continue;
		}
		const start = process.hrtime.bigint();
		await client.query(sql.toString());
		await client.query(
			'INSERT INTO _sqlx_migrations (version,description,success,checksum,execution_time) VALUES ($1,$2,true,$3,$4)',
			[
				version,
				file.replace(/^\d+_|\.sql$/g, '').replaceAll('_', ' '),
				checksum,
				String(process.hrtime.bigint() - start)
			]
		);
		console.log(`Applied ${file}`);
	}
	await client.query('COMMIT');
} catch (err) {
	await client.query('ROLLBACK');
	throw err;
} finally {
	await client.end();
}
