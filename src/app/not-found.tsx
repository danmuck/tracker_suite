import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col justify-center gap-6 px-6">
      <Link href="/" aria-label="Home">
        <Wordmark className="text-2xl" />
      </Link>
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          404
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Nothing here.</h1>
        <p className="text-muted-foreground">
          That page does not exist, or is not served from this host.
        </p>
      </div>
      <Link
        href="/"
        className="w-fit text-sm font-medium underline decoration-brand decoration-2 underline-offset-4"
      >
        Back to the front page
      </Link>
    </main>
  );
}
