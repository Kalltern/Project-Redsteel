export async function combatAbilities() {
  // ====================================================================
  // 1. INITIAL SETUP AND FILTERING
  // ====================================================================

  const selectedToken = canvas.tokens.controlled[0];
  if (!selectedToken) return ui.notifications.warn("Please select a token.");
  const actor = selectedToken.actor;

  // Collect all relevant abilities: (type: ability) AND (type: melee OR class: defense)
  const abilities = actor.items.filter(
    (i) =>
      i.type === "ability" &&
      (i.system.type === "melee" || i.system.class === "defense"),
  );

  if (!abilities.length)
    return ui.notifications.warn(
      `No combat or defense abilities found on ${actor.name}.`,
    );

  // ====================================================================
  // 2. CSS INJECTION
  // ====================================================================

  if (!document.getElementById("redsteel-ability-dialog-styles")) {
    const css = `
        #ability-list .ability-choice {
            position: relative;
            font-size: 16px;
            color: black;
            cursor: pointer;
            padding: 5px;
            border-bottom: 1px solid #444;
        }

        #ability-list .ability-choice:hover {
            color: black;
            text-shadow: 0 0 1px red, 0 0 2px red;
        }

        .ability-dialog .window-content { max-width: 300px; width: 100%; }
        .ability-dialog .window { width: auto; }
        #keep-open-container { margin-bottom: 8px; font-size: 14px; }
        #keep-open { margin-right: 5px; }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.id = "redsteel-ability-dialog-styles";
    styleSheet.type = "text/css";
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);
  }

  const abilityChoices = abilities.map((a, idx) => ({
    label: a.name,
    value: idx,
  }));

  // ====================================================================
  // 3. EXECUTION HANDLER: _onAbilityChosen
  // ====================================================================

  async function _onAbilityChosen(
    event,
    container,
    abilities,
    abilityDialogInstance,
    actor,
  ) {
    const el = event.currentTarget;
    const idx = Number(el.dataset.value);
    const ability = abilities[idx];
    if (!ability) return ui.notifications.error("Selected ability not found.");

    // Determine the type of roll based on the item's class
    const isDefenseRoll = ability.system.class === "defense";

    // Only close if checkbox is NOT checked
    const keepOpenCheckbox = container.querySelector("#keep-open");
    const keepOpen = keepOpenCheckbox ? keepOpenCheckbox.checked : false;

    try {
      await deductAbilityCost(actor, ability);

      // Both Defense and Attack Abilities require weapon selection/passing
      if (isDefenseRoll || (ability.system && ability.system.weaponAbility)) {
        const mode = isDefenseRoll ? "defense" : "attack";
        await weaponSelectionFlow(actor, ability, mode);
      }
      // Non-Weapon Melee Abilities
      else {
        await game.redsteel.getNonWeaponAbility(actor, ability);
      }
    } catch (err) {
      console.error("Error using ability:", err);
      ui.notifications.error(
        "There was an error using that ability. See console.",
      );
    }

    if (!keepOpen && abilityDialogInstance?.close) {
      abilityDialogInstance.close();
    }
  }

  // ====================================================================
  // 4. MAIN DIALOG (Unified List)
  // ====================================================================

  let abilityDialog = new Dialog({
    title: `Choose Combat or Defense Ability`,
    content: `
        <form>
            <fieldset>
                <div id="keep-open-container">
                    <label><input type="checkbox" id="keep-open" /> Keep this window open</label>
                </div>
                <ul id="ability-list" style="list-style: none; padding: 0; margin: 0;">
                    ${abilityChoices
                      .map(
                        (c) =>
                          `<li class="ability-choice" data-value="${
                            c.value
                          }" tabindex="0" role="button" aria-pressed="false">
                                    <img src="${
                                      abilities[c.value].img
                                    }" width="24" height="24" style="vertical-align: middle;" />
                                    <span style="${
                                      abilities[c.value].system.class ===
                                      "defense"
                                        ? "color: blue;"
                                        : ""
                                    }">
                                        ${c.label} 
                                        (${
                                          abilities[c.value].system.class ===
                                          "defense"
                                            ? "Defense"
                                            : "Attack"
                                        })
                                    </span>
                                </li>`,
                      )
                      .join("")}
                </ul>
            </fieldset>
        </form>
    `,
    classes: ["ability-dialog"],
    buttons: {},
    render: (html) => {
      const container = html instanceof HTMLElement ? html : html[0];

      const list = container.querySelector("#ability-list");
      if (!list) return;

      const items = Array.from(list.querySelectorAll(".ability-choice"));
      for (const li of items) {
        li.addEventListener("click", async (event) => {
          await _onAbilityChosen(
            event,
            container,
            abilities,
            abilityDialog,
            actor,
          );
        });
      }
    },
  });

  abilityDialog.render(true);

  // ====================================================================
  // 5. HELPER FUNCTIONS
  // ====================================================================

  /**
   * Handles weapon selection and dispatches to the correct roll function.
   * * @param {object} actor
   * @param {object} ability
   * @param {'attack'|'defense'} mode
   */
  async function weaponSelectionFlow(actor, ability, mode = "attack") {
    const weapons = actor.items.filter(
      (i) =>
        i.type === "weapon" &&
        ["axe", "sword", "blunt", "polearm"].includes(i.system.class) &&
        i.system.thrown !== true,
    );
    if (!weapons.length)
      return ui.notifications.warn("This actor has no valid weapons.");

    const weaponChoices = weapons.map((w, idx) => ({
      label: w.name,
      value: idx,
    }));

    const handleWeaponSelection = async (weaponIndex) => {
      const weapon = weapons[weaponIndex];

      await updateCombatFlags(actor);

      if (mode === "defense") {
        // defenseRoll function
        await game.redsteel.defenseRoll({ actor, weapon, ability });
      } else {
        const abilityDamage = ability.system.roll.diceBonusFormula || 0;
        const halfDamage = ability.system.roll.halfDamage;
        const abilityAttack = ability.system.attack || 0;
        const abilityBreakthrough = ability.system.breakthrough || 0;
        const abilityPenetration = ability.system.penetration || 0;
        const abilityAttributeTestName = ability.system.attributeTest || 0;
        const abilityTestModifier = ability.system.testModifier || 0;
        const abilityCritRange = ability.system.critRange || 0;
        const abilityCritChance = ability.system.critChance || 0;
        const abilityCritFail = ability.system.critFail || 0;

        await runAttackMacro(
          actor,
          weapon,
          ability,
          abilityDamage,
          abilityAttack,
          abilityBreakthrough,
          abilityPenetration,
          abilityAttributeTestName,
          abilityTestModifier,
          abilityCritRange,
          abilityCritChance,
          abilityCritFail,
          halfDamage,
        );
      }
    };

    const css = `
    #weapon-list .weapon-choice {
        position: relative;
        font-size: 16px;
        color: black;
    }
    
    #weapon-list .weapon-choice:hover {
        color: black;
        text-shadow: 0 0 1px red, 0 0 2px red;
    }

    .weapon-dialog .window-content {
        max-width: 300px;
        width: 100%;
    }

    .weapon-dialog .window {
        width: auto;
    }
