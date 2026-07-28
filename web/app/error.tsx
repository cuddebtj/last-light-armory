"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { logger } from "@/lib/logger";

// Catches uncaught render errors anywhere under this segment (i.e. most
// of the app — see app/weapons/[hash] for its own nested boundary too)
// and logs them instead of leaving a silent white screen. error.digest
// (server-side errors only) is the identifier to grep Vercel's function
// logs for the real message and stack, which Next.js deliberately
// doesn't forward to the client in production.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    logger.error("uncaught render error", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-muted">
        {error.digest
          ? `An unexpected error occurred (ref: ${error.digest}).`
          : "An unexpected error occurred."}
      </p>
      <div className="mt-6 flex items-center gap-4 text-sm">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="text-gold hover:underline"
        >
          Try again
        </button>
        <Link href="/" className="text-gold hover:underline">
          ← All Weapons
        </Link>
      </div>
    </main>
  );
}
