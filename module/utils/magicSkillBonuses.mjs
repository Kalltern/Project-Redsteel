// --- Helper for Dialogs (CSS Injection) ---
function _injectDialogCSS() {
  const css = `
            .spell-dialog-form {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .casting-options {
            border: 1px solid #7a7971;
            border-radius: 4px;
            padding: 6px;
            background: #f8f8f8;
          }

          .casting-options .option-row {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 14px;
          }
        /* General Dialog styling */
        .spell-dialog .window-content {
            max-width: 400px; /* Increased max width for tabs */
            width: 100%;
        }
        .spell-dialog .window{
            width: auto;
        }
    `;

  // Prevent re-injection if already present
  if (!document.getElementById("macro-spell-css")) {
    const styleSheet = document.createElement("style");
    styleSheet.id = "macro-spell-css";
    styleSheet.type = "text/css";
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);
  }
}

// --- 1. Spell/School Selection Dialog Flow ---

/**
 * Gathers all unique spell schools from the actor's owned spells.
 * @param {object} actor - The Foundry actor object.
 * @returns {Set<string>} - A Set of unique spell school names (e.g., {'earth', 'fire'}).
 */
export function getUniqueSpellSchools(actor) {
  const spellSchools = new Set();
  // Assuming spell school is stored in spell.system.type
  actor.items
    .filter((i) => i.type === "spell")
    .forEach((spell) => {
      if (spell.system.type) {
        spellSchools.add(spell.system.type);
      }
    });
  return spellSchools;
}

/**
 * Handles the complete dialog flow: School Selection -> Spell Selection (with Ranks/Tabs).
 * @param {object} actor - The Foundry actor object.
 * @returns {Promise<object | null>} - A promise that resolves with the selected spell item, or null if canceled.
 */
