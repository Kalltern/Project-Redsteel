/**
 * Bestiary scale — the tunable numbers behind the Monster Builder.
 *
 * This file is deliberately pure data plus a couple of pure functions: no
 * Foundry API, no document access, nothing that needs a running world. It is
 * the one file a GM edits to rebalance generated monsters, so everything in it
 * is meant to be read and changed by hand.
 *
 * The numbers below are a **provisional starting guess**, not a balance model.
 * Being wrong here is cheap: every generated monster records the curve version
 * and the exact numbers it was stamped with (`flags.redsteel.builder`), so a
 * later pass can tell what came from the curve and what was hand-tuned.
 *
 * Bump CURVE_VERSION whenever any number in this file changes, so old monsters
 * stay identifiable as products of the old curve.
 */

export const CURVE_VERSION = 8;

/** Highest Power Level the builder offers. */
export const MAX_PL = 10;

/**
 * Power Level 1-10. Index 0 is unused so a PL reads as its own index — do not
 * remove the leading `null` or every monster shifts one rung.
 *
 * attack/defense are roll-under percentages written straight onto the NPC's
 * combat skills. health is hit points. stamina is the stamina pool. damage is
 * the *target average damage per hit* the builder solves the weapon's damage
 * bonus against. pen and armor are flat points. attrMain/attrSecondary are the
 * primary attribute percentages (see the band notes on each).
 *
 * attack/defense, stamina and both attribute rows are calibrated against the
 * GM's hand-authored difficulty tables. health, damage, pen and armor are still
 * the original provisional guess.
 */
export const PL_CURVE = {
  // Mapped onto the GM's "Útoky" difficulty bands. Not a straight ×10 ladder:
  // the top rungs pull away deliberately, so PL9-10 is a different order of
  // problem rather than more of the same.
  attack: [null, 15, 25, 35, 45, 55, 70, 80, 95, 115, 140],
  defense: [null, 15, 25, 35, 45, 55, 70, 80, 95, 115, 140],
  health: [null, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150],
  // The GM's table lists PL1-PL8 and PL10; PL9 (95) is an interpolation
  // between them, not an authored figure.
  stamina: [null, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100],
  damage: [null, 7, 10, 12, 15, 18, 21, 24, 26, 29, 32],
  pen: [null, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15],
  armor: [null, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15],

  // Primary attributes are flat roll-under percentages on an NPC (the 1-7
  // character scale does not apply). Two rows, because the GM's tables put
  // str/dex/wil on a noticeably higher scale than the rest.
  //
  // Every rung below sits inside the right band of the GM's difficulty table.
  // Keep it that way when re-tuning:
  //   main band boundaries:      0-35 weak | 40-75 medium | 80-115 hard |
  //                              120-145 very hard | 150+ legendary
  attrMain: [null, 20, 30, 45, 60, 75, 90, 110, 125, 140, 150],
  //   secondary band boundaries: 0-25 weak | 35-45 medium | 55-65 hard |
  //                              75-85 very hard | 95+ legendary
  attrSecondary: [null, 15, 20, 35, 40, 45, 55, 65, 75, 85, 95],
};

/**
 * str/dex/wil, in the order the preview prints them. Usually the archetype's
 * `keyAttribute` is one of these and takes the full attrMain value while the
 * other two are scaled down by OFF_KEY_RATIO — but the key attribute is not
 * required to live in this group (see the archer).
 */
export const MAIN_ATTRIBUTES = ["str", "dex", "wil"];

/**
 * end/int/cha/per. `end` always takes the full attrSecondary value (everything
 * with hit points needs to be able to soak), as does the archetype's
 * `flavourAttribute` when it has one. The rest are scaled by OFF_KEY_RATIO.
 *
 * An archetype may name one of these as its `keyAttribute`, in which case it
 * takes the full **attrMain** value instead and leaves the secondary band
 * behind entirely. See the archer.
 */
