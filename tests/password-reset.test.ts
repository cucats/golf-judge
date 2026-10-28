import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { randomBytes } from "node:crypto";
import pg from "pg";
import nodemailer from "nodemailer";
import type { RequestEvent } from "@sveltejs/kit";
import {
  authenticate,
  hashPassword,
  verifyPassword,
} from "../src/lib/server/auth";
import {
  normalizeEmail,
  resetMailer,
  validEmail,
} from "../src/lib/server/email";
import { one, pool, query } from "../src/lib/server/db";
import {
  completeReset,
  requestReset,
  resetCode,
  resetCookie,
  resetStage,
  verifyResetCode,
} from "../src/lib/server/password-reset";
import { actions as resetActions } from "../src/routes/reset-password/+page.server";
import { actions as settingsActions } from "../src/routes/settings/+page.server";

test("email normalization and validation reject malformed addresses and headers", () => {
  expect(normalizeEmail(" Alice@Example.org ")).toBe("alice@example.org");
  expect(validEmail("alice+golf@example.org")).toBe(true);
  for (const email of [
    "",
    "alice",
    "alice@",
    "a@b",
    "a b@example.org",
    "a@example.org\r\nBcc:x@example.org",
    "a\0@example.org",
    `${"a".repeat(250)}@example.org`,
  ])
    expect(validEmail(email)).toBe(false);
  for (let i = 0; i < 100; i++) expect(resetCode()).toMatch(/^[A-Z0-9]{6}$/);
});

test("reset email contains exactly the requested text and uses SMTP credentials", async () => {
  const previous = { ...process.env };
  process.env.SMTP_HOST = "smtp.example.org";
  process.env.SMTP_USER = "noreply@cucats.org";
  process.env.SMTP_PASSWORD = "test-password";
  process.env.SMTP_PORT = "587";
  delete process.env.SMTP_FROM;
  const messages: unknown[] = [];
  const transport = spyOn(nodemailer, "createTransport").mockReturnValue({
    sendMail: async (message: unknown) => {
      messages.push(message);
    },
  } as unknown as ReturnType<typeof nodemailer.createTransport>);
  try {
    await resetMailer()("alice@example.org", "AB12CD");
    expect(transport.mock.calls[0]?.[0]).toMatchObject({
      host: "smtp.example.org",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: "noreply@cucats.org", pass: "test-password" },
    });
    expect(messages).toEqual([
      {
        from: "noreply@cucats.org",
        to: "alice@example.org",
        subject: "Reset password",
        text: "Your code is AB12CD",
      },
    ]);
  } finally {
    transport.mockRestore();
    for (const key of [
      "SMTP_HOST",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "SMTP_PORT",
      "SMTP_FROM",
    ])
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
  }
});

function browser(fields: Record<string, string> = {}, signedIn = false) {
  const cookies = new Map<string, string>();
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const event = {
    locals: { user: signedIn ? { username: "alice", is_admin: false } : null },
    url: new URL("https://golf.example.org/settings"),
    request: new Request("https://golf.example.org", {
      method: "POST",
      body: form,
    }),
    cookies: {
      get: (key: string) => cookies.get(key),
      set: (key: string, value: string) => cookies.set(key, value),
      delete: (key: string) => cookies.delete(key),
    },
  } as unknown as RequestEvent;
  return { event, cookies };
}

