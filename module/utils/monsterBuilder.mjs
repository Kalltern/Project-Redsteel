/**
 * Monster Builder (v1) — stamp complete, playable NPCs from three inputs.
 *
 * The GM picks a Power Level, an Archetype and a Role; the builder derives a
 * full stat block from the curve in `helpers/bestiary-scale.mjs`, picks a real
 * weapon out of the `redsteel-items` compendium, solves the NPC damage bonus so
 * the creature lands on the curve's target damage, and creates the actors.
 *
 * Two design decisions worth knowing before changing anything here:
 *
 * 1. **Weapon weight is never gated by Power Level.** A PL1 brute may carry a
 *    bardiche. Power Level is expressed through *quality* instead (PL_QUALITY),
 *    which is a 13-point attack swing from `bad` to `legendary`. Random weapon
 *    choice is a feature: a batch of six comes out varied.
 *
 * 2. **The damage bonus floors at -5.** When a heavy weapon on a low-PL monster
 *    already averages more than the curve's target, the builder accepts the
 *    overshoot and says so in the preview rather than driving the bonus deeply
 *    negative. A `5d8+2-15` bardiche swings from -8 to +27, which plays far
 *    worse than a monster that is simply inaccurate — and the compensation is
 *    already there, in the `bad` quality attack penalty.
 *
 * Every generated actor records how it was made in `flags.redsteel.builder`,
 * including the full set of numbers written. v1 never reads that back; it
 * exists so a later re-stamp pass can tell curve output from hand-tuning.
 */

import {
  ARCHETYPES,
  ARCHETYPE_KEYS,
  CURVE_VERSION,
  MAIN_ATTRIBUTES,
  MAX_PL,
  ROLES,
  ROLE_KEYS,
  SECONDARY_ATTRIBUTES,
  averageDamage,
  deriveStats,
} from "../helpers/bestiary-scale.mjs";
import { QUALITY_MODS } from "../documents/item.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const PACK_ID = "redsteel.redsteel-items";
const TEMPLATE = "systems/redsteel/templates/monster-builder.hbs";

/** The lowest the solved damage bonus is allowed to go. See the file header. */
const DAMAGE_BONUS_FLOOR = -5;

/**
 * Thrown weapons come in pairs in the pack: the `thrown: true` entry is the
 * ranged profile and the ` melee` entry is the same object used in hand. The
 * ammunition item exists purely for tracking — ammo carries `roll: null` and no
 * penetration, so it contributes no damage.
 */
const THROWN_KIT = {
  "Throwing axe": { melee: "Throwing axe melee", ammo: "Throwing axes" },
  Javelin: { melee: "Javelin melee", ammo: "Javelins" },
  "Throwing knife": { melee: null, ammo: "Knives" },
};

/** Ammunition attached alongside a bow or a crossbow, for tracking. */
const AMMO_BY_CLASS = { bow: "Arrows", crossbow: "Bolts" };

/** The weapon classes that roll against Archery rather than Combat. */
const ARCHERY_CLASSES = ["bow", "crossbow"];

/**
 * Does this archetype shoot for a living?
 *
 * Read off the allowed weapon classes rather than the archetype's name, so any
 * bow/crossbow archetype gets its attack written to `archery` — where the
 * weapon it is handed actually rolls. Keyed on the name instead, `heavyArcher`
 * would have been given a Combat rating and a Longbow, and would have shot at
 * whatever Archery happened to default to.
 */
function usesArchery(arch) {
  return (
    Array.isArray(arch?.classes) &&
    arch.classes.length > 0 &&
    arch.classes.every((cls) => ARCHERY_CLASSES.includes(cls))
  );
}

/** Which shields each `shield` setting may draw from. */
const SHIELD_POOL = {
  light: ["Small shield"],
  heavy: ["Heather shield", "Tower shield"],
};

const t = (key, data) =>
  data
    ? game.i18n.format(`REDSTEEL.MonsterBuilder.${key}`, data)
    : game.i18n.localize(`REDSTEEL.MonsterBuilder.${key}`);

/** Random element of a non-empty array. */
function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * "STR 45 · DEX 29 · WIL 29" for a list of attribute keys.
 *
 * The abbreviations come from the character sheet's own keys, so the preview
 * says exactly what the sheet says rather than inventing a second vocabulary
 * for the same seven stats.
 */
function attributeLine(attributes, keys) {
  return keys
    .map((key) => {
      const abbr = game.i18n.localize(
        `REDSTEEL.Actor.Character.Attribute.${key.charAt(0).toUpperCase()}${key.slice(1)}.abbr`,
      );
      return `${abbr} ${attributes[key]}`;
    })
    .join(" · ");
}

/** A signed number as a string, for the preview panel. */
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

/** One decimal place, without a trailing ".0". */
const round1 = (n) => Math.round(n * 10) / 10;

/* -------------------------------------------- */
/*  Compendium                                  */
/* -------------------------------------------- */