`;
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);

    const attackOptionsStyle = mode === "defense" ? "display: none;" : "";

    const weaponDialog = new Dialog({
      title: `Select Weapon - ${ability.name} (${
        mode === "defense" ? "Defense" : "Attack"
      })`,
      content: `
        <form>
            <p>Choose Weapon for ${mode} roll:</p>
            <div class="form-group" style="${attackOptionsStyle}">
                <label>Aim:</label><br>
                <div id="aim-selector">
                    ${[0, 1, 2, 3, 4]
                      .map(
                        (n) => `
                        <input type="radio" name="aim" id="aim-${n}" value="${n}" ${
                          n === 0 ? "checked" : ""
                        }>
                        <label for="aim-${n}" class="aim-dot">${
                          n === 0 ? "–" : n
                        }</label>
                    `,
                      )
                      .join("")}
                </div>
            </div>
            <div class="form-group" style="${attackOptionsStyle}">
                <label>
                    Sneak Attack <input type="checkbox" id="sneak-attack-checkbox" />
                    Flanking <input type="checkbox" id="flanking-attack-checkbox" />
                </label>
            </div>
        </form>

        <form>
        <fieldset>
        <ul id="weapon-list" style="list-style: none; padding: 0;">
            ${weaponChoices
              .map(
                (c) =>
                  `<li class="weapon-choice" data-value="${c.value}" style="cursor: pointer; padding: 5px; border-bottom: 1px solid #444;">${c.label}</li>`,
              )
              .join("")}
        </ul>
        </fieldset>
        </form>
    `,
      classes: ["weapon-dialog"],
      buttons: {},
      render: (html) => {
        html.find(".weapon-choice").click(async (event) => {
          const selectedValue = $(event.currentTarget).data("value");
          await handleWeaponSelection(selectedValue);
        });
      },
    });

    weaponDialog.render(true);
  }

  // runAttackMacro, updateCombatFlags, and deductAbilityCost functions

  async function updateCombatFlags(actor) {
    if (!actor) return;
    const aimValue = parseInt(
      document.querySelector('input[name="aim"]:checked')?.value || 0,
    );
    const useSneak = document.querySelector("#sneak-attack-checkbox")?.checked;
    const useFlanking = document.querySelector(
      "#flanking-attack-checkbox",
    )?.checked;

    if (useSneak) {
      await actor.setFlag("redsteel", "useSneakAttack", true);
      await actor.setFlag("redsteel", "sneakAccessCounter", 0);
    } else {
      await actor.unsetFlag("redsteel", "useSneakAttack");
      await actor.unsetFlag("redsteel", "sneakAccessCounter");
    }

    if (useFlanking) {
      await actor.setFlag("redsteel", "useFlankingAttack", true);
    } else {
      await actor.unsetFlag("redsteel", "useFlankingAttack");
    }

    if (aimValue > 0) {
      await actor.setFlag("redsteel", "aimCount", aimValue);
    } else {
      await actor.unsetFlag("redsteel", "aimCount");
    }
  }

  async function deductAbilityCost(actor, ability) {
    console.log("ABILITY:", ability.name);
    console.log("RESOURCES RAW:", ability.system.resources);
    console.log("IS ARRAY:", Array.isArray(ability.system.resources));
    const updates = {};
    const costType = ability.system.costType;
    const costValue = ability.system.cost;

    if (costType && costValue) {
      const currentValue = actor.system.stats[costType]?.value ?? 0;

      if (currentValue < costValue) {
        ui.notifications.warn(`Not enough ${costType}`);
        return;
      }

      updates[`system.stats.${costType}.value`] = Math.max(
        currentValue - costValue,
        0,
      );
    }

    const resources = Array.isArray(ability.system.resources)
      ? ability.system.resources
      : Object.values(ability.system.resources ?? {});
    for (const res of resources) {
      console.log("RESOURCE ENTRY:", res);
      const { type, mode, amount } = res;
      console.log("PARSED:", { type, mode, amount });
      // Skip incomplete rows
      if (!type || !mode || !amount) continue;

      const statKey = type.toLowerCase();
      console.log("STAT KEY:", statKey);
      console.log("STAT EXISTS:", actor.system.stats[statKey]);
      const currentValue = actor.system.stats[statKey]?.value ?? 0;
      let newValue = currentValue;

      if (mode === "drain") {
        newValue = Math.max(currentValue - amount, 0);
      }

      if (mode === "add") {
        newValue = currentValue + amount;
      }
      console.log(
        "UPDATING",
        `system.stats.${statKey}.value`,
        "FROM",
        currentValue,
        "TO",
        newValue,
      );
      updates[`system.stats.${statKey}.value`] = newValue;
    }

    if (Object.keys(updates).length) {
      console.log("FINAL UPDATES:", updates);
      await actor.update(updates);
      console.log("ACTOR HEALTH AFTER:", actor.system.stats.health.value);
    }

    ui.notifications.info(`${ability.name} activated`);
  }

  async function runAttackMacro(
    actor,
    weapon,
    ability,
    abilityDamage,
    abilityAttack,
    abilityBreakthrough,
    abilityPenetration,
    abilityAttributeTestName,
    abilityTestModifier,
    abilityCritRange,
    abilityCritChance,
    abilityCritFail,
    halfDamage,
  ) {
    let {
      doctrineBonus,
      doctrineCritBonus,
      doctrineCritRangeBonus,
      doctrineStunBonus,
      doctrineSkillCritPen,
      doctrineCritDmg,
      doctrineBleedBonus,
    } = await game.redsteel.getDoctrineBonuses(actor, weapon);

    doctrineBonus += abilityCritChance;
    doctrineCritRangeBonus += abilityCritRange;

    const {
      weaponSkillEffect,
      weaponSkillCrit,
      weaponSkillCritDmg,
      weaponSkillCritPen,
    } = await game.redsteel.getWeaponSkillBonuses(actor, weapon);

    const penetration = (weapon.system.penetration || 0) + abilityPenetration;

    let {
      attackRoll,
      rollName,
      critSuccess,
      critFailure,
      criticalSuccessThreshold,
      criticalFailureThreshold,
    } = await game.redsteel.getAttackRolls(
      actor,
      weapon,
      doctrineBonus,
      doctrineCritBonus,
      weaponSkillCrit,
      abilityAttack,
      abilityCritFail,
    );

    const { damageRoll, damageTotal, breakthroughRollResult } =
      await game.redsteel.getDamageRolls(
        actor,
        weapon,
        abilityDamage,
        abilityBreakthrough,
      );

    const {
      critScore,
      critScoreResult,
      critBonusPenetration,
      critDamageTotal,
    } = await game.redsteel.getCriticalRolls(
      actor,
      weapon,
      doctrineCritRangeBonus,
      attackRoll,
      weaponSkillCritDmg,
      weaponSkillCritPen,
      damageTotal,
      penetration,
      doctrineCritDmg,
      doctrineSkillCritPen,
    );

    const { allBleedRollResults, bleedChanceDisplay, effectsRollResults } =
      await game.redsteel.getEffectRolls(
        actor,
        weapon,
        doctrineBleedBonus,
        doctrineStunBonus,
        weaponSkillEffect,
        critScore,
        critSuccess,
        ability,
      );

    const attributeMap = {
      strength: "str",
      endurance: "end",
      dexterity: "dex",
      intelligence: "int",
      wisdom: "wis",
      charisma: "cha",
    };

    let concatRollAndDescription;
    if (
      abilityAttributeTestName &&
      abilityAttributeTestName !== "-- Select a Type --"
    ) {
      const shortKey =
        attributeMap[abilityAttributeTestName.toLowerCase()] ??
        abilityAttributeTestName;

      let selectedAttributeModifier =
        actor.system.attributes[shortKey]?.mod ?? 0;
      if (actor.type === "npc") {
        selectedAttributeModifier =
          actor.system.attributes[shortKey]?.value ?? 0;
      }

      const attributeRoll = new Roll(
        `(${selectedAttributeModifier + abilityTestModifier}) - 1d100`,
      );
      await attributeRoll.evaluate({ async: true });

      const attributeRollTotal = attributeRoll.total;
      const attributeString = `
        |${abilityAttributeTestName} Test ${
          selectedAttributeModifier + abilityTestModifier
        }%|<br>
        Margin of Success: ${attributeRollTotal}<br>
    `;

      concatRollAndDescription = ability.system.description + attributeString;
    } else {
      concatRollAndDescription = ability.system.description;
    }
    rollName = `${ability.name} with ${weapon.name}`;
    console.log(criticalSuccessThreshold);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      rolls: [attackRoll, damageRoll],
      flavor: `
        <div style="display:flex; align-items:center; justify-content:left; gap:8px; font-size:1.3em; font-weight:bold;">
    <img src="${ability.img}" title="${ability.name}" width="36" height="36">
    <span>${ability.name} with ${weapon.name}</span>
