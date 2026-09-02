import { VerifyForm } from "@/components/auth-forms";

export const metadata = { title: "Confirm your email" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Confirm your email</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          One step left before your library opens.
        </p>
      </div>

      <VerifyForm email={email ?? ""} />
    </div>
  );
}
