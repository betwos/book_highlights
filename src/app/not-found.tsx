import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="space-y-4 py-16 text-center">
      <h1 className="text-xl font-medium">Not found</h1>
      <p className="text-sm text-[var(--muted-foreground)]">
        That page or book does not exist.
      </p>
      <Button asChild>
        <Link href="/">Back to the library</Link>
      </Button>
    </div>
  );
}