export const SECONDARY_ATTRIBUTES = ["end", "int", "cha", "per"];

/**
 * What an attribute the archetype does not care about is worth, as a fraction
 * of the one it does. High enough that a monster is never trivially exploited
 * through its off-stats, low enough that the key attribute still reads as the
 * creature's identity.
 */
export const OFF_KEY_RATIO = 0.65;

/**
 * The "Impossible" override: str, dex and wil forced to this, ignoring the
 * curve. Secondary attributes stay on the PL curve.
 *
 * The number is chosen against what a player can actually reach. A maximalist
 * PC tops out around 130 on a main attribute, ~150 with Desperate Effort, and
 * a little higher with stacked bonuses. So PL10's 150 is legendary but
 * genuinely contestable — a great character can beat it. 300 is not: it is for
 * the handful of things in the setting that are simply not to be out-muscled,
 * out-manoeuvred or out-willed, and the GM opts into it per monster.
 */
export const IMPOSSIBLE_ATTRIBUTE = 300;

/**
 * Archetypes: how a monster fights, independent of how strong it is.
 *
 * `hp`, `damage` and `stamina` are multipliers on the PL curve (`stamina` is
 * optional and absent means 1.0); `armor`/`attack`/`defense` are flat offsets.
 *
 * `keyAttribute` is the one of str/dex/wil this creature is built around — it
 * gets the full attrMain value and the other two are scaled by OFF_KEY_RATIO.
 * `flavourAttribute` does the same job one tier down, for the archetypes that
 * lean on a secondary attribute (the caster's intellect); `end` is always full
 * regardless.
 *
 * `speed` and `initiative` are optional flat overrides. Absent means the
 * defaults: speed 5, initiative 2 + floor(PL / 2). `commands` opts the
 * archetype into carrying Velení command abilities (see COMMAND_COUNT).
 *
 * **Speed does not scale with Power Level, by design.** It is a flat number per
 * archetype and the GM was explicit about that: a heavy archer is slow because
 * of what it is, not because of how dangerous it is, and a PL10 one is no
 * quicker on its feet than a PL1 one. Do not wire it into the curve.
 *
 * `bands` and `classes` filter the weapon compendium (`system.type` and
 * `system.class` respectively). An archetype is a role shape, not a literal job
 * title: "archer" covers crossbowmen, "striker" covers a heavy-polearm pikeman.
 *
 * `shield` is "none" | "light" | "heavy". `diceBiased` makes the builder always
 * take the heaviest-hitting weapon it may use rather than randomising, which
 * keeps the brute's threat in its dice instead of its damage bonus. `thrown`
 * allows thrown weapons to be selected (and pulls in the melee profile plus
 * ammunition alongside them).
 */