describe.skipIf(process.env.RUN_AUTH_TESTS !== "1")(
  "database password recovery",
  () => {
    const schema = `auth_test_${randomBytes(8).toString("hex")}`;
    const setup = new pg.Client({ connectionString: process.env.DATABASE_URL });
    let sent: { email: string; code: string }[];
    const send = async (email: string, code: string) => {
      sent.push({ email, code });
    };
    const start = (email = "alice@example.org", address = "127.0.0.1") =>
      requestReset(email, address, send);

    beforeAll(async () => {
      await setup.connect();
      await setup.query(`CREATE SCHEMA ${schema}`);
      pool.options.options = `-c search_path=${schema}`;
      for (const file of [
        "001_init.sql",
        "006_user_passwords.sql",
        "008_sessions.sql",
        "014_password_reset.sql",
      ])
        await query(await Bun.file(`migrations/${file}`).text());
    });
    afterAll(async () => {
      await pool.end();
      await setup.query(`DROP SCHEMA ${schema} CASCADE`);
      await setup.end();
    });
    beforeEach(async () => {
      sent = [];
      await query("TRUNCATE users,password_reset_limits CASCADE");
      expect(
        await authenticate("alice", "old-password", "alice@example.org"),
      ).toBeNull();
      await query(
        "INSERT INTO sessions VALUES ('old-session','alice',9999999999)",
      );
    });

    test("email is optional, unique, and existing logins cannot overwrite it", async () => {
      expect(await authenticate("bob", "password")).toBeNull();
      expect(await one("SELECT email FROM users WHERE username='bob'")).toEqual(
        { email: null },
      );
      expect(
        await authenticate("alice", "old-password", "other@example.org"),
      ).toBeNull();
      expect(
        await one("SELECT email FROM users WHERE username='alice'"),
      ).toEqual({ email: "alice@example.org" });
      expect(await authenticate("eve", "password", "alice@example.org")).toBe(
        "Email is already in use",
      );
      expect(
        await one("SELECT username FROM users WHERE username='eve'"),
      ).toBeUndefined();
    });

    test("reset requires the code, changes the password, revokes sessions and logs in", async () => {
      const token = (await start())!;
      expect(sent).toHaveLength(1);
      expect(sent[0]?.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(await resetStage(token)).toBe("code");
      expect(await completeReset(token, "new-password")).toBeNull();
      expect(await verifyResetCode(token, sent[0]!.code)).toBe(true);
      expect(await resetStage(token)).toBe("password");
      const { event, cookies } = browser({
        new_password: "new-password",
        confirm_password: "new-password",
      });
      cookies.set(resetCookie, token);
      await expect(resetActions.reset(event)).rejects.toMatchObject({
        status: 303,
        location: "/",
      });
      expect(cookies.has(resetCookie)).toBe(false);
      expect(cookies.get("golf_session")).toBeTruthy();
      expect(
        await one("SELECT * FROM sessions WHERE token_hash='old-session'"),
      ).toBeUndefined();
      expect(
        (await query("SELECT * FROM sessions WHERE username='alice'")).length,
      ).toBe(1);
      expect(await authenticate("alice", "new-password")).toBeNull();
      expect(await authenticate("alice", "old-password")).toBe(
        "Incorrect password for this username",
      );
      expect(await completeReset(token, "replayed-password")).toBeNull();
      expect(await verifyResetCode(token, sent[0]!.code)).toBe(false);
    });

    test("unknown addresses follow the code step without sending mail or allowing reset", async () => {
      const token = (await start("unknown@example.org"))!;
      expect(token).toBeTruthy();
      expect(sent).toHaveLength(0);
      expect(await resetStage(token)).toBe("code");
      expect(await verifyResetCode(token, "ABC123")).toBe(false);
      expect(await completeReset(token, "password")).toBeNull();
    });

    test("codes are bound to their browser token and replacement codes invalidate old ones", async () => {
      const first = (await start())!;
      const oldCode = sent[0]!.code;
      const second = (await start())!;
      expect(await resetStage(first)).toBe("email");
      expect(await verifyResetCode(first, oldCode)).toBe(false);
      expect(await verifyResetCode("forged-token", sent[1]!.code)).toBe(false);
      expect(await verifyResetCode(second, sent[1]!.code)).toBe(true);
    });

    test("five wrong attempts lock the code; the fifth correct attempt succeeds", async () => {
      const token = (await start())!;
      for (let i = 0; i < 5; i++)
        expect(await verifyResetCode(token, "wrong")).toBe(false);
      expect(await verifyResetCode(token, sent[0]!.code)).toBe(false);
      expect(await resetStage(token)).toBe("email");
      const next = (await start())!;
      for (let i = 0; i < 4; i++) await verifyResetCode(next, "wrong");
      expect(await verifyResetCode(next, sent[1]!.code)).toBe(true);
      expect(await completeReset(next, "new-password")).toBe("alice");
    });

    test("expired and unverified requests cannot reset the password", async () => {
      const token = (await start())!;
      await query("UPDATE password_resets SET expires_at=0");
      expect(await resetStage(token)).toBe("email");
      expect(await verifyResetCode(token, sent[0]!.code)).toBe(false);
      expect(await completeReset(token, "new-password")).toBeNull();
      expect(await authenticate("alice", "old-password")).toBeNull();
    });

    test("password and email changes invalidate outstanding resets", async () => {
      const first = (await start())!;
      await verifyResetCode(first, sent[0]!.code);
      await query("UPDATE users SET password_hash=$1 WHERE username='alice'", [
        await hashPassword("changed-password"),
      ]);
      expect(await completeReset(first, "new-password")).toBeNull();
      const second = (await start())!;
      await verifyResetCode(second, sent[1]!.code);
      const { event } = browser({ email: " Other@Example.org " }, true);
      await expect(settingsActions.default(event)).rejects.toMatchObject({
        status: 303,
      });
      expect(await resetStage(second)).toBe("email");
      expect(await completeReset(second, "new-password")).toBeNull();
      expect(
        await one("SELECT email FROM users WHERE username='alice'"),
      ).toEqual({ email: "other@example.org" });
      await expect(
        settingsActions.default(browser({ email: "" }, true).event),
      ).rejects.toMatchObject({ status: 303 });
      expect(
        await one("SELECT email FROM users WHERE username='alice'"),
      ).toEqual({ email: null });
    });

    test("matching passwords are required and concurrent resets have a single winner", async () => {
      const token = (await start())!;
      await verifyResetCode(token, sent[0]!.code);
      const { event, cookies } = browser({
        new_password: "new-password",
        confirm_password: "different",
      });
      cookies.set(resetCookie, token);
      expect(await resetActions.reset(event)).toMatchObject({ status: 400 });
      const results = await Promise.all([
        completeReset(token, "password-one"),
        completeReset(token, "password-two"),
      ]);
      expect(results.filter(Boolean)).toEqual(["alice"]);
      const stored = (await one<{ password_hash: string }>(
        "SELECT password_hash FROM users WHERE username='alice'",
      ))!;
      expect(
        await verifyPassword(
          stored.password_hash,
          results[0] ? "password-one" : "password-two",
        ),
      ).toBe(true);
    });

    test("request limits apply to both email addresses and client IPs", async () => {
      for (let i = 0; i < 5; i++) expect(await start()).toBeTruthy();
      expect(await start()).toBeNull();
      expect(sent).toHaveLength(5);
      for (let i = 0; i < 14; i++)
        expect(await start(`unknown${i}@example.org`)).toBeTruthy();
      expect(await start("another@example.org")).toBeNull();
      await query("UPDATE password_reset_limits SET expires_at=0");
      expect(await start()).toBeTruthy();
    });
  },
);
