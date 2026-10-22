import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

function convertCases(problems) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["scripts/migrations/010_cases.py"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out = [],
      err = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", reject);
    child.stdin.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(Buffer.concat(err).toString()));
      try {
        resolve(JSON.parse(Buffer.concat(out).toString()));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify(problems));
  });
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(1730162400)");
  // Continue the existing migration history; replaying old migrations would destroy data.
  await client.query(`CREATE TABLE IF NOT EXISTS _sqlx_migrations (
        version BIGINT PRIMARY KEY, description TEXT NOT NULL,
        installed_on TIMESTAMPTZ NOT NULL DEFAULT now(), success BOOLEAN NOT NULL,
        checksum BYTEA NOT NULL, execution_time BIGINT NOT NULL)`);
  const applied = new Map(
    (
      await client.query(
        "SELECT version,checksum,success FROM _sqlx_migrations",
      )
    ).rows.map((r) => [Number(r.version), r]),
  );
  for (const file of (await readdir("migrations"))
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()) {
    const version = Number(file.split("_")[0]);
    const sql = await readFile(`migrations/${file}`);
    const checksum = createHash("sha384").update(sql).digest();
    const old = applied.get(version);
    if (old) {
      if (!old.success || !old.checksum.equals(checksum))
        throw new Error(`Migration ${file} does not match the database`);
      continue;
    }
    const start = process.hrtime.bigint();
    if (version === 10) {
      const problems = (
        await client.query("SELECT * FROM problems ORDER BY id FOR UPDATE")
      ).rows;
      const converted = await convertCases(problems);
      await client.query(
        "ALTER TABLE problems ADD COLUMN test_cases JSONB NOT NULL DEFAULT '[]'",
      );
      for (const [index, problem] of problems.entries()) {
        await client.query(
          "UPDATE problems SET test_cases=$1,grader=$2 WHERE id=$3",
          [
            JSON.stringify(converted[index].test_cases),
            converted[index].grader,
            problem.id,
          ],
        );
      }
      const jobs = (
        await client.query(
          "SELECT id,problem_snapshot FROM judge_jobs WHERE state<>'finished' FOR UPDATE",
        )
      ).rows;
      const snapshots = await convertCases(
        jobs.map((job) => job.problem_snapshot),
      );
      for (const [index, job] of jobs.entries()) {
        const { test_input, test_output, public_test_count, ...problem } =
          job.problem_snapshot;
        const snapshot = {
          ...problem,
          ...snapshots[index],
          test_count: snapshots[index].test_cases.length,
        };
        await client.query(
          "UPDATE judge_jobs SET problem_snapshot=$1,state='queued',passed=0,completed=0,total=$2,lease_token=NULL,lease_until=NULL WHERE id=$3",
          [JSON.stringify(snapshot), snapshot.test_count, job.id],
        );
      }
    }
    await client.query(sql.toString());
    await client.query(
      "INSERT INTO _sqlx_migrations (version,description,success,checksum,execution_time) VALUES ($1,$2,true,$3,$4)",
      [
        version,
        file.replace(/^\d+_|\.sql$/g, "").replaceAll("_", " "),
        checksum,
        String(process.hrtime.bigint() - start),
      ],
    );
    console.log(`Applied ${file}`);
  }
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  await client.end();
}
