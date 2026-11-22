import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <Link href="/" aria-label="Home">
        <Wordmark className="text-2xl" />
      </Link>
      <p className="text-muted-foreground font-mono text-7xl font-bold">404</p>
      <p className="text-lg">Nothing here.</p>
      <Link href="/" className="text-sm font-medium underline underline-offset-4">
        Back to the front page
      </Link>
    </main>
  );
}