/**
 * Every item in the redsteel-items compendium, loaded once per session.
 *
 * Read-only: the builder copies items onto actors and never writes to the pack.
 */
let PACK_CACHE = null;

async function loadPackItems() {
  if (PACK_CACHE) return PACK_CACHE;
  const pack = game.packs.get(PACK_ID);
  if (!pack) {
    ui.notifications.error(`Compendium "${PACK_ID}" not found.`);
    PACK_CACHE = [];
    return PACK_CACHE;
  }
  PACK_CACHE = await pack.getDocuments();
  return PACK_CACHE;
}

/**
 * Does this weapon bleed, or reward a sneak attack?
 *
 * The gate behind the assassin's `requiresSneakOrBleed`. A property test rather
 * than a list of weapon names, so a blade added to the pack later qualifies on
 * its own merits and nobody has to remember to update the builder.
 *
 * `sneakDamage` is authored as a formula string and is not consistently blank
 * when unused: some weapons carry "", others the literal "0". Both mean no.
 *
 * @param {object} sys   A weapon's `system` block.
 */
function bleedsOrSneaks(sys) {
  if (Number(sys?.effects?.bleed) > 0) return true;
  const sneak = String(sys?.sneakDamage ?? "").trim();
  return sneak !== "" && sneak !== "0";
}

/** The `damage` term the item's quality contributes to the damage formula. */
function qualityDamage(quality) {
  return Number(QUALITY_MODS.weapon?.[quality]?.damage) || 0;
}

/** The `attack` term the item's quality contributes to the attack roll. */
function qualityAttack(quality) {
  return Number(QUALITY_MODS.weapon?.[quality]?.attack) || 0;
}

/**
 * Every weapon the archetype is allowed to carry, as preview-ready candidates.
 *
 * Filtered on `system.class` ∈ archetype.classes and `system.type` ∈
 * archetype.bands. Excluded from selection:
 * - the ` melee` companion profiles of thrown weapons, which are not standalone
 *   weapons and are attached automatically alongside their thrown parent;
 * - thrown weapons, unless the archetype is flagged `thrown`;
 * - anything `averageDamage()` refuses to score (keep-notation that actually
 *   drops dice, or a missing `system.roll`).
 *
 * @param {object[]} docs   All pack documents.
 * @param {object} arch     The archetype block.
 * @param {boolean} ignoreBands  Fallback pass: allow any weight.
 */
function weaponCandidates(docs, arch, ignoreBands = false) {
  const out = [];
  for (const doc of docs) {
    if (doc.type !== "weapon") continue;
    const sys = doc.system ?? {};
    if (!arch.classes.includes(sys.class)) continue;
    if (!ignoreBands && !arch.bands.includes(sys.type)) continue;
    if (/ melee$/i.test(doc.name)) continue;
    if (sys.thrown === true && !arch.thrown) continue;
    // The assassin kills with bleed and sneak damage, so a light blade that
    // does neither is not a weapon it has any use for.
    if (arch.requiresSneakOrBleed && !bleedsOrSneaks(sys)) continue;

    const candidate = makeCandidate(doc);
    if (candidate) out.push(candidate);
  }
  return out;
}

/**
 * One weapon document as the scoring record the rest of the builder works in.
 *
 * Returns null when the damage cannot be scored (no `system.roll`, or
 * keep-notation that genuinely drops dice), because a weapon the builder cannot
 * price would solve to a nonsense damage bonus.
 *
 * @param {object} doc              A weapon Item, from a pack or the world.
 * @param {{quiet?: boolean}} [opts] Suppress the console warning — used when the
 *                                   caller reports the refusal to the GM itself.
 */
function makeCandidate(doc, { quiet = false } = {}) {
  const sys = doc?.system ?? {};
  const roll = sys.roll ?? null;
  const avg = roll
    ? averageDamage(roll.diceNum, roll.diceSize, roll.diceBonus)
    : null;
  if (!avg) {
    if (!quiet) {
      console.warn(
        `Redsteel | Monster builder: skipping weapon "${doc?.name}" — its damage average could not be computed (roll: ${JSON.stringify(roll)}).`,
      );
    }
    return null;
  }
  return {
    doc,
    name: doc.name,
    cls: sys.class,
    band: sys.type,
    thrown: sys.thrown === true,
    penetration: Number(sys.penetration) || 0,
    attack: Number(sys.attack) || 0,
    defense: Number(sys.defense) || 0,
    avg,
  };
}

/**
 * The weapon pool for an archetype, with the band fallback applied.
 * Returns an empty array when nothing at all matches.
 */
function weaponPool(docs, arch) {
  const banded = weaponCandidates(docs, arch, false);
  if (banded.length) return banded;
  // Fall back to the allowed classes at any weight rather than abandoning the
  // monster. A missing weapon must never abort a batch.
  return weaponCandidates(docs, arch, true);
}

