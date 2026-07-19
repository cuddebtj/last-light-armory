import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getPerks, getWeaponIndex, getWeaponOrNull } from "@/lib/data";
import { dedupeByName, resolvePerk, toPerkMap } from "@/lib/perks";
import { bungieUrl } from "@/lib/bungie";
import { ELEMENT_TEXT, TIER_BORDER, TIER_TEXT } from "@/lib/style";

export async function generateStaticParams() {
  const weapons = await getWeaponIndex();
  return weapons.map((w) => ({ hash: String(w.hash) }));
}

type Params = Promise<{ hash: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { hash } = await params;
  const weapon = await getWeaponOrNull(Number(hash));
  return {
    title: weapon ? `${weapon.name} — Last Light Armory` : "Weapon not found",
  };
}

export default async function WeaponPage({ params }: { params: Params }) {
  const { hash } = await params;
  const weapon = await getWeaponOrNull(Number(hash));
  if (!weapon) {
    notFound();
  }

  const perkMap = toPerkMap(await getPerks());

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16">
      <p className="pt-6 pb-4 text-sm">
        <Link href="/" className="text-muted hover:text-ink">
          ← All Weapons
        </Link>
      </p>

      <header className="flex items-start gap-4">
        <span
          className={`relative block h-20 w-20 shrink-0 overflow-hidden rounded border-l-2 ${TIER_BORDER[weapon.tier] ?? "border-edge"}`}
        >
          <Image
            src={bungieUrl(weapon.icon)}
            alt={weapon.name}
            width={80}
            height={80}
          />
          <Image
            src={bungieUrl(weapon.watermark)}
            alt=""
            width={80}
            height={80}
            className="absolute inset-0"
          />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {weapon.name}
          </h1>
          <p
            className={`mt-1 text-sm font-medium ${TIER_TEXT[weapon.tier] ?? "text-muted"}`}
          >
            {weapon.tier}
          </p>
          <p className="mt-1 text-sm text-muted">
            {weapon.type} · {weapon.frame} ·{" "}
            <span className={ELEMENT_TEXT[weapon.element] ?? "text-muted"}>
              {weapon.element}
            </span>{" "}
            · {weapon.slot} · {weapon.rpm ?? "—"} RPM
          </p>
          <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {weapon.craftable && (
              <span className="rounded-full border border-edge px-2 py-0.5 text-muted">
                Craftable
              </span>
            )}
            {weapon.enhanceable && (
              <span className="rounded-full border border-edge px-2 py-0.5 text-muted">
                Enhanceable
              </span>
            )}
            {!weapon.obtainable && (
              <span className="rounded-full border border-edge px-2 py-0.5 text-muted">
                Currently unobtainable
              </span>
            )}
          </p>
        </div>
      </header>

      {weapon.source && (
        <p className="mt-4 text-sm text-muted">{weapon.source}</p>
      )}

      {weapon.columns.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium tracking-wide text-muted uppercase">
            Perk Pool
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {weapon.columns.map((col) => (
              <div key={col.index}>
                <p className="text-xs text-muted">Column {col.index + 1}</p>
                <ul className="mt-1 space-y-1">
                  {dedupeByName(col.perks.map((hash) => resolvePerk(perkMap, hash))).map(
                    (perk) => (
                      <li
                        key={perk.hash}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Image
                          src={bungieUrl(perk.icon)}
                          alt=""
                          width={20}
                          height={20}
                          className="rounded"
                        />
                        {perk.name}
                        {perk.enhanced && (
                          <span className="text-xs text-gold">Enh.</span>
                        )}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {weapon.rolls.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium tracking-wide text-muted uppercase">
            Rolls ({weapon.rolls.length.toLocaleString("en-US")})
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs text-muted uppercase">
                  <th className="py-2 font-medium">Perks</th>
                  <th className="py-2 text-right font-medium">PvE</th>
                  <th className="py-2 text-right font-medium">PvP</th>
                  <th className="py-2 text-right font-medium">Overall</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/60">
                {weapon.rolls.map((roll) => (
                  <tr key={roll.key}>
                    <td className="py-2 pr-4">
                      <span className="flex flex-wrap gap-x-2 gap-y-1">
                        {[...roll.perks]
                          .sort((a, b) => a.column - b.column)
                          .map(({ hash }) => resolvePerk(perkMap, hash).name)
                          .join(" / ")}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono text-muted">
                      {roll.pve_score ?? "—"}
                    </td>
                    <td className="py-2 text-right font-mono text-muted">
                      {roll.pvp_score ?? "—"}
                    </td>
                    <td className="py-2 text-right font-mono text-muted">
                      {roll.overall_score ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="mt-8 text-sm text-muted">
          No curated rolls recorded for this weapon yet.
        </p>
      )}
    </main>
  );
}
