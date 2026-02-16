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
      (["melee", "ranged"].includes(i.system.type) ||
        i.system.class === "defense"),
  );

  const ABILITY_TABS = [
    { id: "melee", label: "Melee" },
    { id: "ranged", label: "Ranged" },
  ];

  function getAbilityCategory(ability) {
    if (ability.system.type === "ranged") return "ranged";
    if (ability.system.type === "melee" || ability.system.class === "defense") {
      return "melee";
    }
    return null;
  }

  const abilitiesByCategory = {
    melee: [],
    ranged: [],
  };

  for (const ability of abilities) {
    const category = getAbilityCategory(ability);
    if (category && abilitiesByCategory[category]) {
      abilitiesByCategory[category].push(ability);
    }
  }

  let tabHeadersHtml = "";
  let tabContentHtml = "";

  for (const tab of ABILITY_TABS) {
    const list = abilitiesByCategory[tab.id];
    if (!list.length) continue;

    tabHeadersHtml += `
    <div class="tab-item" data-tab="${tab.id}">
      ${tab.label} (${list.length})
    </div>
  `;

    const abilityListHtml = list
      .map(
        (ability) => `
      <li class="spell-choice ability-choice"
          data-ability-id="${ability.id}">
        <img src="${ability.img}"
             class="ability-icon">
        <span class="ability-name">
          ${ability.name}
        </span>
      </li>
    `,
      )
      .join("");

    tabContentHtml += `
    <div class="tab-pane" data-tab="${tab.id}">
      <ul style="list-style:none; padding:0;">
        ${abilityListHtml}
      </ul>
    </div>
  `;
  }

  if (!abilities.length)
    return ui.notifications.warn(
      `No combat or defense abilities found on ${actor.name}.`,
    );

  // ====================================================================
  // 2. CSS INJECTION
  // ====================================================================

  if (!document.getElementById("tos-ability-dialog-styles")) {
    const css = `
        .ability-dialog .window-content { max-width: 300px; width: 100%; }
        .ability-dialog .window { width: auto; }
        #keep-open-container { margin-bottom: 8px; font-size: 14px; }
        #keep-open { margin-right: 5px; }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.id = "tos-ability-dialog-styles";
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

  async function onAbilityChosen(ability, container, dialog, actor) {
    const html = $(container);

    const aimValue =
      parseInt(html.find('input[name="aim"]:checked').val()) || 0;

    const useSneak = html.find("#sneak-attack-checkbox")[0]?.checked;
    const useFlanking = html.find("#flanking-attack-checkbox")[0]?.checked;

    const intent = {
      aim: aimValue,
      sneak: useSneak,
      flanking: useFlanking,
    };
    const isDefenseRoll = ability.system.class === "defense";
    const keepOpen = container.querySelector("#keep-open")?.checked;

    await deductAbilityCost(actor, ability);

    if (isDefenseRoll || ability.system.weaponAbility) {
      const mode = isDefenseRoll ? "defense" : "attack";
      await weaponSelectionFlow(actor, ability, mode, intent);
    } else {
      await game.tos.getNonWeaponAbility(actor, ability);
    }

    if (!keepOpen) dialog.close();
  }

  // ====================================================================
  // 4. MAIN DIALOG (Unified List)
  // ====================================================================
  const isCharacter = actor.type === "character";
  const hasActiveSet = isCharacter && actor.system.combat?.activeWeaponSet;

  const activeSetPreview = hasActiveSet
    ? renderWeaponLoadoutsDialog(actor)
    : "";

  let abilityDialog = new Dialog({
    title: `Choose Combat or Defense Ability`,
    content: `
<form class="ability-dialog-form">

  ${activeSetPreview}

  ${activeSetPreview ? "<hr>" : ""}

  <div class="form-group">
  <label>Aim:</label><br>
  <div id="aim-selector">
    ${[0, 1, 2, 3, 4]
      .map(
        (n) => `
      <input type="radio" name="aim" value="${n}" ${n === 0 ? "checked" : ""}>
      <label class="aim-dot">${n === 0 ? "–" : n}</label>
    `,
      )
      .join("")}
  </div>
</div>

<div class="form-group">
  <label>
    Sneak Attack <input type="checkbox" id="sneak-attack-checkbox" />
    Flanking <input type="checkbox" id="flanking-attack-checkbox" />
  </label>
</div>

<hr>

  <div id="keep-open-container">
    <label>
      <input type="checkbox" id="keep-open">
      Keep this window open
    </label>
  </div>

  <div class="ability-tabs">
    <div class="tab-headers">${tabHeadersHtml}</div>
    <div class="tab-content">${tabContentHtml}</div>
  </div>

</form>
`,
    classes: ["ability-dialog"],
    buttons: {},
    render: (html) => {
      // Activate first tab
      const firstTab = html.find(".tab-item").first();
      firstTab.addClass("active");
      html
        .find(`.tab-pane[data-tab="${firstTab.data("tab")}"]`)
        .addClass("active");

      // Switch tabs
      html.find(".tab-item").click(function () {
        const tab = $(this).data("tab");
        html.find(".tab-item").removeClass("active");
        $(this).addClass("active");
        html.find(".tab-pane").removeClass("active");
        html.find(`.tab-pane[data-tab="${tab}"]`).addClass("active");
      });

      // Ability selection
      html.find(".ability-choice").click(async (event) => {
        const abilityId = event.currentTarget.dataset.abilityId;
        const ability = abilities.find((a) => a.id === abilityId);
        if (!ability) return;

        await onAbilityChosen(ability, html[0], abilityDialog, actor);
      });
      html.find(".weapon-set-toggle").on("click", async () => {
        const next = actor.system.combat.activeWeaponSet === 1 ? 2 : 1;

        await actor.update({
          "system.combat.activeWeaponSet": next,
        });

        abilityDialog.close();
        combatAbilities(); // 🔁 reopen with updated preview
      });
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
  async function weaponSelectionFlow(actor, ability, mode, intent) {
    // ==================================================
    // 1. AUTO-RESOLVE VIA ACTIVE WEAPON SET
    // ==================================================

    const weaponContext = game.tos.resolveWeaponContext(actor, ability);

    if (weaponContext) {
      await updateCombatFlags(actor, intent);

      if (mode === "defense") {
        return game.tos.defenseRoll({
          actor,
          weapon: weaponContext.weapon,
          ability,
        });
      }

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

      return runAttackMacro(
        actor,
        weaponContext,
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

    let weapons;

    if (ability.system.type === "melee") {
      weapons = actor.items.filter(
        (i) =>
          i.type === "weapon" &&
          ["axe", "sword", "blunt", "polearm"].includes(i.system.class) &&
          !i.system.thrown,
      );
    }

    if (ability.system.type === "ranged") {
      weapons = actor.items.filter(
        (i) =>
          (i.type === "weapon" &&
            ["bow", "crossbow"].includes(i.system.class)) ||
          (["axe", "sword", "blunt", "polearm"].includes(i.system.class) &&
            i.system.thrown),
      );
    }
    if (!weapons?.length)
      return ui.notifications.warn("This actor has no valid weapons.");
    const weaponChoices = weapons.map((w, idx) => ({
      label: w.name,
      value: idx,
    }));

    const handleWeaponSelection = async (weaponIndex) => {
      const weapon = weapons[weaponIndex];
      const weaponContext = game.tos.resolveWeaponContext(
        actor,
        ability,
        weapon,
      );
      if (!weaponContext) return;

      await updateCombatFlags(actor, intent);

      if (mode === "defense") {
        // defenseRoll function
        await game.tos.defenseRoll({
          actor,
          weapon: weaponContext.weapon,
          ability,
        });
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
          weaponContext,
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

    const weaponDialog = new Dialog({
      title: `Select Weapon - ${ability.name} (${
        mode === "defense" ? "Defense" : "Attack"
      })`,
      content: `
        <form>
            <p>Choose Weapon for ${mode} roll:</p>
           
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

          await updateCombatFlags(actor, html);

          await handleWeaponSelection(selectedValue);
        });
      },
    });

    weaponDialog.render(true);
  }

  // runAttackMacro, updateCombatFlags, and deductAbilityCost functions

  async function updateCombatFlags(actor, intent) {
    if (!actor) return;

    if (intent.sneak) {
      await actor.setFlag("tos", "useSneakAttack", true);
      await actor.setFlag("tos", "sneakAccessCounter", 0);
    } else {
      await actor.unsetFlag("tos", "useSneakAttack");
      await actor.unsetFlag("tos", "sneakAccessCounter");
    }

    if (intent.flanking) {
      await actor.setFlag("tos", "useFlankingAttack", true);
    } else {
      await actor.unsetFlag("tos", "useFlankingAttack");
    }

    if (intent.aim > 0) {
      await actor.setFlag("tos", "aimCount", intent.aim);
    } else {
      await actor.unsetFlag("tos", "aimCount");
    }
  }

  async function deductAbilityCost(actor, ability) {
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
      const { type, mode, amount } = res;
      if (!type || !mode || !amount) continue;

      const statKey = type.toLowerCase();
      const currentValue = actor.system.stats[statKey]?.value ?? 0;
      let newValue = currentValue;

      if (mode === "drain") {
        newValue = Math.max(currentValue - amount, 0);
      }

      if (mode === "add") {
        newValue = currentValue + amount;
      }

      updates[`system.stats.${statKey}.value`] = newValue;
    }

    if (Object.keys(updates).length) {
      await actor.update(updates);
    }

    ui.notifications.info(`${ability.name} activated`);
  }

  async function postUniversalStyleAttackChat({
    actor,
    weapon,
    ability,
    attackRoll,
    damageRoll,
    critSuccess,
    critFailure,
    damageTotal,
    penetration,
    critDamageTotal,
    critBonusPenetration,
    critScore,
    critScoreResult,
    breakthroughRollResult,
    showBreakthrough,
    allBleedRollResults,
    effectsRollResults,
    rollName,
    criticalSuccessThreshold,
    criticalFailureThreshold,
    halfDamage = 0,
    concatRollAndDescription,
  }) {
    const attackHTML = await attackRoll.render();
    const damageHTML = await damageRoll.render();

    const hasBreakthrough =
      showBreakthrough &&
      typeof breakthroughRollResult === "string" &&
      breakthroughRollResult.trim() !== "";

    const damageLine = `
<div style="
  display:grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 24px;
  font-size:16px;
  max-width: fit-content;
  margin: 0 auto;
">

  <div style="display:grid; grid-template-columns:auto 1fr; column-gap:8px;">
    <div>Damage:</div><div style="text-align:center;">${damageTotal}</div>
    <div>Penetration:</div><div style="text-align:center;">${penetration}</div>
    ${
      hasBreakthrough
        ? `
          <div>Breakthrough:</div>
          <div style="text-align:center;">${breakthroughRollResult}</div>
        `
        : `
          <div>&nbsp;</div><div>&nbsp;</div>
        `
    }
  </div>

  <div style="display:grid; grid-template-columns:auto 1fr; column-gap:8px;">
    <div>Crit Dmg:</div><div style="text-align:center;">${critDamageTotal}</div>
    <div>Crit Pen:</div><div style="text-align:center;">${critBonusPenetration}</div>
    <div>Crit score:</div>
    <div style="text-align:center;">
      <span title="Crit range result ${critScoreResult}"
        style="text-decoration:underline dotted; cursor:help;">
        [ ${critScore} ]
      </span>
    </div>
  </div>
</div>
`;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      content: `
<div class="dual-roll">
  <div class="roll-column">
    <div class="roll-label">Margin of Success</div>
    ${attackHTML}
  </div>
  <div class="roll-column">
    <div class="roll-label">Damage Roll</div>
    ${damageHTML}
  </div>
</div>
`,
      rolls: [attackRoll, damageRoll],
      flavor: `
<span style="display:inline-flex; align-items:center;">
  <img src="${ability.img}" width="36" height="36" style="margin-right:8px;">
  <strong style="font-size:20px;">
    ${ability.name} with ${weapon.name}
  </strong>
</span>
<hr>
<table style="width:100%; text-align:center; font-size:16px;">
<tr><td>${concatRollAndDescription}</td></tr>
</table>
<hr>
<p style="text-align:center; font-size:20px;">
  <b>${critSuccess ? "Critical Success!" : critFailure ? "Critical Failure!" : ""}</b>
</p>


${damageLine}

<hr>

<table style="width:100%; text-align:center; font-size:15px;">
  <tr><th>Effects</th></tr>
  <tr>
    <td><b>${allBleedRollResults}</b> ${effectsRollResults}</td>
  </tr>
</table>
<hr>
`,
      flags: {
        tos: {
          rollName,
          criticalSuccessThreshold,
          criticalFailureThreshold,
        },
        attack: {
          type: "attack",
          normal: { damage: damageTotal, penetration, halfDamage },
          critical: {
            damage: critDamageTotal,
            penetration: critBonusPenetration,
            halfDamage,
          },
          breakthrough: {
            damage: breakthroughRollResult,
            penetration,
            halfDamage,
          },
        },
      },
    });
  }

  async function runAttackMacro(
    actor,
    weaponContext,
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
    const weapon = weaponContext.weapon;
    let {
      doctrineBonus,
      doctrineCritBonus,
      doctrineCritRangeBonus,
      doctrineStunBonus,
      doctrineSkillCritPen,
      doctrineCritDmg,
      doctrineBleedBonus,
    } = await game.tos.getDoctrineBonuses(actor, weapon);

    doctrineBonus += abilityCritChance;
    doctrineCritRangeBonus += abilityCritRange;

    const {
      weaponSkillEffect,
      weaponSkillCrit,
      weaponSkillCritDmg,
      weaponSkillCritPen,
    } = await game.tos.getWeaponSkillBonuses(actor, weapon);

    const mainPen = Number(weapon.system.penetration) || 0;

    const offPen = weaponContext?.isDualWield
      ? Number(
          weaponContext.offWeapon?.system?.offhandProperties?.penetration,
        ) || 0
      : 0;

    const penetration = mainPen + offPen + abilityPenetration;

    let {
      attackRoll,
      rollName,
      critSuccess,
      critFailure,
      criticalSuccessThreshold,
      criticalFailureThreshold,
    } = await game.tos.getAttackRolls(
      actor,
      weapon,
      doctrineBonus,
      doctrineCritBonus,
      weaponSkillCrit,
      abilityAttack,
      weaponContext,
      abilityCritFail,
    );

    const { damageRoll, damageTotal, breakthroughRollResult } =
      await game.tos.getDamageRolls(
        actor,
        weapon,
        weaponContext,
        abilityDamage,
        abilityBreakthrough,
      );

    const {
      critScore,
      critScoreResult,
      critBonusPenetration,
      critDamageTotal,
    } = await game.tos.getCriticalRolls(
      actor,
      weapon,
      weaponContext,
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
      await game.tos.getEffectRolls(
        actor,
        weapon,
        weaponContext,
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
    await postUniversalStyleAttackChat({
      actor,
      weapon,
      ability,
      attackRoll,
      damageRoll,
      critSuccess,
      critFailure,
      damageTotal,
      penetration,
      critDamageTotal,
      critBonusPenetration,
      critScore,
      critScoreResult,
      breakthroughRollResult,
      showBreakthrough: weapon.system.breakthrough,
      allBleedRollResults,
      effectsRollResults,
      rollName,
      criticalSuccessThreshold,
      criticalFailureThreshold,
      concatRollAndDescription,
    });
  }
}

function renderWeaponLoadoutsDialog(actor) {
  const weaponSets = game.tos.buildWeaponSetView(actor);
  const activeSet = actor.system.combat.activeWeaponSet;

  return `
<section class="weapon-loadouts horizontal active-set-${activeSet}">

  ${[1, 2]
    .map((setId) => {
      const ws = weaponSets[setId];

      return `
<div class="weapon-set-block">
  <div class="weapon-loadout-label">Set ${setId}</div>

  <div class="weapon-slot-row">

    <!-- MAIN -->
    <div class="weapon-slot main ${ws.main ? "filled" : "empty"}"
         data-set="${setId}" data-slot="main">
      ${
        ws.main
          ? `<img src="${ws.main.img}" title="${ws.main.name}">`
          : `<span>Main</span>`
      }
    </div>

    <!-- OFF -->
    <div class="weapon-slot off
      ${ws.mainIsTwoHanded ? "blocked" : ws.off ? "filled" : "empty"}
      ${ws.offIsShield ? "shield" : ""}"
      data-set="${setId}" data-slot="off">

      ${
        ws.mainIsTwoHanded
          ? `
            <div class="two-handed-ghost">
              <img src="${ws.main.img}"
                   title="${ws.main.name} (Two-handed)"
                   width="44" height="44">
            </div>
          `
          : ws.off
            ? `<img src="${ws.off.img}" title="${ws.off.name}" width="44" height="44">`
            : `<span>Off</span>`
      }

    </div>

  </div>
</div>
`;
    })
    .join("")}

  <div class="weapon-set-switcher">
    <button type="button"
      class="weapon-set-toggle set-${activeSet}"
      title="Switch Weapon Set">
      <i class="fa-sharp fa-regular fa-arrows-repeat"></i>
    </button>
  </div>

</section>
`;
}