export function showSpellSelectionDialogs(actor) {
  _injectDialogCSS();
  const schools = Array.from(getUniqueSpellSchools(actor));

  if (schools.length === 0) {
    ui.notifications.warn("This actor has no spells with defined schools.");
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    // --- Inner function to show the second (spell) dialog with Ranks as Tabs ---

    const showSpellDialog = (schoolName, schoolDialog) => {
      if (schoolDialog) schoolDialog.close();

      const allSpells = actor.items.filter(
        (i) => i.type === "spell" && i.system.type === schoolName,
      );

      // Define Ranks (now lowercase) and Group Spells
      const RANK_ORDER = [
        "wild",
        "apprentice",
        "expert",
        "master",
        "grandmaster",
      ];
      const spellsByRank = {};

      // Initialize groups (to ensure order) and populate
      RANK_ORDER.forEach((rank) => (spellsByRank[rank] = []));
      allSpells.forEach((spell) => {
        // Ensure rank is lowercase and default to 'wild'
        const rank = (spell.system.rank || "wild").toLowerCase();
        if (RANK_ORDER.includes(rank)) {
          spellsByRank[rank].push(spell);
        } else {
          // Put unlisted ranks in 'wild' as a fallback
          spellsByRank["wild"].push(spell);
        }
      });

      // --- Generate Tab HTML ---
      let tabHeadersHtml = "";
      let tabContentHtml = "";

      RANK_ORDER.forEach((rank) => {
        const spells = spellsByRank[rank];
        if (spells && spells.length > 0) {
          const tabId = rank;

          // Tab Header (Capitalize the rank name for display)
          tabHeadersHtml += `<div class="tab-item" data-tab="${tabId}">
                        ${rank.charAt(0).toUpperCase() + rank.slice(1)} (${
                          spells.length
                        })
                    </div>`;

          // Tab Content (List of spells)
          const spellListHtml = spells
            .map(
              (spell) => `
<li class="spell-choice ability-choice"
    data-spell-id="${spell.id}">
  <img src="${spell.img}"
       class="ability-icon">
  <span class="ability-name">
    ${spell.name}
  </span>
</li>
    `,
            )
            .join("");

          tabContentHtml += `
                        <div class="tab-pane" data-tab="${tabId}">
                            <ul style="list-style: none; padding: 0;">
                                ${spellListHtml}
                            </ul>
                        </div>
                    `;
        }
      });

      if (!tabHeadersHtml) {
        ui.notifications.warn(
          `No spells found in the selected school: ${schoolName}`,
        );
        return;
      }

      const dialogContent = `
  <form class="spell-dialog-form">

    <!-- CASTING OPTIONS (ABOVE TABS) -->
    <div class="casting-options">
      <div class="option-row">
        <label>
           Focus:
   <input type="number"
          name="focus"
          value="0"
          min="0"
          step="1"
          style="width: 60px;">
        </label>
       <label>
          <input type="checkbox" name="freeCast">
          Free Cast
        </label>
      </div>
    </div>

    <!-- SPELL TABS -->
    <div class="spell-tabs">
      <div class="tab-headers">${tabHeadersHtml}</div>
      <div class="tab-content">${tabContentHtml}</div>
    </div>

  </form>
            `;

      const spellDialog = new Dialog({
        title: `Select ${schoolName} Spell`,
        content: dialogContent,
        buttons: {},
        render: (html) => {
          // 1. Activate initial tab
          const firstTab = html.find(".tab-item").first();
          firstTab.addClass("active");
          html
            .find(`.tab-pane[data-tab="${firstTab.data("tab")}"]`)
            .addClass("active");

          // 2. Handle tab switching
          html.find(".tab-item").click(function () {
            const tab = $(this).data("tab");
            html.find(".tab-item").removeClass("active");
            $(this).addClass("active");
            html.find(".tab-pane").removeClass("active");
            html.find(`.tab-pane[data-tab="${tab}"]`).addClass("active");
          });

          // 3. Handle spell selection
          html.find(".spell-choice").click(async (event) => {
            const selectedId = $(event.currentTarget).data("spell-id");
            // Find the spell item object using its ID
            const selectedSpell = allSpells.find((s) => s.id === selectedId);
            // Check if the cast is for free
            const freeCast = html.find('input[name="freeCast"]').is(":checked");
            const focusSpent = Number(
              html.find('input[name="focus"]').val() || 0,
            );

            spellDialog.close();
            resolve({
              spell: selectedSpell,
              freeCast,
              focusSpent,
            });
          });
        },
        close: () => {
          // If the user closes the dialog, resolve with null
          if (!spellDialog.rendered) resolve(null);
        },
      });
      spellDialog.render(true);
    };

    if (schools.length === 1) {
      showSpellDialog(schools[0], null);
      return;
    }

    // --- First Dialog (School Selection - Unchanged) ---
    const schoolDialog = new Dialog({
      title: "Select Spell School",
      content: `<form><fieldset><ul id="school-list" style="list-style: none; padding: 0;">
                ${schools
                  .map(
                    (school) =>
                      `<li class="spell-choice ability-choice"
    data-value="${school}">
  <span class="ability-name">
    ${school.charAt(0).toUpperCase() + school.slice(1)}
  </span>
</li>`,
                  )
                  .join("")}
            </ul></fieldset></form>`,
      buttons: {},
      render: (html) => {
        html.find("#school-list li").click(async (event) => {
          const schoolName = $(event.currentTarget).data("value");
          // Move to the second dialog, passing the first dialog instance to close it
          showSpellDialog(schoolName, schoolDialog);
        });
      },
      close: () => {
        // If the user closes the dialog, resolve with null
        if (!schoolDialog.rendered) resolve(null);
      },
    });
    schoolDialog.render(true);
  });
}

// --- 2. Mana Deduction ---

/**
 * Checks mana cost, deducts it from the actor, and updates the actor sheet.
 * @param {object} actor - The Foundry actor object.
 * @param {object} spell - The selected spell item object.
 * @returns {Promise<boolean>} - True if mana was deducted successfully, false otherwise.
 */
