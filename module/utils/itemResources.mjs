/**
 * Resource spending, in one place.
 *
 * Every pool on the sheet is stored as `system.stats.<key>.value`, but they do
 * not all move the same way. Health, Mana, Stamina and the rest count *down*
 * from a full pool: spending subtracts, and you are blocked at 0. Fatigue
 * counts *up* from rested (0) toward `max`, and the degree drives every penalty
 * in `_prepareGlobalMod` — so paying a fatigue cost has to ADD, and is blocked
 * when the character is already at the ceiling.
 *
 * Before this module the ability cost path subtracted from every pool alike,
 * which meant a fatigue cost made the character *less* tired and refused
 * outright at full rest. It also offered three cost options ("mental",
 * "inspiration", "holy energy") that resolve to stats which do not exist, so an
 * ability set to any of them could never be used at all.
 *
 * Callers get update payloads rather than writes wherever practical, following
 * `mindPoints.mjs`: an activation that pays a cost and does something else in
 * the same breath can merge both into one `actor.update` and stay atomic.
 */

/**
 * How each pool behaves. `direction: "up"` means the stored value rises as the
 * resource is consumed (fatigue is the only one today, but naming the property
 * beats hard-coding a fatigue check at every site).
 */
const RESOURCE_POOLS = {
  health: { direction: "down" },
  stamina: { direction: "down" },
  mana: { direction: "down" },
  mind: { direction: "down" },
  bloodPool: { direction: "down" },
  holyEnergy: { direction: "down" },
  toxicity: { direction: "down" },
  corruption: { direction: "down" },
  temporaryHealth: { direction: "down" },
  temporaryHealthMagic: { direction: "down" },

  // The odd one out. See the module comment.
  fatigue: { direction: "up" },
};

/**
 * Spellings that reach us from stored data, mapped onto a pool key. The
 * ability sheet's `costType` and the spell/ability `resources[].type` are free
 * strings authored years apart, so "Mind", "mental" and "mind" all have to land
 * on the same pool.
 */
const RESOURCE_ALIASES = {
  mental: "mind",
  "holy energy": "holyEnergy",
  holyenergy: "holyEnergy",
  blood: "bloodPool",
  bloodpool: "bloodPool",
  temporaryhealth: "temporaryHealth",
  temporaryhealthmagic: "temporaryHealthMagic",
};

/** Pool keys indexed by their lowercase spelling, built once. */
const POOL_BY_LOWER = Object.fromEntries(
  Object.keys(RESOURCE_POOLS).map((key) => [key.toLowerCase(), key]),
);

/**
 * The pool key for a raw authored resource name, or "" when it names nothing.
 * Case and spacing are ignored; unknown names return "" rather than throwing so
 * a typo on one ability cannot break a whole activation.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeResourceKey(raw) {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!key) return "";
  return RESOURCE_ALIASES[key] ?? POOL_BY_LOWER[key] ?? "";
}

/**
 * Which way a pool moves when it is spent.
 * @param {string} raw   Pool key or authored alias.
 * @returns {"up"|"down"}  Defaults to "down" for unknown pools.
 */
export function resourceDirection(raw) {
  const key = normalizeResourceKey(raw);
  return RESOURCE_POOLS[key]?.direction ?? "down";
}

/**
 * The pool's current value and its ceiling, coerced. Sheet inputs are plain
 * text with no DataModel behind them, so a hand-typed value arrives as a
 * string more often than not.
 * @param {Actor} actor
 * @param {string} key   Already normalized.
 */
function readPool(actor, key) {
  const stat = actor?.system?.stats?.[key];
  return {
    exists: !!stat,
    value: Number(stat?.value) || 0,
    max: Number(stat?.max) || 0,
  };
}

/**
 * How much of a resource the actor can still pay, without writing anything.
 * For a down-pool that is what is left in it; for an up-pool it is the headroom
 * below the ceiling.
 * @param {Actor} actor
 * @param {string} raw     Pool key or authored alias.
 * @returns {number}
 */
