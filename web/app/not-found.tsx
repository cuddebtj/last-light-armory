import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Not Found</h1>
      <p className="mt-2 text-sm text-muted">
        That weapon isn&apos;t in the armory.
      </p>
      <Link href="/" className="mt-6 text-sm text-gold hover:underline">
        ← All Weapons
      </Link>
    </main>
  );
}
