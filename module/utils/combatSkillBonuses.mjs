async function getSneakDamageFormula(actor, weapon, weaponContext = null) {
  const offProps = weaponContext ? getOffhandProps(weaponContext) : null;
  const offhandSneakDamage = offProps?.sneakDamage ?? 0;
  const useSneak = (await actor.getFlag("tos", "useSneakAttack")) || false;
  if (!useSneak) return { sneakDamage: "", sneakEffect: 0, sneakCritRange: 0 };

  let counter = (await actor.getFlag("tos", "sneakAccessCounter")) || 0;
  counter++;
  await actor.setFlag("tos", "sneakAccessCounter", counter);

  if (counter >= 3) {
    await actor.unsetFlag("tos", "useSneakAttack");
    await actor.unsetFlag("tos", "sneakAccessCounter");
    console.log("Sneak attack fully consumed, flags cleared.");
  } else {
    console.log(`Sneak used by ${counter}/3 systems`);
  }

  let sneakEffect = 0;
  let sneakCritRange = 0;
  if (actor.type !== "npc") {
    const doctrineRogueLevel = actor.system.doctrines.rogue.value;
    if (doctrineRogueLevel >= 3) sneakEffect = 50;
    if (doctrineRogueLevel >= 4) sneakCritRange = 2;
  }
  let sneakDamage = `${actor.system.sneakDamage ?? 1}d6 + ${offhandSneakDamage}`;
  if (weapon.system.sneakDamage) {
    sneakDamage = `(${sneakDamage} + ${weapon.system.sneakDamage} )`;
  }

  return {
    sneakDamage: ` + ${sneakDamage}`,
    sneakEffect,
    sneakCritRange,
  };
}

export async function getNonWeaponAbility(actor, ability) {
  const abilityAttributeTestName = ability.system.attributeTest || 0;
  const abilityTestModifier = ability.system.testModifier || 0;

  const attributeMap = {
    strength: "str",
    dexterity: "dex",
    endurance: "end",
    intelligence: "int",
    will: "wil",
    charisma: "cha",
    perception: "per",
  };

  let concatRollAndDescription = ability.system.description;
  let attributeTestRoll = null;

  if (
    abilityAttributeTestName &&
    abilityAttributeTestName !== "-- Select a Type --"
  ) {
    const shortKey =
      attributeMap[abilityAttributeTestName.toLowerCase()] ??
      abilityAttributeTestName;

    let selectedAttributeModifier = actor.system.attributes[shortKey]?.mod ?? 0;
    if (actor.type === "npc")
      selectedAttributeModifier = actor.system.attributes[shortKey]?.value ?? 0;

    const totalModifier =
      Number(selectedAttributeModifier) + Number(abilityTestModifier);

    // Create the Roll
    const attributeRoll = new Roll(`(${totalModifier}) - 1d100`);
    await attributeRoll.evaluate({ async: true });

    const attributeRollTotal = attributeRoll.total;
    const attributeString = `
      |${abilityAttributeTestName} Test ${totalModifier}%|<br>
      Margin of Success: ${attributeRollTotal}<br>
    `;

    concatRollAndDescription += attributeString;
    attributeTestRoll = attributeRoll; // store for chat message
  }

  // --- Custom Effects ---
  const customEffectRolls = new Map();
  let effectsRollResults = "";

  const effects = ability.system.effects || {};
  const system = ability.system || {};

  for (let i = 1; i <= 3; i++) {
    const value = effects[`extra${i}`] || 0;
    if (value <= 0) continue;

    const name = getEffectName(system, effects, i);
    if (!name || name.trim() === "") continue;

    customEffectRolls.set(name, value);
  }

  for (const [name, value] of customEffectRolls.entries()) {
    const roll = new Roll("1d100");
    await roll.evaluate({ async: true });

    const success = roll.total <= value ? " SUCCESS" : "";
    effectsRollResults += `<p><b>${name}:</b> ${roll.total} < ${value}${success}</p>`;
  }

  // DAMAGE ROLL
  let damageRoll = null;
  const rollData = actor.getRollData();
  if (ability.system.roll.diceBonus) {
    damageRoll = new Roll(ability.system.roll.diceBonus, rollData);
    await damageRoll.evaluate({ async: true });
  }

  // Send the combined chat message
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    rolls: [attributeTestRoll, damageRoll].filter((r) => r),
    flavor: `
        <div style="display:flex; align-items:center; justify-content:left; gap:8px; font-size:1.3em; font-weight:bold;">
            <img src="${ability.img}" title="${ability.name}" width="36" height="36">
            <span>${ability.name}</span>
        </div>
      <table style="width: 100%; text-align: center;font-size: 15px;">
    <tr>
      <th>Description:</th>
    </tr>
    <td>${concatRollAndDescription}</td>
     <tr>
      <th>Effects:</th>
    </tr>
    <td>${effectsRollResults}</td>
    </table>
    `,
  });
}