export function availableResource(actor, raw) {
  const key = normalizeResourceKey(raw);
  if (!key) return 0;
  const { exists, value, max } = readPool(actor, key);
  if (!exists) return 0;
  return resourceDirection(key) === "up"
    ? Math.max(0, max - value)
    : Math.max(0, value);
}

/**
 * The update payload for paying `amount` of one resource, without applying it.
 *
 * `ok` is false when the actor cannot afford the cost, and `updates` is then
 * empty: partial payment is never made, because a half-paid cost leaves the
 * character worse off than not acting at all.
 *
 * @param {Actor} actor
 * @param {string} raw       Pool key or authored alias ("mind", "holy energy").
 * @param {number} amount    How much to spend. Zero or less is a free success.
 * @returns {{ok: boolean, key: string, updates: object, available: number}}
 */
export function resourceSpendUpdates(actor, raw, amount = 1) {
  const key = normalizeResourceKey(raw);
  const want = Math.max(0, Math.floor(Number(amount) || 0));
  if (want <= 0) return { ok: true, key, updates: {}, available: 0 };
  if (!key) return { ok: false, key: "", updates: {}, available: 0 };

  const { exists, value, max } = readPool(actor, key);
  const available = availableResource(actor, key);
  if (!exists || available < want) {
    return { ok: false, key, updates: {}, available };
  }

  const next =
    resourceDirection(key) === "up"
      ? Math.min(max, value + want)
      : Math.max(0, value - want);

  return {
    ok: true,
    key,
    updates: { [`system.stats.${key}.value`]: next },
    available,
  };
}

/**
 * The update payload for giving a resource back, the inverse of
 * {@link resourceSpendUpdates}. Restoring an up-pool lowers it (resting off
 * fatigue), restoring a down-pool raises it, and both clamp to the pool's own
 * bounds so a refund can never overfill.
 *
 * @param {Actor} actor
 * @param {string} raw
 * @param {number} amount
 * @returns {{key: string, updates: object}}
 */
export function resourceRestoreUpdates(actor, raw, amount = 1) {
  const key = normalizeResourceKey(raw);
  const want = Math.max(0, Math.floor(Number(amount) || 0));
  if (!key || want <= 0) return { key, updates: {} };

  const { exists, value, max } = readPool(actor, key);
  if (!exists) return { key, updates: {} };

  const next =
    resourceDirection(key) === "up"
      ? Math.max(0, value - want)
      : Math.min(max, value + want);

  if (next === value) return { key, updates: {} };
  return { key, updates: { [`system.stats.${key}.value`]: next } };
}

/**
 * Can the actor pay this cost right now?
 * @param {Actor} actor
 * @param {string} raw
 * @param {number} amount
 * @returns {boolean}
 */
export function canSpendResource(actor, raw, amount = 1) {
  return resourceSpendUpdates(actor, raw, amount).ok;
}

/**
 * Pay a resource cost. Returns false and warns when the actor cannot afford it,
 * having changed nothing.
 * @param {Actor} actor
 * @param {string} raw
 * @param {number} amount
 * @returns {Promise<boolean>}
 */
export async function spendResource(actor, raw, amount = 1) {
  const { ok, updates } = resourceSpendUpdates(actor, raw, amount);
  if (!ok) {
    ui.notifications?.warn(
      game.i18n.format("REDSTEEL.Resource.NotEnough", {
        resource: resourceLabel(raw),
      }),
    );
    return false;
  }
  if (Object.keys(updates).length) await actor.update(updates);
  return true;
}

/**
 * The player-facing name of a pool, for notifications and chat cards. Falls
 * back to the authored string so an unrecognised resource still reads sensibly
 * instead of showing a blank.
 * @param {string} raw
 * @returns {string}
 */
export function resourceLabel(raw) {
  const key = normalizeResourceKey(raw);
  if (!key) return String(raw ?? "");
  const path = `REDSTEEL.Actor.Character.stats.${key}.value.label`;
  if (game.i18n?.has?.(path)) return game.i18n.localize(path);
  return key.replace(/([A-Z])/g, " $1");
}
