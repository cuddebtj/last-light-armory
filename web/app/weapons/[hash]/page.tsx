import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getPerks, getWeaponIndex, getWeaponOrNull } from "@/lib/data";
import { resolvePerk, toPerkMap } from "@/lib/perks";
import { bungieUrl } from "@/lib/bungie";
import { ELEMENT_TEXT, TIER_BORDER, TIER_TEXT } from "@/lib/style";
import RollsTable, { type RollRow } from "@/components/RollsTable";
import PerkPool from "@/components/PerkPool";

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

  const rollRows: RollRow[] = weapon.rolls.map((roll) => ({
    key: roll.key,
    displayPerks: [...roll.perks]
      .sort((a, b) => a.column - b.column)
      .map(({ hash }) => resolvePerk(perkMap, hash).name)
      .join(" / "),
    pve_score: roll.pve_score,
    pvp_score: roll.pvp_score,
    overall_score: roll.overall_score,
  }));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16">
      <p className="pt-6 pb-4 text-sm">
        <Link href="/" className="text-muted hover:text-ink">
          ← All Weapons
        </Link>
      </p>

      <header className="flex items-start gap-5">
        <span
          className={`relative block h-24 w-24 shrink-0 overflow-hidden rounded border-l-2 ${TIER_BORDER[weapon.tier] ?? "border-edge"}`}
        >
          <Image
            src={bungieUrl(weapon.icon)}
            alt={weapon.name}
            width={96}
            height={96}
          />
          <Image
            src={bungieUrl(weapon.watermark)}
            alt=""
            width={96}
            height={96}
            className="absolute inset-0"
          />
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">
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
          {weapon.source && (
            <p className="mt-3 text-sm text-muted">{weapon.source}</p>
          )}
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {weapon.columns.length > 0 && (
            <section>
              <h2 className="text-sm font-medium tracking-wide text-muted uppercase">
                Perk Pool
              </h2>
              <div className="mt-3">
                <PerkPool columns={weapon.columns} perkMap={perkMap} />
              </div>
            </section>
          )}

          {weapon.rolls.length > 0 ? (
            <section>
              <h2 className="text-sm font-medium tracking-wide text-muted uppercase">
                Rolls ({weapon.rolls.length.toLocaleString("en-US")})
              </h2>
              <RollsTable rolls={rollRows} />
            </section>
          ) : (
            <p className="text-sm text-muted">
              No curated rolls recorded for this weapon yet.
            </p>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-edge bg-surface p-4">
            <h2 className="text-xs font-medium tracking-wide text-muted uppercase">
              Details
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-ink">
              <li>
                Deals{" "}
                <span className={ELEMENT_TEXT[weapon.element] ?? "text-muted"}>
                  {weapon.element}
                </span>{" "}
                damage
              </li>
              {weapon.breaker_type && (
                <li>Has {weapon.breaker_type} properties</li>
              )}
              {weapon.ammo_type && <li>Uses {weapon.ammo_type} ammo</li>}
              <li>{weapon.slot} weapon</li>
              {weapon.rpm != null && <li>{weapon.rpm} RPM</li>}
            </ul>
          </div>

          <div className="rounded-lg border border-edge bg-surface p-4">
            <h2 className="text-xs font-medium tracking-wide text-muted uppercase">
              Weapon Score
            </h2>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="text-xs text-muted">PvE</dt>
                <dd className="mt-1 font-mono text-lg text-ink">
                  {weapon.pve_score ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">PvP</dt>
                <dd className="mt-1 font-mono text-lg text-ink">
                  {weapon.pvp_score ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Overall</dt>
                <dd className="mt-1 font-mono text-lg text-gold">
                  {weapon.overall_score ?? "—"}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </main>
  );
}