export async function deductMana(actor, spell) {
  const updates = {};

  const spellCost = Number(spell.system.cost) || 0;

  if (spellCost) {
    const currentMana = actor.system.stats.mana?.value ?? 0;

    if (currentMana < spellCost) {
      ui.notifications.warn(
        `Not enough mana to cast ${spell.name} (Cost: ${spellCost}).`,
      );
      return false;
    }

    updates["system.stats.mana.value"] = Math.max(currentMana - spellCost, 0);
  }

  const resources = Array.isArray(spell.system.resources)
    ? spell.system.resources
    : Object.values(spell.system.resources ?? {});

  for (const res of resources) {
    const { type, mode, amount } = res ?? {};
    const amt = Number(amount);

    if (!type || !mode || !amt) continue;

    const statKey = type.toLowerCase();
    const baseValue =
      updates[`system.stats.${statKey}.value`] ??
      actor.system.stats[statKey]?.value ??
      0;

    let newValue = baseValue;

    if (mode === "drain") {
      newValue = Math.max(baseValue - amt, 0);
    }

    if (mode === "add") {
      newValue = baseValue + amt;
    }

    updates[`system.stats.${statKey}.value`] = newValue;
  }

  /* -------- APPLY -------- */

  if (Object.keys(updates).length) {
    await actor.update(updates);
  }

  return true;
}

// --- 3. Bonus Calculation (Scalable) ---

/**
 * Calculates and aggregates all relevant bonuses for the attack, damage, and effects.
 * This is the central function for making bonuses scalable.
 * NOTE: This function now accepts the spell object to allow for school-based bonuses.
 * @param {object} actor - The Foundry actor object.
 * @param {object} spell - The selected spell item object. (NEW)
 * @returns {object} - An object containing aggregated bonus values.
 */
export function calculateAttackBonuses(actor, spell) {
  let attackBonus = 0;
  let damageBonus = 0;
  let effectModifiers = {};

  // --- Temperament Bonus (Conditional) ---
  const temperamentBonusMap = {
    Melancholic: "earth",
    Choleric: "fire",
    Sanguine: "air",
    Phlegmatic: "water",
    // Add more temperaments and their associated spell schools here
  };

  const spellSchool = spell.system.type; // Get the school of the spell being cast

  // Check if the actor has a matching temperament for the spell's school
  for (const [temperamentName, requiredSchool] of Object.entries(
    temperamentBonusMap,
  )) {
    // Find the item by name AND check if the spell's school matches the required school
    if (
      actor.items.find((i) => i.name === temperamentName) &&
      spellSchool === requiredSchool
    ) {
      // Apply +5 bonus to the attack roll formula
      attackBonus += 5;
      break; // Assuming only one temperament bonus applies
    }
  }

  // --- Future Addon Example: "Focus" Trait ---
  // if (actor.items.find(i => i.name === "Focus")) {
  //     // Add +10 to all damage rolls (flat number)
  //     damageBonus += 10;
  //     // Add +10 to the 'stun' effect check
  //     effectModifiers['stun'] = (effectModifiers['stun'] || 0) + 10;
  // }

  // --- Future Addon Example: "Bonus Damage" Field ---
  // damageBonus += actor.system.bonusDamage || 0;

  // Combine actor's base effects modifiers (which are always applied)
  const actorEffects = actor.system.effects || {};
  for (const [key, value] of Object.entries(actorEffects)) {
    if (typeof value === "number" && value !== 0) {
      effectModifiers[key] = (effectModifiers[key] || 0) + value;
    }
  }

  return {
    attackBonus,
    damageBonus,
    effectModifiers,
  };
}

// --- 4. Attack Roll ---

/**
 * Performs the magic attack roll.
 * @param {object} actor - The Foundry actor object.
 * @param {object} spell - The selected spell item object.
 * @param {number} bonus - The calculated total bonus for the attack roll formula.
 * @returns {Promise<{attackRoll: object, critSuccess: boolean, critFailure: boolean}>}
 */

function getEffectiveDifficulty(spell, focusSpent) {
  const base = spell.system.difficulty || 0;
  const focusBonus = focusSpent * 10;
  console.log(`base Difficulty`, base);
  console.log(`focus Bonus`, focusBonus);
  return base > 0 ? base : Math.min(0, base + focusBonus);
}

export async function performAttackRoll(actor, spell, bonus, focusSpent) {
  const effectiveDifficulty = getEffectiveDifficulty(spell, focusSpent);

  const critSuccessThreshold =
    actor.system.combatSkills.channeling.criticalSuccessThreshold;
  const critFailureThreshold =
    actor.system.combatSkills.channeling.criticalFailureThreshold;

  const attackRollFormula = `@combatSkills.channeling.rating + @difficulty + ${bonus} - 1d100`;

  const rollData = {
    combatSkills: actor.system.combatSkills,
    difficulty: effectiveDifficulty,
  };

  const attackRoll = new Roll(attackRollFormula, rollData);
  await attackRoll.evaluate();
  const rollResult = attackRoll.dice[0].results[0].result;

  const critSuccess = rollResult <= critSuccessThreshold;
  const critFailure = rollResult >= critFailureThreshold;

  return {
    attackRoll,
    critSuccess,
    critFailure,
  };
}