export const ARCHETYPES = {
  tank: {
    hp: 1.4,
    armor: +8,
    attack: -5,
    defense: +15,
    damage: 0.8,
    stamina: 1.5,
    keyAttribute: "str",
    bands: ["light", "medium"],
    classes: ["sword", "axe", "blunt"],
    shield: "heavy",
  },
  striker: {
    hp: 1.0,
    armor: 0,
    attack: 0,
    defense: 0,
    damage: 1.0,
    keyAttribute: "str",
    bands: ["light", "medium", "heavy"],
    classes: ["sword", "axe", "blunt", "polearm"],
    shield: "none",
  },
  brute: {
    hp: 1.25,
    armor: +2,
    attack: -5,
    defense: -10,
    damage: 1.4,
    stamina: 1.4,
    keyAttribute: "str",
    bands: ["heavy"],
    classes: ["axe", "blunt", "polearm"],
    shield: "none",
    diceBiased: true,
  },
  skirmisher: {
    hp: 0.75,
    armor: -2,
    attack: +5,
    defense: +5,
    damage: 0.85,
    keyAttribute: "dex",
    bands: ["light", "medium"],
    classes: ["sword", "axe", "polearm"],
    shield: "light",
    thrown: true,
  },
  archer: {
    hp: 0.8,
    armor: -2,
    attack: 0,
    defense: -10,
    damage: 1.0,
    // Perception, not Dexterity: an archer is defined by what it can see, and
    // this is the one archetype whose key attribute sits outside str/dex/wil.
    keyAttribute: "per",
    // Flat 3: an archer plants itself and shoots. Not a curve value.
    speed: 3,
    bands: ["light", "medium", "heavy"],
    classes: ["bow", "crossbow"],
    shield: "none",
  },
  heavyArcher: {
    // The most durable thing this builder can produce: at PL10 boss it lands
    // around 720 HP, above the tank's 630. Being hard to remove from the board
    // IS the archetype — its damage is explicitly secondary (damage 1.0, not
    // the brute's 1.4).
    //
    // DELIBERATE, and it looks like a mistake if you skim it: the lowest
    // defense in the set sits next to the highest HP. Hard to *remove* is not
    // hard to *hit*. Attacks land on this thing constantly and barely matter —
    // it is a siege emplacement the party has to grind down while it keeps
    // shooting, not something that evades. Do NOT "fix" the low defense or the
    // 25 dodge limit to match the high HP; that destroys the archetype.
    //
    // Durability rides on `hp` rather than `armor` on purpose: hp is a
    // multiplier and so scales evenly across all ten rungs, while armor is a
    // flat offset that is proportionally enormous at PL1 and modest at PL10.
    // Armor therefore stops at the tank's +8 rather than going beyond it.
    hp: 1.6,
    armor: +8,
    attack: 0,
    defense: -10,
    damage: 1.0,
    keyAttribute: "per",
    // Slow, armoured, and it does not evade.
    speed: 2,
    // Flat 2 at every Power Level, deliberately far below everyone else. This
    // thing shoots last, always. Do not fold it back into the scaling formula.
    initiative: 2,
    // Medium and heavy bows/crossbows, which in this pack is three weapons:
    // Longbow (5d8k5+2, avg 24.5), Heavy Crossbow (8d4+3, avg 23, pen 25) and
    // Crossbow (3d6+3, avg 13.5, pen 12).
    //
    // `medium` is in the list specifically to make low Power Levels work. With
    // heavy-only, both weapons averaged ~24 against a PL1 damage target of 6,
    // so the solved bonus floored at -5 and a PL1 heavy archer still hit for
    // ~19 — roughly three times curve, with no lighter option to draw instead.
    // Quality cannot compensate, since it moves accuracy rather than damage.
    // The Crossbow gives the low rungs something proportionate to pick.
    //
    // `diceBiased` is deliberately NOT set: it would collapse the archetype
    // onto the Longbow at every Power Level and undo exactly that fix.
    bands: ["medium", "heavy"],
    classes: ["bow", "crossbow"],
    shield: "none",
  },
  assassin: {
    hp: 0.6,
    armor: -4,
    attack: +10,
    defense: -5,
    damage: 0.9,
    keyAttribute: "dex",
    bands: ["light"],
    classes: ["sword", "axe"],
    shield: "none",
    thrown: true,
    // The whole archetype: it may only carry something that bleeds or that
    // rewards a sneak attack (see requiresSneakOrBleed in monsterBuilder.mjs).
    // A light blade with neither is a worse version of a striker.
    //
    // Its sneak damage comes from the *weapon*, never from the builder. The
    // actor's own dice count is the GM's call, authored on the NPC sheet as
    // `system.sneakDice` and defaulting to one d6; combatSkillBonuses adds the
    // weapon's own on top, so an NPC assassin with a Dagger already sneaks for
    // 1d6 + 4d6 out of the builder. Do not set `sneakDice` or
    // `sneakDamageBonus` here: a stronger assassin is a sheet edit, not a
    // scaling rule.
    requiresSneakOrBleed: true,
  },
  caster: {
    hp: 0.7,
    armor: -4,
    attack: -10,
    defense: -15,
    damage: 1.1,
    keyAttribute: "wil",
    flavourAttribute: "int",
    bands: ["light"],
    classes: ["sword", "blunt", "polearm"],
    shield: "none",
  },
  support: {
    // A standard bearer. Roughly skirmisher-grade in a fight and worse at
    // hitting things; what it actually does is shape the battle through Velení.
    hp: 0.75,
    armor: 0,
    attack: -10,
    defense: 0,
    damage: 0.7,
    // Charisma is LOAD-BEARING here, not flavour. resolveTestRating maps the
    // "leadership" test to `attributes.cha.value` for an NPC
    // (module/utils/testRating.mjs), so this creature's CHA *is* the number its
    // commands are rolled against. It therefore takes the full attrMain value,
    // the same exception the archer's Perception takes.
    //
    // It will look wrong if you skim it: CHA on the main curve breaches the
    // GM's "Zbylé vlastnosti" band table, whose legendary rung is 95, not 150.
    // Demoting it to the secondary curve would silently gut the archetype — a
    // PL10 standard bearer would issue commands at 95 instead of 150. Leave it.
    keyAttribute: "cha",
    // `polearm` is in the list so it can draw a Staff or a Spear, which reads
    // as a banner pole. The Small shield is because it stands in the formation.
    bands: ["light", "medium"],
    classes: ["sword", "blunt", "polearm"],
    shield: "light",
    commands: true,
  },
};