/** Solve the NPC damage bonus for one weapon against the curve's target. */
function solveDamage(candidate, damageTarget, quality) {
  const effective = candidate.avg + qualityDamage(quality);
  const raw = Math.round(damageTarget - effective);
  const damageBonus = Math.max(DAMAGE_BONUS_FLOOR, raw);
  const actual = effective + damageBonus;
  return {
    damageBonus,
    effective,
    actual,
    // True when the floor bit: the weapon alone already beats the curve.
    aboveCurve: actual > damageTarget,
  };
}

/**
 * The weapon a monster of this archetype receives.
 *
 * `diceBiased` archetypes (brute) always take the heaviest hitter available so
 * their threat lives in the dice and their damage bonus stays low. Everyone
 * else rolls, which is what makes a batch of six come out varied.
 */
function chooseWeapon(pool, arch) {
  if (!pool.length) return null;
  if (arch.diceBiased) {
    return pool.reduce((best, c) => (c.avg > best.avg ? c : best), pool[0]);
  }
  return pick(pool);
}

/** The gear item for a shield setting, or null. */
function chooseShield(docs, setting) {
  const names = SHIELD_POOL[setting];
  if (!names?.length) return null;
  const matches = docs.filter(
    (d) => d.type === "gear" && d.system?.shield === true && names.includes(d.name),
  );
  return matches.length ? pick(matches) : null;
}

/** The ammunition item of a given name, or null. */
function findAmmo(docs, name) {
  if (!name) return null;
  return docs.find((d) => d.type === "ammunition" && d.name === name) ?? null;
}

/**
 * The 24 race Items, alphabetical. A generated monster gets a copy of the one
 * the GM picked; NPC races exist to carry bane tags and trait immunities.
 */