export async function getDoctrineBonuses(actor, weapon) {
  // Doctrine bonuses
  const doctrine = actor.system.doctrines;
  let doctrineBonus = 0;
  let doctrineCritBonus = 0;
  let doctrineCritRangeBonus = 0;
  let doctrineStunBonus = 0;
  let doctrineBleedBonus = 0;
  let doctrineCritDefenseBonus = 0;
  let doctrineDefenseBonus = 0;
  let doctrineRangedDefenseBonus = 0;
  let doctrineCritDmg = 0;
  let doctrineSkillCritPen = 0;
  if (actor.type === "npc") {
    return {
      doctrineBonus: 0,
      doctrineCritBonus: 0,
      doctrineCritRangeBonus: 0,
      doctrineStunBonus: 0,
      doctrineBleedBonus: 0,
      doctrineCritDefenseBonus: 0,
      doctrineDefenseBonus: 0,
      doctrineRangedDefenseBonus: 0,
      doctrineCritDmg: 0,
      doctrineSkillCritPen: 0,
    };
  }
  for (const [doctrineName, doctrineValue] of Object.entries(
    weapon.system.doctrines,
  )) {
    if (doctrineValue === true) {
      if (doctrineName === "pikeman" && doctrine.pikeman.value >= 3) {
        doctrineBonus = 10;
        if (doctrine.pikeman.value >= 7) {
          doctrineBonus = 15;
        }
      }
      if (doctrineName === "swordsman" && doctrine.swordsman.value >= 3) {
        doctrineBonus = 10;
        if (doctrine.swordsman.value >= 5) {
          doctrineBleedBonus = 25;
        }
      }
      if (doctrineName === "reaver" && doctrine.reaver.value >= 2) {
        doctrineBonus = 10;
        if (doctrine.reaver.value >= 4) {
          doctrineCritRangeBonus = 2;
        }
        if (doctrine.reaver.value >= 7) {
          doctrineBleedBonus = 15;
          doctrineStunBonus = 10;
        }
        if (doctrine.reaver.value >= 8) {
          doctrineBonus = 15;
        }
      }
      if (doctrineName === "shieldbearer" && doctrine.shieldbearer.value >= 3) {
        doctrineCritDefenseBonus = 3;
        if (doctrine.shieldbearer.value >= 7) {
          doctrineDefenseBonus = 5;
          doctrineRangedDefenseBonus = 10;
        }
      }
      if (doctrineName === "dimakerus" && doctrine.dimakerus.value >= 2) {
        doctrineDefenseBonus = 5;
        doctrineRangedDefenseBonus = 5;
        if (doctrine.dimakerus.value >= 4) {
          doctrineBleedBonus = 10;
          doctrineStunBonus = 5;
        }
        if (doctrine.dimakerus.value >= 7) {
          doctrineDefenseBonus = 10;
        }
        if (doctrine.dimakerus.value >= 9) {
          doctrineBonus = 5;
        }
      }

      if (doctrineName === "duelist" && doctrine.duelist.value >= 4) {
        doctrineBonus = 5;
        doctrineCritBonus = 2;
        if (doctrine.dimakerus.value >= 8) {
          doctrineCritDefenseBonus = 1;
        }
      }
      if (doctrineName === "monk" && doctrine.monk.value >= 1) {
        doctrineBonus = 5;
        doctrineDefenseBonus = 5;
        if (doctrine.monk.value >= 5) {
          doctrineCritDefenseBonus = 2;
        }
        if (doctrine.monk.value >= 6) {
          doctrineBonus = 8;
          doctrineDefenseBonus = 8;
        }
      }
      if (doctrineName === "archer" && doctrine.archer.value >= 1) {
        doctrineBonus = 10;
        if (doctrine.archer.value >= 4) {
          doctrineBleedBonus = 10;
          doctrineSkillCritPen = 5;
          doctrineCritDmg = 5;
        }
        if (doctrine.archer.value >= 6) {
          doctrineCritBonus = 3;
        }
        if (doctrine.archer.value >= 7) {
          doctrineSkillCritPen = 10;
          doctrineCritDmg = 10;
        }
      }
      if (doctrineName === "arbalest" && doctrine.arbalest.value >= 1) {
        doctrineBonus = 10;
        if (doctrine.arbalest.value >= 4) {
          doctrineSkillCritPen = 5;
          doctrineCritDmg = 5;
        }
        if (doctrine.arbalest.value >= 6) {
          doctrineBleedBonus = 10;
          doctrineBonus = 15;
        }
        if (doctrine.arbalest.value >= 7) {
          doctrineSkillCritPen = 10;
          doctrineCritDmg = 10;
        }
        if (doctrine.arbalest.value >= 8) {
          doctrineCritBonus = 5;
        }
      }
      if (doctrineName === "peltast" && doctrine.peltast.value >= 1) {
        doctrineBleedBonus = 20;
        doctrineStunBonus = 10;
        if (doctrine.peltast.value >= 4) {
          doctrineSkillCritPen = 5;
          doctrineCritDmg = 5;
        }
        if (doctrine.peltast.value >= 6) {
          doctrineCritBonus = 3;
        }
        if (doctrine.peltast.value >= 7) {
          doctrineSkillCritPen = 10;
          doctrineCritDmg = 10;
        }
        if (doctrine.peltast.value >= 9) {
          // add zatizeni stitu
          doctrineCritRangeBonus = 2;
        }
      }
      if (doctrineName === "juggler" && doctrine.juggler.value >= 3) {
        doctrineBonus = 5;
        if (doctrine.juggler.value >= 2) {
          doctrineCritBonus = 3;
        }
        if (doctrine.juggler.value >= 4) {
          doctrineBleedBonus = 10;
          doctrineSkillCritPen = 5;
          doctrineCritDmg = 5;
        }
        if (doctrine.juggler.value >= 7) {
          doctrineSkillCritPen = 10;
          doctrineCritDmg = 10;
        }
      }
    }
  }
  /* console.log(
    `Doctrine Bonus: ${doctrineBonus}, ${doctrineCritBonus}, ${doctrineCritRangeBonus}, ${doctrineStunBonus}, ${doctrineBleedBonus}`,
  );*/

  return {
    doctrineBonus,
    doctrineCritBonus,
    doctrineCritRangeBonus,
    doctrineStunBonus,
    doctrineBleedBonus,
    doctrineRangedDefenseBonus,
    doctrineDefenseBonus,
    doctrineCritDefenseBonus,
    doctrineSkillCritPen,
    doctrineCritDmg,
  };
}