/** Selectable archetype keys, in menu order. */
export const ARCHETYPE_KEYS = Object.keys(ARCHETYPES);

/**
 * Roles: how much of a monster this one is.
 *
 * The multipliers differ per stat on purpose. A minion should be fragile, not
 * harmless — it keeps most of its damage and only loses a little accuracy, so
 * six of them are still a fight. `offset` is a flat shift on both attack and
 * defense.
 */
export const ROLES = {
  minion: { hp: 0.65, damage: 0.8, offset: -5 },
  standard: { hp: 1.0, damage: 1.0, offset: 0 },
  elite: { hp: 1.5, damage: 1.15, offset: +5 },
  boss: { hp: 3.0, damage: 1.3, offset: +10 },
};

/** Selectable role keys, in menu order. */
export const ROLE_KEYS = Object.keys(ROLES);

/**
 * Dodge shaping per archetype: `limit` is `system.dodgeLimit.value` (the cap on
 * how much dodging can do for this creature), `bonus` is added to the derived
 * defense to get the dodge skill. Anything not listed uses DEFAULT_DODGE.
 */
export const DODGE_PROFILE = {
  tank: { limit: 25, bonus: 0 },
  skirmisher: { limit: 75, bonus: 10 },
  // Deliberately just under the skirmisher. The assassin survives by not being
  // hit, so it needs a real dodge — but the skirmisher stays the definitive
  // mobility archetype and must keep the higher pair. Do not level these up.
  assassin: { limit: 70, bonus: 5 },
  // Matches the tank: too slow and too armoured to get out of the way.
  heavyArcher: { limit: 25, bonus: 0 },
};

/** Dodge shaping for every archetype not named in DODGE_PROFILE. */
export const DEFAULT_DODGE = { limit: 50, bonus: 0 };

/**
 * How many Velení commands an archetype flagged `commands` carries, by Power
 * Level. Index 0 unused, same as PL_CURVE.
 *
 * The commands themselves are drawn at random without repeats from the ten in
 * the pack, so a rank of standard bearers does not issue the same order.
 */
export const COMMAND_COUNT = [null, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4];

