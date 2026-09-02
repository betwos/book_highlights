import { Resend } from "resend";
import { CODE_TTL_MS } from "@/lib/verification";

/**
 * Transactional email, behind one function.
 *
 * With no RESEND_API_KEY the code is written to the server log instead of sent.
 * That is what keeps local development free of a mail vendor: sign up, read the
 * code off the terminal, carry on. In production the key is set and mail is real.
 */

const from = () => process.env.EMAIL_FROM?.trim() || "onboarding@resend.dev";

const minutes = Math.round(CODE_TTL_MS / 60_000);

export async function sendVerificationCode(to: string, code: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();

  if (!key) {
    console.info(`[email] no RESEND_API_KEY — confirmation code for ${to} is ${code}`);
    return;
  }

  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: from(),
    to,
    subject: `Your confirmation code: ${code}`,
    text: [
      `Your code is ${code}.`,
      ``,
      `It expires in ${minutes} minutes and can be used once.`,
      `If you did not create an account, ignore this message.`,
    ].join("\n"),
  });

  // Surface it: a silently unsent code is indistinguishable to the user from a
  // code that never arrived, and they would sit on the verify page forever.
  if (error) throw new Error(`Could not send the confirmation email: ${error.message}`);
}