export async function getWeaponSkillBonuses(actor, weapon) {
  // weapon skill bonuses
  const weaponSkill = actor.system.weaponSkills;
  let weaponSkillEffect = 0;
  let weaponSkillCrit = 0;
  let weaponSkillCritDmg = 0;
  let weaponSkillCritPen = 0;

  if (actor.type === "npc") {
    return {
      weaponSkillEffect: 0,
      weaponSkillCrit: 0,
      weaponSkillCritDmg: 0,
      weaponSkillCritPen: 0,
    };
  }
  for (const [skillName, skillValue] of Object.entries(weaponSkill)) {
    // Match singular weapon class to plural skill name
    const className = weapon.system.class;
    // Does the weapon's class match this skill name (e.g. "axe" vs "axes")?
    const matches = skillName === className + "s";

    if (
      (className === skillName && weaponSkill[skillName].value >= 5) ||
      (matches && weaponSkill[skillName].value >= 5)
    ) {
      weaponSkillEffect = 10;
      weaponSkillCritDmg = 5;
      weaponSkillCritPen = 5;
      if (weaponSkill[skillName].value >= 7) {
        weaponSkillCrit = 3;
      }
      if (weaponSkill[skillName].value >= 8) {
        weaponSkillEffect = 20;
        weaponSkillCritDmg = 10;
        weaponSkillCritPen = 10;
      }
    }
  }

  return {
    weaponSkillEffect,
    weaponSkillCrit,
    weaponSkillCritDmg,
    weaponSkillCritPen,
  };
}

