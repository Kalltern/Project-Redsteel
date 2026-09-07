/**
 * Aimed Attack system.
 *
 * Modifies any attack to target a specific body part (head, hands, or legs).
 * The attack roll already includes the hit penalty; if the resulting margin of
 * success (SU) is ≥ 0, the aimed part was hit and its special effect applies.
 * If SU < 0 the attack still lands but in the torso — no special effect.
 *
 * Head:  -15% hit, +20% stagger chance, +10% precision chance on hit
 * Hands: -10% hit, applies maimed_hands (disadvantage on every attack, 2t)
 * Legs:  -10% hit, applies maimed_legs  (disadvantage on dodge, 2t)
 *
 * Both wounds work through the advantage buckets in utils/rollAdvantage.mjs:
 * maimed_hands adds -1 to `attack` (tagged on every attack roll), maimed_legs
 * adds -1 to `dodge` (tagged on the dodge defense roll).
 *
 * Armor coverage per location. A landed aimed strike (SU >= 0) on a location
 * the target has no armor over ignores base armor for that damage packet;
 * typed/elemental armor and resistances are untouched, so a fire ward still
 * burns whether or not the skull is bare. See resolveAimedArmorBypass below,
 * called from evaluateAttackDamage in utils/applyDamage.mjs.
 *
 * Where the coverage comes from differs by actor type, because the data does:
 *  - Characters: derived from the kit. Gear carries a `helmet` flag and
 *    nothing else says which limb a piece covers, so only the head can be
 *    read off equipment; hands and legs always count as armored. A PC with a
 *    bare head keeps the armor that is not worn kit (natural armor from race
 *    or mutation, and anything an Active Effect granted) — only
 *    system.armor.worn is dropped.
 *  - NPCs: set by hand from the three toggles on the sheet header. An NPC's
 *    protection is one number the GM typed, and the toggle is the only thing
 *    saying whether it reaches this location, so an exposed location keeps
 *    none of it. A beast whose hide covers its skull is expressed by leaving
 *    the head toggle on.
 *
 * NPC body-part overrides live as actor flags:
 *   flags.redsteel.bodyParts = {
 *     head:  { armored: false, staggerMod: 20, bleedMod: 0, precisionMod: 0 },
 *     hands: { armored: true, ... },
 *     legs:  { armored: true, ... },
 *   }
 * `armored` absent means armored, so every NPC that predates the toggles keeps
 * the protection it had. The *Mod fields are read at apply-damage time per
 * target (see getBodyPartOverrides).
 */

export const AIMED_PARTS = {
  head: {
    label: "Head",
    attackPenalty: -15,
    effectId: null,
    staggerBonus: 20,
    precisionBonus: 10,
  },
  hands: {
    label: "Hands",
    attackPenalty: -10,
    effectId: "maimed_hands",
    staggerBonus: 0,
    precisionBonus: 0,
  },
  legs: {
    label: "Legs",
    attackPenalty: -10,
    effectId: "maimed_legs",
    staggerBonus: 0,
    precisionBonus: 0,
  },
};

/**
 * Show the Aimed Attack body-part selection dialog.
 * Returns "head", "hands", or "legs". Resolves to null only if closed
 * without a selection (Escape key).
 *
 * IMPORTANT: resolve() must be called BEFORE dialog.close() because the
 * Dialog `close` hook fires synchronously inside close() and would otherwise
 * resolve the promise with null first.
 */