function raceChoices(docs) {
  return docs
    .filter((d) => d.type === "race")
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The NPC trait Items: `feature` items whose `system.option` is "trait". There
 * are 168 of them, overwhelmingly immunities, and this is the same filter the
 * NPC sheet's biography tab renders.
 */
function traitChoices(docs) {
  return docs
    .filter((d) => d.type === "feature" && d.system?.option === "trait")
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The 10 Velení command abilities: `ability` items with `system.class` of
 * "command".
 *
 * These need no plumbing to work on an NPC. Every command rolls against
 * `attributeTest: "leadership"`, and resolveTestRating maps that to the NPC's
 * Charisma (module/utils/testRating.mjs), so a support archetype's CHA is
 * already its command rating. Each ability's own `testModifier` encodes its
 * difficulty and is authored per ability — the builder never touches it.
 */
function commandChoices(docs) {
  return docs
    .filter((d) => d.type === "ability" && d.system?.class === "command")
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * `count` commands drawn from `pool` at random **without repeats**, so a rank
 * of six standard bearers does not all shout the same order.
 *
 * Draws from a copy, so the caller's pool is reusable for the next monster in
 * the batch. Returns fewer than asked for only when the pool is smaller than
 * `count`; the caller warns about that once, rather than per monster.
 */
function drawCommands(pool, count) {
  const left = [...pool];
  const out = [];
  const target = Math.min(Math.max(0, count), left.length);
  for (let i = 0; i < target; i++) {
    out.push(left.splice(Math.floor(Math.random() * left.length), 1)[0]);
  }
  return out;
}

/**
 * A stable identifier for a weapon in the manual picker.
 *
 * Prefixed with its source because a world item and a pack item are free to
 * carry the same id, and picking the wrong one would silently arm the monster
 * with somebody else's weapon.
 */
function weaponKey(source, doc) {
  return `${source}:${doc.id ?? doc._id}`;
}

/**
 * Every weapon the GM may pick by hand: the system pack first, then anything of
 * type `weapon` in the world, so homebrew is reachable. The ` melee` companion
 * profiles are left out — they are not standalone weapons, they are attached
 * automatically alongside the thrown weapon they belong to.
 */
function allWeaponEntries(docs) {
  const out = [];
  for (const doc of docs) {
    if (doc.type !== "weapon" || / melee$/i.test(doc.name)) continue;
    out.push({ source: "pack", doc });
  }
  const world = game.items?.filter?.((i) => i.type === "weapon") ?? [];
  for (const doc of world) {
    if (/ melee$/i.test(doc.name)) continue;
    out.push({ source: "world", doc });
  }
  return out;
}

/**
 * The weapon the GM chose by hand, as a scoring candidate.
 *
 * A manual pick **overrides the archetype entirely** — band, class and the
 * assassin's bleed/sneak gate are all ignored. Everything downstream still
 * applies, though: the PL quality stamp, the damage-bonus solve and the
 * above-curve warning. Asking for a bardiche on a PL1 caster gets you a working
 * monster and a warning, not a refusal.
 *
 * Returns null when the key matches nothing, or when the weapon's damage cannot
 * be scored; the caller then falls back to automatic selection.
 */
function resolveCustomWeapon(entries, key) {
  if (!key) return null;
  const entry = entries.find((e) => weaponKey(e.source, e.doc) === key);
  if (!entry) return null;
  return makeCandidate(entry.doc, { quiet: true });
}

/** A pack document as embeddable item data, with the builder's overrides. */
function itemData(doc, overrides = {}) {
  const data = doc.toObject();
  delete data._id;
  for (const [path, value] of Object.entries(overrides)) {
    foundry.utils.setProperty(data, path, value);
  }
  return data;
}

/* -------------------------------------------- */
/*  Actor assembly                              */
/* -------------------------------------------- */

/**
 * Build the creation data for one monster.
 *
 * Everything numeric written here is mirrored verbatim into
 * `flags.redsteel.builder.generated`.
 *
 * @param {object} options
 * @returns {object} Actor creation data.
 */
function buildActorData({
  name,
  folderId,
  stats,
  arch,
  quality,
  docs,
  pool,
  kit = {},
}) {
  // A hand-picked weapon replaces the archetype's own draw outright. Every
  // monster in a batch then carries the same one, which is the point of asking.
  const weapon = kit.weapon ?? chooseWeapon(pool, arch);
  const solved = weapon
    ? solveDamage(weapon, stats.damageTarget, quality)
    : { damageBonus: 0, effective: 0, actual: 0, aboveCurve: false };

  // A shooting archetype's attack skill is archery; its melee stays
  // deliberately poor. A thrown-weapon archetype needs the throwing skill for
  // the same reason — the weapon it was handed rolls against it.
  const isArcher = usesArchery(arch);
  const combat = isArcher ? Math.max(1, stats.attack - 20) : stats.attack;
  const archery = isArcher ? stats.attack : 0;
  const throwing = arch.thrown ? stats.attack : 0;

  const items = [];
  if (weapon) {
    items.push(
      itemData(weapon.doc, {
        "system.equipped": true,
        "system.quality": quality,
        ...(weapon.doc.system?.weaponSet !== undefined
          ? { "system.weaponSet": 1 }
          : {}),
      }),
    );

    // Thrown weapons: the melee profile of the same object, plus its ammo.
    const kit = weapon.thrown ? THROWN_KIT[weapon.name] : null;
    if (kit) {
      const melee = kit.melee
        ? docs.find((d) => d.type === "weapon" && d.name === kit.melee)
        : null;
      if (melee) {
        items.push(
          itemData(melee, {
            "system.equipped": true,
            "system.quality": quality,
          }),
        );
      }
      const ammo = findAmmo(docs, kit.ammo);
      if (ammo) items.push(itemData(ammo));
    } else {
      const ammo = findAmmo(docs, AMMO_BY_CLASS[weapon.cls]);
      if (ammo) items.push(itemData(ammo));
    }
  }

  // Race and traits are plain copies: no equip state, no quality, nothing
  // derived. They exist on an NPC to carry bane tags and trait immunities.
  if (kit.race) items.push(itemData(kit.race));
  for (const trait of kit.traits ?? []) items.push(itemData(trait));

  // Commands are drawn per monster rather than per batch, so six standard
  // bearers created together each get their own orders.
  const commands = drawCommands(kit.commandPool ?? [], stats.commands);
  for (const command of commands) items.push(itemData(command));

  const shield = chooseShield(docs, arch.shield);
  if (shield) {
    items.push(
      itemData(shield, {
        "system.equipped": true,
        "system.quality": quality,
      }),
    );
  }

  const generated = {
    health: stats.health,
    stamina: stats.stamina,
    combat,
    archery,
    throwing,
    meleeDefense: stats.defense,
    rangedDefense: stats.defense,
    dodge: stats.dodge,
    dodgeLimit: stats.dodgeLimit,
    damageBonus: solved.damageBonus,
    armorNatural: stats.armor,
    spd: stats.spd,
    ini: stats.ini,
    mindMax: stats.mindMax,
    mindValue: stats.mindMax,
    cr: stats.pl,
    // Primary attributes, by their own keys. Flat percentages on an NPC — this
    // replaces template.json's default of 50 across the board, which is the
    // point: 50 for everything is what an unconfigured NPC looks like.
    attributes: { ...stats.attributes },
    // Reference values: what the curve asked for, and what the kit delivers.
    // Penetration has no NPC field of its own in this system — it comes from
    // the weapon — so it is recorded rather than written.
    damageTarget: stats.damageTarget,
    damageAverage: round1(solved.actual),
    pen: stats.pen,
  };

  const data = {
    name,
    type: "npc",
    folder: folderId || null,
    system: {
      cr: stats.pl,
      stats: {
        health: { value: stats.health, max: stats.health, base: stats.health },
        stamina: { value: stats.stamina, max: stats.stamina },
        mind: { value: stats.mindMax, max: stats.mindMax },
      },
      attributes: Object.fromEntries(
        Object.entries(stats.attributes).map(([key, value]) => [key, { value }]),
      ),
      combatSkills: {
        combat: { value: combat },
        archery: { value: archery },
        throwing: { value: throwing },
        meleeDefense: { value: stats.defense },
        rangedDefense: { value: stats.defense },
        dodge: { value: stats.dodge },
        damageBonus: { value: solved.damageBonus },
      },
      dodgeLimit: { value: stats.dodgeLimit },
      armor: { natural: { value: stats.armor } },
      secondaryAttributes: {
        spd: { value: stats.spd },
        ini: { value: stats.ini },
      },
    },
    prototypeToken: {
      // -1 is CONST.TOKEN_DISPOSITIONS.HOSTILE.
      disposition: -1,
      actorLink: false,
      bar1: { attribute: "stats.health" },
    },
    items,
    flags: {
      redsteel: {
        builder: {
          pl: stats.pl,
          archetype: stats.archetype,
          role: stats.role,
          impossible: stats.impossible,
          // Authoring input rather than curve output, so it lives beside the
          // three inputs and not inside `generated`.
          race: kit.race?.name ?? null,
          traits: (kit.traits ?? []).map((trait) => trait.name),
          commands: commands.map((command) => command.name),
          customWeapon: kit.weapon ? kit.weapon.name : null,
          curveVersion: CURVE_VERSION,
          generated,
        },
      },
    },
  };

  // Only write an image when the GM actually chose one. Writing "" would stamp
  // an empty path over Foundry's own defaults and leave a blank silhouette.
  if (kit.img) data.img = kit.img;
  if (kit.tokenImg) data.prototypeToken.texture = { src: kit.tokenImg };

  return data;
}

/* -------------------------------------------- */
/*  The dialog                                  */
/* -------------------------------------------- */

class MonsterBuilderApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "redsteel-monster-builder",
    classes: ["redsteel", "rs-monster-builder"],
    window: {
      title: "REDSTEEL.MonsterBuilder.title",
      icon: "fa-solid fa-dragon",
      resizable: true,
    },
    position: { width: 720, height: "auto" },
    actions: {
      createMonsters: MonsterBuilderApp._onCreate,
      addTrait: MonsterBuilderApp._onAddTrait,
      removeTrait: MonsterBuilderApp._onRemoveTrait,
      browseImage: MonsterBuilderApp._onBrowseImage,
    },
  };

  static PARTS = {
    form: { template: TEMPLATE },
  };

  /** The dialog's fields. Transient — nothing here is persisted anywhere. */
  #state = {
    pl: 3,
    archetype: "striker",
    role: "standard",
    count: 1,
    baseName: "",
    folderId: "",
    impossible: false,
    // Appearance and kit. `traitIds` is managed by the add/remove actions
    // rather than scraped from the form, since chips are not form fields.
    raceId: "",
    traitIds: [],
    customWeapon: "",
    img: "",
    tokenImg: "",
    tokenSameAsProfile: true,
  };

  /** Pack documents, loaded once and reused across re-renders. */
  #docs = [];

  /** Guard so a double-click cannot fire two batches. */
  #busy = false;

  /** Bound change listener, removed before re-attaching on each render. */
  #boundChange = null;

  /* ---------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.#docs = await loadPackItems();

    const s = this.#state;
    const stats = deriveStats({
      pl: s.pl,
      archetype: s.archetype,
      role: s.role,
      impossible: s.impossible,
    });
    const arch = ARCHETYPES[stats.archetype];
    const pool = weaponPool(this.#docs, arch);

    const races = raceChoices(this.#docs);
    const traits = traitChoices(this.#docs);
    const weaponEntries = allWeaponEntries(this.#docs);
    const forced = resolveCustomWeapon(weaponEntries, s.customWeapon);

    // A chosen trait that has since vanished (world item deleted mid-session)
    // is dropped from the chips rather than rendering as a blank one.
    const chosenTraits = s.traitIds
      .map((id) => traits.find((d) => (d.id ?? d._id) === id))
      .filter(Boolean);

    const groupOptions = (source) =>
      weaponEntries
        .filter((e) => e.source === source)
        .sort((a, b) => a.doc.name.localeCompare(b.doc.name))
        .map((e) => {
          const value = weaponKey(e.source, e.doc);
          return { value, label: e.doc.name, selected: value === s.customWeapon };
        });

    return Object.assign(context, {
      state: s,
      raceOptions: [
        { value: "", label: t("raceNone"), selected: !s.raceId },
        ...races.map((d) => ({
          value: d.id ?? d._id,
          label: d.name,
          selected: (d.id ?? d._id) === s.raceId,
        })),
      ],
      traitOptions: traits.map((d) => ({
        value: d.id ?? d._id,
        label: d.name,
      })),
      chosenTraits: chosenTraits.map((d) => ({
        id: d.id ?? d._id,
        name: d.name,
      })),
      weaponPackOptions: groupOptions("pack"),
      weaponWorldOptions: groupOptions("world"),
      weaponAutoSelected: !s.customWeapon,
      plOptions: Array.from({ length: MAX_PL }, (_, i) => ({
        value: i + 1,
        label: String(i + 1),
        selected: i + 1 === s.pl,
      })),
      archetypeOptions: ARCHETYPE_KEYS.map((key) => ({
        value: key,
        label: t(`Archetype.${key}`),
        selected: key === s.archetype,
      })),
      roleOptions: ROLE_KEYS.map((key) => ({
        value: key,
        label: t(`Role.${key}`),
        selected: key === s.role,
      })),
      folderOptions: [
        { value: "", label: t("noFolder"), selected: !s.folderId },
        ...game.folders
          .filter((f) => f.type === "Actor")
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((f) => ({
            value: f.id,
            label: f.name,
            selected: f.id === s.folderId,
          })),
      ],
      preview: this.#buildPreview(stats, arch, pool, {
        forced,
        race: races.find((d) => (d.id ?? d._id) === s.raceId) ?? null,
        traits: chosenTraits,
        commandPool: stats.commands ? commandChoices(this.#docs) : [],
      }),
    });
  }

  /**
   * The panel the GM reads before pressing Create.
   *
   * The weapon is picked at creation time, per monster, so the panel shows a
   * *representative* one: the heaviest for a dice-biased archetype (which is
   * what it will actually get), otherwise the pool's median by average damage.
   * The overshoot warning is checked across the whole pool, not just the
   * representative, so a bad draw is announced before it happens.
   */
  #buildPreview(stats, arch, pool, kit = {}) {
    const quality = stats.quality;
    // A hand-picked weapon is not an example of anything — it is the weapon
    // every monster in the batch will carry, so the panel prices that one.
    const example = kit.forced ?? (pool.length ? chooseExample(pool, arch) : null);
    const solved = example
      ? solveDamage(example, stats.damageTarget, quality)
      : null;

    const shieldLabel =
      arch.shield === "none"
        ? t("none")
        : (SHIELD_POOL[arch.shield] ?? []).join(" / ");

    const isArcher = usesArchery(arch);
    const attackWithKit =
      stats.attack + (example?.attack ?? 0) + qualityAttack(quality);

    const rows = [
      { label: t("Row.health"), value: String(stats.health) },
      { label: t("Row.stamina"), value: String(stats.stamina) },
      {
        label: t(isArcher ? "Row.archery" : "Row.combat"),
        value: `${stats.attack} → ${attackWithKit} ${t("withKit")}`,
      },
      ...(isArcher
        ? [{ label: t("Row.combat"), value: String(Math.max(1, stats.attack - 20)) }]
        : []),
      ...(arch.thrown
        ? [{ label: t("Row.throwing"), value: String(stats.attack) }]
        : []),
      { label: t("Row.defense"), value: String(stats.defense) },
      {
        label: t("Row.dodge"),
        value: `${stats.dodge} (${t("Row.dodgeLimit")} ${stats.dodgeLimit})`,
      },
      { label: t("Row.armor"), value: String(stats.armor) },
      { label: t("Row.spd"), value: `${stats.spd} / ${t("Row.ini")} ${stats.ini}` },
      { label: t("Row.mind"), value: String(stats.mindMax) },
      {
        label: t("Row.attrMain"),
        value: attributeLine(stats.attributes, MAIN_ATTRIBUTES),
        cssClass: stats.impossible ? "rs-mb-over" : "",
      },
      {
        label: t("Row.attrSecondary"),
        value: attributeLine(stats.attributes, SECONDARY_ATTRIBUTES),
      },
      {
        label: t("Row.quality"),
        value: game.i18n.localize(`REDSTEEL.Quality.${quality}`),
      },
      {
        label: t("Row.weapon"),
        value: kit.forced
          ? `${kit.forced.name} (${t("chosen")})`
          : example
            ? `${example.name} (${t("example")}, ${t("pool", { n: pool.length })})`
            : t("noWeapon"),
      },
      { label: t("Row.race"), value: kit.race?.name ?? t("none") },
      {
        label: t("Row.traits"),
        value: kit.traits?.length
          ? `${kit.traits.length} — ${kit.traits.map((d) => d.name).join(", ")}`
          : t("none"),
      },
      // Commands are drawn per monster at creation time, so the panel reports
      // how many and out of how many rather than pretending to know which ones
      // this batch will get — a batch of six deliberately differs.
      ...(stats.commands
        ? [
            {
              label: t("Row.commands"),
              value: t("commandsDrawn", {
                n: Math.min(stats.commands, kit.commandPool?.length ?? 0),
                pool: kit.commandPool?.length ?? 0,
              }),
            },
          ]
        : []),
      { label: t("Row.shield"), value: shieldLabel },
      {
        label: t("Row.penetration"),
        value: example
          ? `${example.penetration} (${t("curve")} ${stats.pen})`
          : String(stats.pen),
      },
      {
        label: t("Row.damageBonus"),
        value: solved ? signed(solved.damageBonus) : "—",
      },
      {
        label: t("avgDamage"),
        value: solved
          ? `${round1(solved.actual)} (${t("target")} ${stats.damageTarget})`
          : "—",
        cssClass: solved?.aboveCurve ? "rs-mb-over" : "",
      },
    ];

    // Any weapon that would land above the curve, worst first. With a manual
    // pick there is only one weapon in play, so only that one is checked —
    // warning about a bardiche the GM did not choose would be noise.
    const checked = kit.forced ? [kit.forced] : pool;
    const offenders = checked
      .map((c) => ({ c, s: solveDamage(c, stats.damageTarget, quality) }))
      .filter((e) => e.s.aboveCurve)
      .sort((a, b) => b.s.actual - a.s.actual);

    const warn = offenders.length
      ? t("aboveCurve", {
          weapon: offenders[0].c.name,
          actual: round1(offenders[0].s.actual),
          target: stats.damageTarget,
          count: offenders.length,
        })
      : "";

    return { rows, warn };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    if (!(root instanceof HTMLElement)) return;

    // Re-render replaces the part content but keeps this root, so the delegated
    // listener is removed first rather than stacking a second copy.
    if (this.#boundChange) root.removeEventListener("change", this.#boundChange);
    this.#boundChange = (event) => this.#onFieldChange(event, root);
    root.addEventListener("change", this.#boundChange);
  }

  /**
   * Read every field back into state, then redraw only when the change was to
   * something the preview depends on. Typing a name must not redraw the dialog
   * out from under the caret.
   */
  #onFieldChange(event, root) {
    const field = event.target?.name;
    if (!field) return;
    this.#scrape(root);
    const redraws = [
      "pl",
      "archetype",
      "role",
      "impossible",
      "customWeapon",
      "race",
      "tokenSameAsProfile",
    ];
    // The portrait path only forces a redraw while the token is mirroring it,
    // so the token field can be repainted with the new path. Text inputs fire
    // `change` on blur, so this never interrupts typing.
    if (redraws.includes(field) || (field === "img" && this.#state.tokenSameAsProfile)) {
      this.render();
    }
  }

  /** Pull the current form values into `#state`. */
  #scrape(root) {
    const get = (name) => root.querySelector(`[name="${name}"]`);
    const s = this.#state;
    s.pl = Math.min(MAX_PL, Math.max(1, Number(get("pl")?.value) || 1));
    const archetype = get("archetype")?.value;
    if (ARCHETYPES[archetype]) s.archetype = archetype;
    const role = get("role")?.value;
    if (ROLES[role]) s.role = role;
    s.count = Math.min(20, Math.max(1, Math.floor(Number(get("count")?.value) || 1)));
    s.baseName = String(get("baseName")?.value ?? "").trim();
    s.folderId = String(get("folderId")?.value ?? "");
    // A checkbox reports through `checked`, not `value` — reading `.value` here
    // would give the literal string "on" and be truthy whether it is ticked or
    // not, which is exactly the sort of bug that only shows up as "why is
    // everything Impossible".
    s.impossible = get("impossible")?.checked === true;

    s.raceId = String(get("race")?.value ?? "");
    s.customWeapon = String(get("customWeapon")?.value ?? "");
    s.img = String(get("img")?.value ?? "").trim();
    s.tokenSameAsProfile = get("tokenSameAsProfile")?.checked === true;
    // While mirroring is on the token path is not the GM's to set, so it is
    // taken from the portrait rather than read back off a disabled input.
    s.tokenImg = s.tokenSameAsProfile
      ? s.img
      : String(get("tokenImg")?.value ?? "").trim();
    // `traitIds` is deliberately not read here: chips are not form fields, and
    // scraping would wipe the list every time any other control changed.
  }

  /* ---------------------------------------- */

  /**
   * ApplicationV2 calls action handlers with `this` bound to the application
   * instance, which is why a static method may reach a private one here.
   */
  static async _onCreate(event) {
    event.preventDefault();
    return this.#createBatch();
  }

  /**
   * Add whatever the trait picker is showing to the chip list.
   *
   * Adding the same trait twice is a no-op rather than an error: 168 entries is
   * long enough that losing your place and re-picking one is normal.
   *
   * @this {MonsterBuilderApp}
   */
  static async _onAddTrait(event) {
    event.preventDefault();
    const root = this.element;
    if (!(root instanceof HTMLElement)) return;
    this.#scrape(root);
    const id = root.querySelector('[name="traitPick"]')?.value;
    if (id && !this.#state.traitIds.includes(id)) this.#state.traitIds.push(id);
    return this.render();
  }

  /**
   * Drop one trait chip.
   * @this {MonsterBuilderApp}
   */
  static async _onRemoveTrait(event, target) {
    event.preventDefault();
    const root = this.element;
    if (root instanceof HTMLElement) this.#scrape(root);
    const id = target?.dataset?.traitId;
    this.#state.traitIds = this.#state.traitIds.filter((x) => x !== id);
    return this.render();
  }

  /**
   * Pick an image path with core's FilePicker.
   *
   * Unlike the sheet's version there is no document to update yet, so the
   * callback writes the path into dialog state and re-renders. The current form
   * values are scraped first, or a browse would discard whatever was typed
   * before it.
   *
   * @this {MonsterBuilderApp}
   */
  static async _onBrowseImage(event, target) {
    event.preventDefault();
    const root = this.element;
    if (root instanceof HTMLElement) this.#scrape(root);

    const field = target?.dataset?.target === "tokenImg" ? "tokenImg" : "img";
    const fp = new FilePicker({
      current: this.#state[field] || "",
      type: "image",
      callback: (path) => {
        this.#state[field] = path;
        if (field === "img" && this.#state.tokenSameAsProfile) {
          this.#state.tokenImg = path;
        }
        this.render();
      },
      top: (this.position?.top ?? 0) + 40,
      left: (this.position?.left ?? 0) + 10,
    });
    return fp.browse();
  }

  async #createBatch() {
    if (this.#busy) return null;
    const root = this.element;
    if (root instanceof HTMLElement) this.#scrape(root);

    const s = this.#state;
    const stats = deriveStats({
      pl: s.pl,
      archetype: s.archetype,
      role: s.role,
      impossible: s.impossible,
    });
    const arch = ARCHETYPES[stats.archetype];
    const quality = stats.quality;
    const docs = this.#docs.length ? this.#docs : await loadPackItems();
    const pool = weaponPool(docs, arch);

    // Resolve the kit once for the whole batch: every monster in it gets the
    // same race, traits, weapon and artwork.
    const weaponEntries = allWeaponEntries(docs);
    let forced = resolveCustomWeapon(weaponEntries, s.customWeapon);
    if (s.customWeapon && !forced) {
      // The pick vanished, or its damage cannot be scored. Say so and fall back
      // to automatic selection rather than refusing the batch.
      ui.notifications.warn(t("customWeaponUnusable"));
      forced = null;
    }
    const race = docs.find((d) => d.type === "race" && (d.id ?? d._id) === s.raceId) ?? null;
    const traits = s.traitIds
      .map((id) =>
        docs.find(
          (d) =>
            d.type === "feature" &&
            d.system?.option === "trait" &&
            (d.id ?? d._id) === id,
        ),
      )
      .filter(Boolean);
    // Commands are resolved once for the batch; each monster draws its own set
    // from this pool. A stripped pack warns once and attaches what exists,
    // rather than failing the batch.
    const commandPool = stats.commands ? commandChoices(docs) : [];
    if (stats.commands && commandPool.length < stats.commands) {
      ui.notifications.warn(
        t("notEnoughCommands", {
          wanted: stats.commands,
          found: commandPool.length,
        }),
      );
    }

    const kit = {
      weapon: forced,
      race,
      traits,
      commandPool,
      img: s.img,
      tokenImg: s.tokenSameAsProfile ? s.img : s.tokenImg,
    };

    if (!pool.length && !forced) ui.notifications.warn(t("noWeapon"));

    // Capitalised English archetype key, so names stay stable whatever language
    // the client runs in. The GM overrides it with the Name field.
    const base =
      s.baseName ||
      `${stats.archetype.charAt(0).toUpperCase()}${stats.archetype.slice(1)} PL${stats.pl}`;

    const payload = [];
    for (let i = 0; i < s.count; i++) {
      payload.push(
        buildActorData({
          name: s.count > 1 ? `${base} ${i + 1}` : base,
          folderId: s.folderId,
          stats,
          arch,
          quality,
          docs,
          pool,
          kit,
        }),
      );
    }

    this.#busy = true;
    try {
      const created = await Actor.createDocuments(payload);
      ui.notifications.info(t("created", { count: created.length }));
      return created;
    } catch (err) {
      console.error("Redsteel | Monster builder failed to create actors:", err);
      ui.notifications.error(t("createFailed"));
      return null;
    } finally {
      this.#busy = false;
    }
  }
}

/**
 * The weapon shown in the preview: the heaviest for a dice-biased archetype
 * (which is genuinely what it will get), the pool's median otherwise.
 */
function chooseExample(pool, arch) {
  if (arch.diceBiased) {
    return pool.reduce((best, c) => (c.avg > best.avg ? c : best), pool[0]);
  }
  const sorted = [...pool].sort((a, b) => a.avg - b.avg);
  return sorted[Math.floor(sorted.length / 2)];
}

/* -------------------------------------------- */
/*  Entry point                                 */
/* -------------------------------------------- */

/** Open the Monster Builder. GM only. */
export function monsterBuilder() {
  if (!game.user.isGM) {
    ui.notifications.warn(t("gmOnly"));
    return null;
  }
  return new MonsterBuilderApp().render(true);
}