export async function getAttackRolls(
  actor,
  weapon,
  doctrineBonus,
  doctrineCritBonus,
  weaponSkillCrit,
  abilityAttack = 0,
  weaponContext = null,
  customCritFail = 0,
) {
  let totalWeaponAttack = doctrineBonus + weapon.system.attack;
  let criticalSuccessThreshold = 0;
  let criticalFailureThreshold = 0;
  const offProps = getOffhandProps(weaponContext);
  if (offProps?.attack) {
    totalWeaponAttack += offProps.attack;
  }
  if (offProps) {
    criticalSuccessThreshold += offProps?.critChance || 0;
    criticalFailureThreshold -= offProps?.critFail || 0;
  }

  const finesse = actor.system.combatSkills.combat.finesseRating;
  const normalCombat = actor.system.combatSkills.combat.rating;
  let attackRollFormula = 0;
  const useFlanking = actor.getFlag("tos", "useFlankingAttack");
  if (useFlanking) {
    abilityAttack += 10;
    await actor.unsetFlag("tos", "useFlankingAttack");
  }
  const aimValue = actor.getFlag("tos", "aimCount");
  if (aimValue > 0) {
    abilityAttack += aimValue * 10;
    await actor.unsetFlag("tos", "aimCount");
  }

  if (weapon.system.class === "bow" || weapon.system.class === "crossbow") {
    // Critical success and failure thresholds
    criticalSuccessThreshold =
      actor.system.combatSkills.archery.criticalSuccessThreshold +
      doctrineCritBonus +
      (weapon.system.critChance || 0);
    criticalFailureThreshold =
      actor.system.combatSkills.archery.criticalFailureThreshold -
      (weapon.system.critFail || 0) -
      customCritFail;
    // ATTACK ROLL
    attackRollFormula = `@combatSkills.archery.rating + ${totalWeaponAttack} - 1d100`;
    if (abilityAttack) {
      attackRollFormula = `@combatSkills.archery.rating + ${totalWeaponAttack} + ${abilityAttack} - 1d100`;
    }
  } else {
    criticalSuccessThreshold =
      actor.system.combatSkills.combat.criticalSuccessThreshold +
      (weapon.system.critChance + doctrineCritBonus + weaponSkillCrit || 0);
    criticalFailureThreshold =
      actor.system.combatSkills.combat.criticalFailureThreshold -
      (weapon.system.critFail || 0) -
      customCritFail;
    // ATTACK ROLL
    console.log("Aim value", aimValue);
    attackRollFormula =
      finesse > normalCombat && weapon.system.finesse
        ? `@combatSkills.combat.finesseRating + ${totalWeaponAttack} - 1d100`
        : `@combatSkills.combat.rating + ${totalWeaponAttack} - 1d100`;
    if (abilityAttack) {
      attackRollFormula =
        finesse > normalCombat && weapon.system.finesse
          ? `@combatSkills.combat.finesseRating + ${totalWeaponAttack} + ${abilityAttack} - 1d100`
          : `@combatSkills.combat.rating + ${totalWeaponAttack} + ${abilityAttack} - 1d100`;
    }
  }

  // Roll data setup

  let rollName = `${weapon.name} Attack`;
  const rollData = {
    combatSkills: actor.system.combatSkills,
    weaponAttack: weapon.system.attack || 0,
    str: actor.system.attributes.str.total,
    dex: actor.system.attributes.dex.total,
    per: actor.system.attributes.per.total,
  };

  const attackRoll = new Roll(attackRollFormula, rollData);
  await attackRoll.evaluate();
  const rollResult = attackRoll.dice[0].results[0].result;

  const critSuccess = rollResult <= criticalSuccessThreshold;
  const critFailure = rollResult >= criticalFailureThreshold;

  return {
    attackRoll,
    critSuccess,
    critFailure,
    criticalSuccessThreshold,
    criticalFailureThreshold,
    rollName,
  };
}

