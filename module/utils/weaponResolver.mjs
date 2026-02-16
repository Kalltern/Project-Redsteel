export function resolveWeaponContext(
  actor,
  ability = null,
  selectedWeapon = null,
) {
  if (actor.type === "character") {
    // Active set mode
    const activeSet = actor.system.combat?.activeWeaponSet;
    if (!activeSet) return null;

    const weaponSets = buildWeaponSetView(actor);
    const ws = weaponSets[activeSet];
    if (!ws?.main) return null;

    const weapon = ws.main;
    // Manual selection override (dialog mode)

    if (selectedWeapon) {
      return {
        weapon: selectedWeapon,
        offWeapon: ws.off || null,
        isDualWield: ws.off && !ws.mainIsTwoHanded && !ws.offIsShield,
        hasShield: ws.offIsShield || false,
      };
    }
    //  Ability filtering (optional)
    if (ability && ability.system?.type === "melee") {
      if (
        !["axe", "sword", "blunt", "polearm"].includes(weapon.system.class) ||
        weapon.system.thrown
      )
        return null;
    }

    if (ability && ability.system?.type === "ranged") {
      if (
        !["bow", "crossbow"].includes(weapon.system.class) &&
        weapon.system.thrown !== true
      )
        return null;
    }

    return {
      weapon,
      offWeapon: ws.off || null,
      isDualWield: ws.isDualWield || false,
      hasShield: ws.offIsShield || false,
    };
  }

  //  NPC branch stays separate
  if (actor.type === "npc") {
    if (!selectedWeapon) return null;

    const offWeapon = actor.items.find(
      (i) =>
        i.type === "weapon" &&
        i.system.npcOffhand === true &&
        i.id !== selectedWeapon.id,
    );

    return {
      weapon: selectedWeapon,
      offWeapon: offWeapon || null,
      isDualWield: !!offWeapon,
      hasShield: false,
    };
  }

  return null;
}

export function buildWeaponSetView(actor) {
  if (!actor || actor.type !== "character") return null;
  const sets = actor.system.combat.weaponSets;
  const result = {};

  for (const setId of [1, 2]) {
    const slots = sets?.[setId] ?? {};
    const main = slots.main ? actor.items.get(slots.main) : null;
    const off = slots.off ? actor.items.get(slots.off) : null;

    const mainIsTwoHanded = main
      ? main.system.type === "heavy" ||
        ["crossbow", "box"].includes(main.system.class) ||
        main.system.gripMode === "two"
      : false;

    const offIsShield = !!off?.system?.shield;
    const isDualWield = !!main && !!off && !mainIsTwoHanded && !offIsShield;

    result[setId] = {
      main,
      off,
      mainIsTwoHanded,
      offIsShield,
      isDualWield,
    };
  }

  return result;
}