/**
 * Power Level is expressed through *equipment quality*, not weapon weight.
 *
 * Weapon weight is flavour and archetype identity — a PL1 brute with a bardiche
 * is a legitimate monster — so the builder never gates the weapon list by PL.
 * Quality carries the level instead: per QUALITY_MODS in item.mjs this spans
 * attack -5 at PL1 to +8 at PL10, a 13-point swing, plus precision and crit
 * chance at the top. Index 0 unused, same as PL_CURVE.
 */
export const PL_QUALITY = [
  null,
  "bad",
  "bad",
  "normal",
  "normal",
  "normal",
  "expert",
  "expert",
  "master",
  "master",
  "legendary",
];

/* -------------------------------------------- */
/*  Pure helpers                                */
/* -------------------------------------------- */

/** Keep a Power Level inside the curve's range. */
function clampPl(pl) {
  const n = Math.floor(Number(pl) || 1);
  return Math.min(MAX_PL, Math.max(1, n));
}

/**
 * Average of `NdX + B`, as authored on a weapon's `system.roll`.
 *
 * `diceSize` is **not always an integer**: some weapons use keep-notation, e.g.
 * the Longbow's `"8k5"` meaning `5d8k5`. A naive `Number(diceSize)` yields NaN,
 * an average of 0, and a huge solved damage bonus — precisely the broken
 * configuration the builder exists to avoid. So:
 *
 * - the die size is the leading integer;
 * - a `k<Y>` clause where `Y === diceNum` keeps every die, so it is a plain NdX
 *   (this is the Longbow case);
 * - a `k<Y>` clause where `Y < diceNum` genuinely changes the distribution and
 *   is **not** approximated — this returns null so the caller excludes the
 *   weapon from automatic selection;
 * - anything unparsable, or an average that comes out at or below zero, also
 *   returns null. It never silently returns 0.
 *
 * `diceBonus` is a String on pack items and may carry a leading "+"
 * (Great hammer authors it as `"+2"`), which Number() handles.
 *
 * @param {number|string} diceNum
 * @param {number|string} diceSize
 * @param {number|string} [diceBonus]
 * @returns {number|null}   The average, or null when the weapon must be skipped.
 */