export async function getDamageRolls(
  actor,
  weapon,
  weaponContext = null,
  abilityDamage = 0,
  abilityBreakthrough = 0,
) {
  const rollData = {
    combatSkills: actor.system.combatSkills,
    weaponAttack: weapon.system.attack || 0,
    str: actor.system.attributes.str.total,
    dex: actor.system.attributes.dex.total,
    end: actor.system.attributes.end.total,
    int: actor.system.attributes.int.total,
    wil: actor.system.attributes.wil.total,
    cha: actor.system.attributes.cha.total,
    per: actor.system.attributes.per.total,
  };
  const offProps = getOffhandProps(weaponContext);

  const { sneakDamage } = await getSneakDamageFormula(
    actor,
    weapon,
    weaponContext ?? null,
  );
  let damageFormula = `(${weapon.system.formula}`;
  if (offProps?.diceBonus) {
    damageFormula += ` + ${offProps.diceBonus}`;
  }
  if (sneakDamage) damageFormula += `+ ${sneakDamage}`;
  if (abilityDamage) damageFormula += `+ ${abilityDamage}`;
  damageFormula += ")";
  damageFormula = damageFormula.replace(/\s*\+\s*$/, "");
  damageFormula = damageFormula.replace(/@([\w.]+)/g, (_, key) => {
    return foundry.utils.getProperty(rollData, key) ?? 0;
  });
  const damageRoll = new Roll(damageFormula, actor.system);
  await damageRoll.evaluate();
  const damageTotal = Math.floor(damageRoll.total);

  // If the weapon has breakthrough, roll it
  let breakthroughRollResult = "";
  if (weapon.system.breakthrough) {
    let breakthroughFormula = `${weapon.system.breakthrough}`;
    if (abilityBreakthrough) breakthroughFormula += ` + ${abilityBreakthrough}`;
    if (offProps?.breakthrough) {
      breakthroughFormula += ` + ${offProps.breakthrough}`;
    }
    breakthroughFormula = breakthroughFormula.replace(/\s*\+\s*$/, "");
    breakthroughFormula = breakthroughFormula.replace(
      /@([\w.]+)/g,
      (_, key) => {
        return foundry.utils.getProperty(rollData, key) ?? 0;
      },
    );
    const breakthroughRoll = new Roll(breakthroughFormula, actor.system);
    await breakthroughRoll.evaluate();
    breakthroughRollResult = `${breakthroughRoll.total}`; // Customize as needed
  }
  return {
    damageRoll,
    damageTotal,
    breakthroughRollResult,
  };
}