</div>
<hr>
<table style="width: 100%; text-align: center;font-size: 15px;">
    <tr>
      <th>Description:</th>
    </tr>
    <td>${concatRollAndDescription}</td>
<p style="text-align: center; font-size: 20px;"><b>
    ${
      critSuccess ? "Critical Success!" : critFailure ? "Critical Failure!" : ""
    }
    </b></p> 		
</table>
<table style="width: 100%; text-align: center;font-size: 15px;">
    <th>Normal</th>
    <th>Crit</th>
    ${weapon.system.breakthrough ? "<th>Breakthrough</th>" : ""}
    		
    <tr>
        <td>${damageTotal}</td>
        <td>${critDamageTotal}</td>
        ${
          weapon.system.breakthrough ? `<td>${breakthroughRollResult}</td>` : ""
        }
    </tr>
</table>
    
    <hr>
    <table style="width: 100%; text-align: center; font-size: 15px;">
        <tr>
            <th>Penetration</th>
            <th>Critical Score</th>
        </tr>
        <tr>
    <td>${penetration}/${critBonusPenetration}</td>
    <td title="Crit range result ${critScoreResult}">[${critScore}]</td>
        </tr>
    </table>
    <hr>
    <table style="width: 100%; text-align: center;font-size: 15px;">
        <tr>
            <th>Effects</th>
        </tr>
        <tr>
            <td><b>${allBleedRollResults}</b> ${effectsRollResults} 

            </td>
        </tr>
    </table>
    <hr>

    `,
      flags: {
        redsteel: {
          rollName,
          criticalSuccessThreshold,
          criticalFailureThreshold,
        },
        attack: {
          type: "attack",
          normal: {
            damage: damageTotal,
            penetration: penetration,
            halfDamage: ability?.system?.roll?.halfDamage ?? false,
          },

          critical: {
            damage: critDamageTotal,
            penetration: critBonusPenetration,
            halfDamage: ability?.system?.roll?.halfDamage ?? false,
          },

          breakthrough: {
            damage: breakthroughRollResult,
            penetration: penetration,
            halfDamage: ability?.system?.roll?.halfDamage ?? false,
          },
        },
      },
    });
  }
}