export function averageDamage(diceNum, diceSize, diceBonus) {
  const num = Math.floor(Number(diceNum) || 0);
  if (num <= 0) return null;

  const raw = String(diceSize ?? "").trim();
  const match = /^(\d+)\s*(?:k\s*(\d+))?$/i.exec(raw);
  if (!match) return null;

  const size = Number(match[1]);
  if (!Number.isFinite(size) || size <= 0) return null;

  if (match[2] !== undefined) {
    const keep = Number(match[2]);
    // Keeping fewer dice than are rolled shifts the average upward by an amount
    // this function will not guess at. Excluded rather than approximated.
    if (!Number.isFinite(keep) || keep < num) return null;
  }

  const bonus = Number(String(diceBonus ?? "").trim() || 0);
  const total = num * ((size + 1) / 2) + (Number.isFinite(bonus) ? bonus : 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  return total;
}

/**
 * The full derived stat block for one PL / archetype / role combination.
 *
 * Pure — no Foundry, no randomness. Everything the builder writes onto an actor
 * comes from here, which is what makes the numbers reproducible and testable.
 *
 * Note `pen` is returned for reference and preview only: NPCs have no
 * penetration field of their own in this system, their penetration comes from
 * the weapon they carry.
 *
 * @param {object} options
 * @param {number} options.pl            Power Level 1-10.
 * @param {string} options.archetype     ARCHETYPES key.
 * @param {string} options.role          ROLES key.
 * @param {boolean} [options.impossible] Force str/dex/wil to
 *                                       IMPOSSIBLE_ATTRIBUTE, ignoring the
 *                                       curve. Secondary attributes are not
 *                                       affected.
 * @returns {object}
 */
export function deriveStats({ pl, archetype, role, impossible = false } = {}) {
  const level = clampPl(pl);
  const archKey = ARCHETYPES[archetype] ? archetype : "striker";
  const roleKey = ROLES[role] ? role : "standard";
  const arch = ARCHETYPES[archKey];
  const rl = ROLES[roleKey];
  const dodgeProfile = DODGE_PROFILE[archKey] ?? DEFAULT_DODGE;

  const attack = Math.max(
    1,
    Math.round(PL_CURVE.attack[level] + arch.attack + rl.offset),
  );
  const defense = Math.max(
    1,
    Math.round(PL_CURVE.defense[level] + arch.defense + rl.offset),
  );
  const health = Math.max(
    1,
    Math.round(PL_CURVE.health[level] * arch.hp * rl.hp),
  );
  const stamina = Math.max(
    1,
    Math.round(PL_CURVE.stamina[level] * (arch.stamina ?? 1)),
  );

  // Primary attributes. The archetype's key attribute reads at full curve
  // value and everything it does not care about is scaled down, so a creature's
  // numbers say what it is before anyone reads its name.
  const main = PL_CURVE.attrMain[level];
  const secondary = PL_CURVE.attrSecondary[level];
  //
  // The key attribute takes the full attrMain value wherever it lives. It is
  // normally one of str/dex/wil, but it does not have to be: the archer's key
  // attribute is Perception, which is otherwise a secondary. That is a
  // deliberate exception to the GM's "Zbylé vlastnosti" band table (whose
  // legendary rung is 95+, not 150), approved on the grounds that Perception is
  // what an archer *is* — the band table describes ordinary secondaries, and an
  // archer's sight is not one.
  const attributes = {};
  for (const key of MAIN_ATTRIBUTES) {
    attributes[key] =
      key === arch.keyAttribute ? main : Math.round(main * OFF_KEY_RATIO);
  }
  for (const key of SECONDARY_ATTRIBUTES) {
    if (key === arch.keyAttribute) {
      attributes[key] = main;
      continue;
    }
    attributes[key] =
      key === "end" || key === arch.flavourAttribute
        ? secondary
        : Math.round(secondary * OFF_KEY_RATIO);
  }
  // The Impossible override replaces str/dex/wil outright, plus the archetype's
  // key attribute when that key lives outside the main group (the archer's
  // Perception). It is not a multiplier, and it leaves the rest of the
  // secondary row on the curve.
  //
  // The key attribute is included because the intent is a creature that cannot
  // be beaten in a contest, and a creature that is unbeatable at everything
  // *except the thing it is famous for* is not that. An Impossible archer whose
  // Perception stayed at the curve would be out-seen by a good scout while
  // being unmovable, which reads as a bug at the table even when it is not.
  if (impossible) {
    for (const key of MAIN_ATTRIBUTES) attributes[key] = IMPOSSIBLE_ATTRIBUTE;
    if (arch.keyAttribute && !MAIN_ATTRIBUTES.includes(arch.keyAttribute)) {
      attributes[arch.keyAttribute] = IMPOSSIBLE_ATTRIBUTE;
    }
  }

  return {
    pl: level,
    archetype: archKey,
    role: roleKey,
    attack,
    defense,
    dodge: Math.max(1, defense + dodgeProfile.bonus),
    dodgeLimit: dodgeProfile.limit,
    health,
    stamina,
    attributes,
    impossible: !!impossible,
    armor: Math.max(0, Math.round(PL_CURVE.armor[level] + arch.armor)),
    pen: PL_CURVE.pen[level],
    damageTarget: Math.round(PL_CURVE.damage[level] * arch.damage * rl.damage),
    // Flat per archetype, never scaled — see the note on ARCHETYPES.
    spd: arch.speed ?? 5,
    ini: arch.initiative ?? 2 + Math.floor(level / 2),
    mindMax: 2 + Math.floor(level / 3),
    // How many commands to draw. Zero for every archetype not flagged.
    commands: arch.commands ? COMMAND_COUNT[level] : 0,
    quality: PL_QUALITY[level],
  };
}