export async function getCriticalRolls(
  actor,
  weapon,
  weaponContext = null,
  doctrineCritRangeBonus,
  attackRoll,
  weaponSkillCritDmg,
  weaponSkillCritPen,
  damageTotal,
  penetration,
  doctrineCritDmg,
  doctrineSkillCritPen,
) {
  // CRITICAL SCORE ROLL (only in flavor text)
  const offProps = getOffhandProps(weaponContext);
  const failedAttack = attackRoll.total < 0 ? -5 : 0;
  const { sneakCritRange } = await getSneakDamageFormula(
    actor,
    weapon,
    weaponContext ?? null,
  );
  const critRange =
    weapon.system.critRange +
      actor.system.critRangeMelee +
      doctrineCritRangeBonus +
      sneakCritRange +
      (offProps?.critRange || 0) +
      failedAttack || 0;
  const critScoreRollFormula = `${critRange} + 1d20`;
  const critScoreRoll = new Roll(critScoreRollFormula);
  await critScoreRoll.evaluate();
  const critScoreResult = critScoreRoll.total;
  let critScore = 0;
  if (critScoreResult > 1) {
    if (critScoreResult <= 6) critScore = 1;
    else if (critScoreResult <= 12) critScore = 2;
    else if (critScoreResult <= 18) critScore = 3;
    else critScore = 4;
  }

  // Crit Damage Calculation:
  // Mapping crit scores to bonus damage: 0 → 0, 1 → 5, 2 → 5, 3 → 10, 4 → 20
  const perBonus = Number(actor.system.attributes.per.total) || 0;
  const critDamageMapping = [0, 5, 5, 10, 20];
  const critPenetrationMapping = [5, 5, 10, 10, 15];
  const critBonusDamage =
    critDamageMapping[critScore] + weaponSkillCritDmg || 0;
  const actorCritBonus = Number(actor.system.critDamage) || 0;
  const critBonusPenetration =
    critPenetrationMapping[critScore] +
      perBonus +
      actorCritBonus +
      penetration +
      weaponSkillCritPen +
      doctrineSkillCritPen || 0;
  let critDamageTotal =
    critBonusDamage + perBonus + actorCritBonus + damageTotal + doctrineCritDmg;

  return {
    critScore,
    critScoreResult,
    critBonusPenetration,
    critDamageTotal,
  };
}

function getEffectName(systemMap, effectMap, index) {
  const primaryNameKey = `effectType${index}`;
  const customNameKey = `effectName${index}`;

  // 1. Get the primary system name (e.g., "Bleed", "Stun", or "Custom")
  const primaryName = systemMap[primaryNameKey] || "";

  if (primaryName.toLowerCase() === "custom") {
    // If it's custom, return the user-typed name from the effects data
    return effectMap[customNameKey] || "";
  }

  // 3. Otherwise, return the primary system name
  return primaryName;
}