// --- 5. Final Roll and Chat Posting (Centralized) ---

/**
 * Performs Damage, Crit Score, and Effect rolls, and posts the final chat message.
 * @param {object} actor - The Foundry actor object.
 * @param {object} spell - The selected spell item object.
 * @param {object} bonuses - The results from calculateAttackBonuses.
 * @param {object} attackResults - The results from performAttackRoll.
 */
export async function finalizeRollsAndPostChat(
  actor,
  spell,
  bonuses,
  attackResults,
) {
  const { attackRoll, critSuccess, critFailure } = attackResults;
  const { damageBonus, effectModifiers } = bonuses;

  // --- Roll Data Setup (needed for Damage/Description) ---
  const rollData = {
    combatSkills: actor.system.combatSkills,
    difficulty: spell.system.difficulty,
    int: actor.system.attributes.int.total,
    wil: actor.system.attributes.wil.total,
    spellPower: actor.system.schools[spell.system.type]?.spellPower || 0,
  };

  const spellAttributeTestName = spell.system.attributeTest || 0;
  const spellTestModifier = spell.system.testModifier || 0;

  const attributeMap = {
    strength: "str",
    dexterity: "dex",
    endurance: "end",
    intelligence: "int",
    will: "wil",
    charisma: "cha",
    perception: "per",
  };
  let concatRollAndDescription = spell.system.description;
  console.log(`Spell Description:`, concatRollAndDescription);
  let attributeTestRoll = null;
  if (
    spellAttributeTestName &&
    spellAttributeTestName !== "-- Select a Type --"
  ) {
    const shortKey =
      attributeMap[spellAttributeTestName.toLowerCase()] ??
      spellAttributeTestName;

    let selectedAttributeModifier = actor.system.attributes[shortKey]?.mod ?? 0;
    if (actor.type === "npc") {
      selectedAttributeModifier = actor.system.attributes[shortKey]?.value ?? 0;
    }

    const attributeRoll = new Roll(
      `(${selectedAttributeModifier} + ${spellTestModifier}) - 1d100`,
      rollData,
    );
    await attributeRoll.evaluate({ async: true });

    // Roll modifier separately for display
    const modifierRoll = new Roll(
      `${selectedAttributeModifier} + ${spellTestModifier || 0}`,
      rollData,
    );
    await modifierRoll.evaluate({ async: true });

    const attributeString = `
  <span
    title="Test chance ${modifierRoll.total}%&#10;Rolled: ${attributeRoll.result}"
    style="display:inline-block;"
  >
    ${spellAttributeTestName} Test Margin of Success: [${attributeRoll.total}]
  </span>

  <br><br>
`;

    concatRollAndDescription += attributeString;
    attributeTestRoll = attributeRoll;
  }
  // --- DAMAGE ROLL ---
  let damageFormula = spell.system.formula || "1d6";
  damageFormula = damageFormula.replace(
    /@(\w+\.\w+\.\w+|\w+)/g,
    (_, key) => rollData[key] || 0,
  );

  const damageRoll = new Roll(damageFormula, actor.system);
  await damageRoll.evaluate();
  // Add the flat damage bonus from Function 3
  const damageTotal = damageRoll.total + damageBonus;

  // --- EFFECT ROLLS ---
  const spellEffects = spell.system.effects || {};
  const mechanicalEffects = {};
  let effectsRollResults = "";

  const spellSchool = spell.system.type;
  const actorEffects = actor.system.effects?.[spellSchool] || {};

  for (const [key, effectValue] of Object.entries(spellEffects)) {
    if (effectValue > 0) {
      let finalEffectName = "";

      // 1. Handle Built-in Effects (stun, bleed)
      if (key === "stun" || key === "bleed") {
        finalEffectName = key.charAt(0).toUpperCase() + key.slice(1);
      }

      // 2. Handle Customizable Slots (extra1, extra2, extra3)
      else if (key.startsWith("extra")) {
        const index = key.replace("extra", ""); // gets "1", "2", or "3"

        // Look for type in system.effectType#
        const typeValue = spell.system[`effectType${index}`] || "";

        if (typeValue.toLowerCase() === "custom") {
          // Look for custom name in system.effects.effectName#
          finalEffectName =
            spell.system.effects[`effectName${index}`] || `Custom ${index}`;
        } else {
          finalEffectName = typeValue;
        }
      }

      // Skip if we couldn't resolve a name or if it's an internal field (like effectName1)
      if (!finalEffectName || key.startsWith("effectName")) continue;

      // Add actor-specific bonus
      const normalizedActorEffects = Object.fromEntries(
        Object.entries(actorEffects).map(([k, v]) => [k.toLowerCase(), v]),
      );
      const actorBonus =
        normalizedActorEffects[finalEffectName.toLowerCase()] || 0;

      const totalEffectValue = effectValue + actorBonus;

      // Roll 1d100
      const d100Roll = new Roll("1d100");
      await d100Roll.evaluate();

      const rollValue = d100Roll.total;
      const successText = rollValue <= totalEffectValue ? " SUCCESS" : "";

      effectsRollResults += `
  <p><b>${finalEffectName}:</b>
  ${rollValue} < ${totalEffectValue}% ${successText}</p>
`;

      mechanicalEffects[finalEffectName.toLowerCase()] = {
        chance: totalEffectValue,
        roll: rollValue,
      };
    }
  }

  // --- CRITICAL SCORE ROLL ---
  const critScoreRoll = new Roll(`1d20`);
  await critScoreRoll.evaluate();
  const critScoreResult =
    critScoreRoll.total + (actor.system.critRangeCast || 0);

  let critScore = 0;
  if (critScoreResult > 1) {
    if (critScoreResult <= 6) critScore = 1;
    else if (critScoreResult <= 12) critScore = 2;
    else if (critScoreResult <= 18) critScore = 3;
    else critScore = 4;
  }

  const critDamageMapping = [0, 5, 5, 10, 20];
  const critBonusDamage = critDamageMapping[critScore] || 0;
  const critBonusPenetration =
    critDamageMapping[critScore] + spell.system.penetration;
  const actorCritBonus = Number(actor.system.critDamage) || 0;
  const critDamageTotal = critBonusDamage + actorCritBonus + damageTotal;

  // --- CHAT MESSAGE CONSTRUCTION ---
  const attack =
    attackRoll.total + (actor.system.combatSkills.channeling.attack || 0);
  const rawTemplate = concatRollAndDescription;
  const compiled = Handlebars.compile(rawTemplate);
  const renderedDescription = compiled(rollData);
  const tags = rollData.difficulty
    ? `<span class="action-tag difficulty ">Difficulty ${rollData.difficulty} </span>
      <span class="action-tag range ">Range ${spell.system.range} </span>
      <span class="action-tag spellClass ">${spell.system.spellClass} Spell</span>
      <span class="action-tag rank ">${spell.system.rank} rank</span>
      <span class="action-tag magicAttack ">Magic ATK ${attack}</span>
      <span class="action-tag actionCost ">Actions:${spell.system.actionCost}</span>
      `
    : "";

  const hasDamage = typeof damageTotal === "number" && damageTotal > 0;
  const hasCritDamage = critSuccess === true;
  const showDamageTable = hasDamage;
  const damageHeaders = [
    "<th>Damage</th>",
    hasCritDamage && hasDamage ? "<th>Critical Damage</th>" : "",
  ].join("");

  const damageValues = [
    `<td>${damageTotal}</td>`,
    hasCritDamage && hasDamage ? `<td>${critDamageTotal}</td>` : "",
  ].join("");

  const damageTable = showDamageTable
    ? `
<table style="width: 100%; text-align: center; font-size: 15px;">
  <tr>${damageHeaders}</tr>
  <tr>${damageValues}</tr>
</table>
<hr>
`
    : "";

  const dmgtypes = (() => {
    const hasType =
      spell.system.dmgType1 ||
      spell.system.dmgType2 ||
      spell.system.dmgType3 ||
      spell.system.dmgType4;

    if (!hasType) return "";

    const parts = [
      spell.system.dmgType1,
      spell.system.bool2,
      spell.system.dmgType2,
      spell.system.bool3,
      spell.system.dmgType3,
      spell.system.bool4,
      spell.system.dmgType4,
    ].filter(Boolean);

    return `
    <tr><td>Damage types:</td></tr>
    <tr><td>${parts.join(" ")}</td></tr>
  `;
  })();
  let rollName = spell.name;
  const hasEffects = effectsRollResults.trim().length > 0;
  const effectsTable = hasEffects
    ? `
  <table style="width: 100%; text-align: center; font-size: 15px;">
    <tr><th>Effects</th></tr>
    <tr><td>${effectsRollResults}</td></tr>
  </table>
  <hr>
  `
    : "";

  const hasPenetration = spell.system.penetration > 0;
  const hasCrit = critSuccess === true;
  const showTable = hasPenetration || hasCrit;
  const headers = [
    hasPenetration ? "<th>Penetration</th>" : "",
    hasCrit ? "<th>Critical Score</th>" : "",
  ].join("");
  const values = [
    hasPenetration ? `<td>${spell.system.penetration}</td>` : "",
    hasCrit
      ? `<td title="Crit range result ${critScoreResult}">[${critScore}]</td>`
      : "",
  ].join("");
  const critPenTable = showTable
    ? `
<table style="width: 100%; text-align: center; font-size: 15px;">
  <tr>${headers}</tr>
  <tr>${values}</tr>
</table>
<hr>
`
    : "";

  const rolls = [attackRoll];

  if (hasDamage && damageRoll instanceof Roll) {
    rolls.push(damageRoll);
  }

  const attackHTML = await attackRoll.render();
  const damageHTML = hasDamage ? await damageRoll.render() : "";
  const content = `
<div class="${hasDamage ? "dual-roll" : "single-roll"}">

  <div class="roll-column">
    <div class="roll-label">Margin of Success</div>
    ${attackHTML}
  </div>

  ${
    hasDamage
      ? `
  <div class="roll-column">
    <div class="roll-label">Damage Roll</div>
    ${damageHTML}
  </div>
  `
      : ""
  }

</div>
`;
  let attackFlag = null;

  const damageProfile = {
    expression: [
      spell.system.dmgType1,
      spell.system.bool2,
      spell.system.dmgType2,
      spell.system.bool3,
      spell.system.dmgType3,
      spell.system.bool4,
      spell.system.dmgType4,
    ]
      .filter(Boolean)
      .map((e) => e.toLowerCase()),
  };

  if (hasDamage) {
    attackFlag = {
      type: "attack",
      damageProfile,
      normal: {
        damage: damageTotal,
        penetration: spell.system.penetration,
        halfDamage: spell.system.halfDamage ?? false,
      },

      effects: mechanicalEffects,
    };

    if (critSuccess) {
      attackFlag.critical = {
        damage: critDamageTotal,
        penetration: critBonusPenetration,
        halfDamage: spell.system.halfDamage ?? false,
      };
    }
  }
  console.log("Attack Flag:", attackFlag);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    content,
    rolls: rolls,
    flavor: `
          <div style="display:flex; align-items:center; justify-content:left; gap:8px; font-size:1.3em; font-weight:bold;">
            <img src="${spell.img}" title="${
              spell.name
            }" width="36" height="36">
            <span>${spell.name}</span>
        </div>
        ${tags}
        <hr>
        <table style="width: 100%; text-align: center;font-size: 15px;">
        <p style="text-align: center; font-size: 20px;"><b>
            ${
              critSuccess
                ? "Critical Success!"
                : critFailure
                  ? "Critical Failure!"
                  : ""
            }
        </b></p>
            <tr><th>Description:</th></tr>
            <tr><td><br>${renderedDescription}</td></tr>
            ${dmgtypes}
        </table>
        <hr>
        ${damageTable}
        ${critPenTable}
        ${effectsTable}
        `,
    flags: {
      tos: {
        rollName,
        criticalSuccessThreshold:
          actor.system.combatSkills.channeling.criticalSuccessThreshold,
        criticalFailureThreshold:
          actor.system.combatSkills.channeling.criticalFailureThreshold,
      },
      ...(attackFlag && { attack: attackFlag }),
    },
  });
}
