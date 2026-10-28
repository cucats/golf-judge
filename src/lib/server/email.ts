import nodemailer from "nodemailer";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const validEmail = (email: string) =>
  email.length <= 254 &&
  /^[^\s@<>(),;:"\\\p{Cc}]+@[^\s@<>(),;:"\\\p{Cc}]+\.[^\s@<>(),;:"\\\p{Cc}]+$/u.test(
    email,
  );

export function resetMailer() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER ?? "noreply@cucats.org";
  const pass = process.env.SMTP_PASSWORD;
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!host || !pass || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(
      "SMTP_HOST, SMTP_PASSWORD and a valid SMTP_PORT are required",
    );
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return async (email: string, code: string) => {
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? "noreply@cucats.org",
      to: email,
      subject: "Reset password",
      text: `Your code is ${code}`,
    });
  };
}
