import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let transporter: Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

/**
 * In EMAIL_DEV_MODE (default for local development), emails are not
 * actually sent - they are logged to the console so the verification
 * / reset flow can be tested end-to-end without a real SMTP provider.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (env.EMAIL_DEV_MODE || !env.SMTP_HOST) {
    logger.info('[DEV EMAIL] (not actually sent - EMAIL_DEV_MODE=true)', { to, subject, html });
    return;
  }

  await getTransporter().sendMail({
    from: env.SMTP_USER,
    to,
    subject,
    html,
  });
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${env.FRONTEND_URL}/verify-email?token=${token}`;
  await sendEmail(to, 'Verify your email', `<p>Click to verify your account:</p><p><a href="${link}">${link}</a></p>`);
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  await sendEmail(to, 'Reset your password', `<p>Click to reset your password (expires in 1 hour):</p><p><a href="${link}">${link}</a></p>`);
}