export function selectAimedPart() {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const style = `
      <style>
        .aimed-part-list { list-style:none; padding:0; margin:4px 0 0; }
        .aimed-part-list li {
          padding: 7px 8px;
          border-bottom: 1px solid #555;
          cursor: pointer;
          font-size: 14px;
          border-radius: 3px;
        }
        .aimed-part-list li:last-child { border-bottom: none; }
        .aimed-part-list li:hover { background: rgba(255,255,255,0.09); }
        .aimed-part-list li b { display: inline-block; min-width: 55px; }
        .aimed-part-list .penalty { color: #e88; font-size: 12px; }
        .aimed-part-list .bonus  { color: #8e8; font-size: 12px; }
      </style>
    `;

    const content = `
      ${style}
      <ul class="aimed-part-list">
        <li data-part="head">
          <b>Head</b>
          <span class="penalty">−15% hit</span>
          <span class="bonus"> | +20% stun, +10% precision</span>
        </li>
        <li data-part="hands">
          <b>Hands</b>
          <span class="penalty">−10% hit</span>
          <span class="bonus"> | Disadv. on all attacks (2t)</span>
        </li>
        <li data-part="legs">
          <b>Legs</b>
          <span class="penalty">−10% hit</span>
          <span class="bonus"> | Disadv. dodge (2t)</span>
        </li>
      </ul>
    `;

    const dialog = new Dialog({
      title: "Aimed Attack — Choose Target",
      content,
      buttons: {},
      render: (html) => {
        html.find("[data-part]").each((_, el) => {
          el.addEventListener("click", () => {
            settle(el.dataset.part);
            dialog.close();
          });
        });
      },
      // Escape / window X — no part chosen, cancel the aimed attack
      close: () => settle(null),
    });
    dialog.render(true);
  });
}

/**
 * Get NPC body-part overrides for a target actor and part.
 * Returns safe defaults (all zeros) if no overrides are set.
 */
export function getBodyPartOverrides(targetActor, part) {
  const defaults = {
    armorMod: 0,
    staggerMod: 0,
    bleedMod: 0,
    precisionMod: 0,
  };
  if (!targetActor || !part) return defaults;
  const bodyParts = targetActor.getFlag?.("redsteel", "bodyParts") ?? {};
  return { ...defaults, ...(bodyParts[part] ?? {}) };
}

/**
 * Whether `part` is covered by armor on this actor.
 *
 * Unknown actors and parts answer "armored": nothing should lose its armor
 * because a location could not be identified.
 *
 * @param {Actor} actor
 * @param {string} part One of AIMED_PARTS.
 * @returns {boolean}
 */
export function isLocationArmored(actor, part) {
  if (!actor || !part || !AIMED_PARTS[part]) return true;

  if (actor.type === "character") {
    // Only the head is derivable from a PC's kit — see the file header.
    if (part !== "head") return true;
    // Taken off from the Armor panel on the Inventory tab. The same flag
    // drops the helmet's archery and perception penalties in
    // documents/actor.mjs, so off is off for both.
    if (actor.flags?.redsteel?.helmetOff === true) return false;
    return actor.items.some(
      (i) => i.type === "gear" && i.system.equipped && i.system.helmet,
    );
  }

  const parts = actor.flags?.redsteel?.bodyParts ?? {};
  return parts[part]?.armored !== false;
}

/**
 * Base armor for a damage packet that came in as an aimed strike.
 *
 * Returns null whenever nothing is bypassed — no aimed part, the swing missed
 * the location (SU < 0, it landed in the torso), or the location is armored —
 * so callers can leave the armor table alone in the ordinary case.
 *
 * @param {Actor} actor The target.
 * @param {{part: string, su: number}|undefined} aimedStrike From the attack card.
 * @returns {{part: string, baseArmor: number, bypassed: number}|null}
 */
export function resolveAimedArmorBypass(actor, aimedStrike) {
  const part = aimedStrike?.part;
  if (!actor || !part || !AIMED_PARTS[part]) return null;
  // SU < 0 means the attack landed, but in the torso — no location effect.
  if (!(Number(aimedStrike.su) >= 0)) return null;
  if (isLocationArmored(actor, part)) return null;

  const armor = actor.system?.armor ?? {};
  const total = Math.max(0, Number(armor.total) || 0);
  const baseArmor =
    actor.type === "character"
      ? Math.max(0, total - Math.max(0, Number(armor.worn) || 0))
      : 0;

  return { part, baseArmor, bypassed: total - baseArmor };
}
