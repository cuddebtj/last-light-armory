import { getMeta, getWeaponIndex } from "@/lib/data";
import WeaponBrowser from "@/components/WeaponBrowser";

export default async function Home() {
  const [meta, weapons] = await Promise.all([getMeta(), getWeaponIndex()]);
  const updated = new Date(meta.generated_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16">
      <header className="pt-10 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Last Light <span className="text-gold">Armory</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          {meta.weapon_count.toLocaleString("en-US")} weapons ·{" "}
          {meta.roll_count.toLocaleString("en-US")} rolls · manifest updated{" "}
          {updated}
        </p>
      </header>
      <WeaponBrowser weapons={weapons} />
    </main>
  );
}