export async function getEffectRolls(
  actor,
  weapon,
  weaponContext = null,
  doctrineBleedBonus,
  doctrineStunBonus,
  weaponSkillEffect,
  critScore,
  critSuccess,
  ability = {},
) {
  // --- Initial Setup ---
  const { sneakEffect } = await getSneakDamageFormula(
    actor,
    weapon,
    weaponContext ?? null,
  );
  console.log("sneakEffect", sneakEffect);
  let effectsRollResults = "";
  const offProps = getOffhandProps(weaponContext);
  const weaponEffects = weapon.system.effects || {};
  const actorEffects = actor.system.effects || {};
  const weaponSystem = weapon.system || {};
  console.log("Weapon passed into getEffectRolls:", weapon);
  console.log("weapon.system:", weapon?.system);
  console.log("weapon.system.effects:", weapon?.system?.effects);
  let abilityEffects = {};
  let abilitySystem = {};
  if (ability?.system) {
    abilityEffects = ability.system.effects || {};
    abilitySystem = ability.system || {};
  }
  let critBleeds = 0;
  let totalBleeds = 0;
  let regularBleedRolls = [];
  let sharpBleedRolls = [];
  const usedAbilitySlots = { extra1: false, extra2: false, extra3: false };

  if (critScore > 1) {
    critBleeds += 1;

    if (weapon.system.sharp && weaponEffects.bleed) {
      critBleeds += 1;
    }
  }
  if (critScore > 1 && critSuccess) {
    totalBleeds += 1;
  } // --- 1. Process Fixed Effects (STUN and BLEED) ---

  const fixedEffectNames = ["stun", "bleed"];

  for (const effectName of fixedEffectNames) {
    const baseValue = weaponEffects[effectName] || 0;
    const modifier = actorEffects[effectName] || 0;
    const abilityBonus = abilityEffects[effectName] || 0;
    const offValue = offProps?.effects?.[effectName] || 0;
    let shouldProcess = baseValue > 0 || offValue > 0;

    if (shouldProcess) {
      let modifiedEffectValue = offValue + baseValue + modifier + abilityBonus;

      if (effectName === "stun") {
        modifiedEffectValue =
          modifiedEffectValue +
          doctrineStunBonus +
          (offProps?.effects?.stun || 0) +
          sneakEffect +
          weaponSkillEffect +
          (critScore > 1 && critSuccess ? 100 : 0);
        const d100Roll = new Roll("1d100");
        await d100Roll.evaluate();
        const roundedModifiedValue = Math.floor(modifiedEffectValue);
        const successText =
          d100Roll.total <= roundedModifiedValue
            ? `<i class="fa-sharp-duotone fa-solid fa-star-christmas" style="--fa-primary-color: #c4c700; --fa-secondary-color: #5c5400;"></i> SUCCESS`
            : ``;
        effectsRollResults += `<p><b>| Stun: </b>${d100Roll.total} | < ${roundedModifiedValue}% ${successText}</p>`;
      } else if (effectName === "bleed") {
        modifiedEffectValue =
          modifiedEffectValue +
          doctrineBleedBonus +
          (offProps?.effects?.bleed || 0) +
          sneakEffect +
          weaponSkillEffect;

        const bleedBase = Math.floor(modifiedEffectValue / 100);
        const bleedChance = modifiedEffectValue % 100;
        const bleedRoll = new Roll("1d100");
        await bleedRoll.evaluate();
        const bleedRollResult = bleedRoll.total;

        let regularStacks = bleedBase;
        if (bleedRollResult <= bleedChance) regularStacks++;
        totalBleeds += regularStacks;
        regularBleedRolls.push(bleedRollResult);
      }
    }
  }

  // --- 2. & 3. Combined Custom Effect Logic (Single Loop) ---

  const customEffectRolls = new Map(); // Map to store final merged results: Map<Effect Name, Final Value>

  // 2a. Initialize Map with ALL Weapon Effects
  for (let i = 1; i <= 3; i++) {
    const wKey = `extra${i}`;
    const wValue = weaponEffects[wKey] || 0;

    // Use the helper to get the final name (e.g., "COLORBLIND")
    const wName = getEffectName(weaponSystem, weaponEffects, i);

    if (wValue > 0 && wName.trim() !== "") {
      customEffectRolls.set(wName, wValue);
    }
  }
  // 2b  Add Off-hand Effects
  if (offProps?.effects) {
    for (let i = 1; i <= 3; i++) {
      const oKey = `extra${i}`;
      const oValue = offProps.effects[oKey] || 0;

      const offSystem = weaponContext.offWeapon.system.offhandProperties;

      const effectType = offSystem[`effectType${i}`];
      let oName = "";

      if (effectType === "custom") {
        oName = offSystem.effects[`effectName${i}`] || "";
      } else {
        oName = effectType || "";
      }

      if (oValue > 0 && oName.trim() !== "") {
        if (customEffectRolls.has(oName)) {
          const mergedValue = customEffectRolls.get(oName) + oValue;
          customEffectRolls.set(oName, mergedValue);
        } else {
          customEffectRolls.set(oName, oValue);
        }
      }
    }
  }

  // 2c. Merge/Add ALL Ability Effects
  if (ability?.system) {
    for (let j = 1; j <= 3; j++) {
      const aKey = `extra${j}`;
      const aValue = abilityEffects[aKey] || 0;

      // Use the helper to get the final name (e.g., "COLORBLIND")
      const aName = getEffectName(abilitySystem, abilityEffects, j);

      if (aValue > 0 && aName.trim() !== "") {
        if (customEffectRolls.has(aName)) {
          // Match found: Add the ability value to the existing weapon value
          const mergedValue = customEffectRolls.get(aName) + aValue;
          customEffectRolls.set(aName, mergedValue);
        } else {
          // Unique ability effect: Use the final name, but add a label for clarity
          customEffectRolls.set(`${aName}`, aValue);
        }
      }
    }
  }

  // 3. Process and Display ALL Merged Effects from the Map
  for (const [name, value] of customEffectRolls.entries()) {
    const modifiedEffectValue = value;

    const d100Roll = new Roll("1d100");
    await d100Roll.evaluate();
    const roundedModifiedValue = Math.floor(modifiedEffectValue);

    const successText = d100Roll.total <= roundedModifiedValue ? "SUCCESS" : "";

    // The 'name' variable here will be the user-typed custom name if applicable
    effectsRollResults += `<p><b>${name}:</b> ${d100Roll.total} < ${roundedModifiedValue}% ${successText}</p>`;
  }

  // --- 4. Sharp Bleed Logic ---

  if (weapon.system.sharp && weaponEffects.bleed) {
    if (critScore > 1 && critSuccess) {
      totalBleeds += 1;
    }
    const abilityBleed = abilityEffects["bleed"] || 0;
    const modifier = actorEffects["bleed"] || 0;
    const modifiedBleedValue =
      weaponEffects.bleed +
      modifier +
      (abilityBleed || 0) +
      weaponSkillEffect +
      doctrineBleedBonus +
      (offProps?.effects?.bleed || 0) +
      sneakEffect;
    const bleedChance = modifiedBleedValue % 100;
    const sharpBleedRoll = new Roll("1d100");
    await sharpBleedRoll.evaluate();
    let sharpStacks = Math.floor(modifiedBleedValue / 100);
    if (sharpBleedRoll.total <= bleedChance) sharpStacks++;
    totalBleeds += sharpStacks;
    sharpBleedRolls.push(sharpBleedRoll.total);
  }

  // --- 5. Combine All Bleed Rolls and Final Return ---

  const abilityBleed = abilityEffects["bleed"] || 0;
  let bleedChanceDisplay;
  if (weaponEffects.bleed > 0) {
    bleedChanceDisplay =
      (weaponEffects.bleed || 0) +
      (actor.system.effects.bleed || 0) +
      (abilityBleed || 0) +
      (weaponSkillEffect || 0) +
      (sneakEffect || 0) +
      (offProps?.effects?.bleed || 0) +
      (doctrineBleedBonus || 0);
  }
  let allBleedRollResults = "";
  if (totalBleeds > 0 || bleedChanceDisplay > 0) {
    allBleedRollResults = `| Bleed: ${[
      ...regularBleedRolls,
      ...sharpBleedRolls,
    ].join("  Sharp: ")} | < ${bleedChanceDisplay}% 
    <span title="Total Bleed Applied: ${totalBleeds}
Crit Bonus:(+${critBleeds}) due to Crit score: ${critScore} 
">
  ${totalBleeds}
  <i class="fa-regular fa-droplet fa-lg" style="color: #bd0000;"></i>
   (+${critBleeds})
</span>`;
  }

  return {
    allBleedRollResults,
    bleedChanceDisplay,
    effectsRollResults,
  };
}

export function evaluateDmgVsArmor({
  damage,
  penetration,
  armor,
  hp,
  tempHp,
  halfDamage = false,
}) {
  let finalDamage;
  if (damage <= penetration) {
    finalDamage = damage;
  } else {
    const effective = Math.max(damage - armor, 0);
    finalDamage = effective < penetration ? penetration : effective;
  }
  if (halfDamage) {
    finalDamage = Math.floor(finalDamage / 2);
  }

  const tempHpLoss = Math.floor(Math.min(tempHp, finalDamage));
  const remainingDamage = finalDamage - tempHpLoss;
  const hpLoss = Math.floor(Math.min(hp, remainingDamage));
  const totalHpLoss = hpLoss + tempHpLoss;

  return {
    finalDamage,
    hpLoss,
    tempHpLoss,
    totalHpLoss,
    newHp: Math.max(hp - hpLoss, 0),
    newTempHp: tempHp - tempHpLoss,
  };
}

function getOffhandProps(weaponContext) {
  if (!weaponContext?.isDualWield || !weaponContext.offWeapon) {
    return null;
  }
  return weaponContext.offWeapon.system.offhandProperties ?? null;
}
