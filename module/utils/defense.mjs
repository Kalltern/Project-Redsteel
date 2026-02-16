export async function defenseRoll({ actor, weapon, ability = null } = {}) {
  const selectedToken = canvas.tokens.controlled[0];

  if (!actor) {
    if (!selectedToken) {
      ui.notifications.warn("Please select a token.");
      return;
    }
    actor = selectedToken.actor;
  }

  /* -------------------------------------------- */
  /*  SHARED CSS                                  */
  /* -------------------------------------------- */

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

  if (!document.getElementById("tos-defense-css")) {
    const styleSheet = document.createElement("style");
    styleSheet.id = "tos-defense-css";
    styleSheet.type = "text/css";
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);
  }

  /* -------------------------------------------- */
  /*  Overwrite the logic if the ability is given */
  /* -------------------------------------------- */
  if (ability) {
    if (ability.system?.rangedDefense != null) {
      return rangedDefense({ ability, weapon });
    }

    if (ability.system?.dodge != null) {
      return dodgeDefense({ ability, weapon });
    }

    if (ability.system?.defense != null) {
      return meleeDefense({ ability, weapon });
    }
  }

  /* -------------------------------------------- */
  /*  DEFENSE SELECTOR                            */
  /* -------------------------------------------- */

  const isCharacter = actor.type === "character";
  const hasActiveSet = isCharacter && actor.system.combat?.activeWeaponSet;

  const activeSetPreview = hasActiveSet
    ? renderWeaponLoadoutsDialog(actor)
    : "";

  if (!ability) {
    const dialog = new Dialog({
      title: "Select Defense Type",
      content: `
    ${activeSetPreview}
    <hr>
    <p>Choose defense:</p>
  `,
      buttons: {
        melee: {
          label: "Melee Defense",
          callback: () => meleeDefense({}),
        },
        ranged: {
          label: "Ranged Defense",
          callback: () => rangedDefense({}),
        },
        dodge: {
          label: "Dodge",
          callback: () => dodgeDefense({}),
        },
      },
      default: "melee",
      render: (html) => {
        html.find(".weapon-set-toggle").on("click", async () => {
          const next = actor.system.combat.activeWeaponSet === 1 ? 2 : 1;

          await actor.update({
            "system.combat.activeWeaponSet": next,
          });

          dialog.close();
          defenseRoll({ actor }); // 🔁 reopen with updated preview
        });
      },
    });

    dialog.render(true);
  }

  /* -------------------------------------------- */
  /*  WEAPON DIALOG                               */
  /* -------------------------------------------- */

  function showWeaponDialog(weapons, onSelect) {
    new Dialog({
      title: "Select Weapon",
      content: `
      <form>
        <fieldset>
          <ul id="weapon-list" style="list-style:none;padding:0;">
            ${weapons
              .map(
                (weapon, index) => `
                <li class="weapon-choice"
                    data-value="${index}"
                    style="cursor:pointer;padding:5px;border-bottom:1px solid #444;">
                  ${weapon.name}
                </li>`,
              )
              .join("")}
          </ul>
        </fieldset>
      </form>
      `,
      buttons: {},
      resizable: true,
      width: 200,
      height: 100,
      render: (html) => {
        html.find("#weapon-list li").click(async (event) => {
          const index = Number(event.currentTarget.dataset.value);
          await onSelect(index);
        });
      },
    }).render(true);
  }
  /* -------------------------------------------- */
  /*  MELEE DEFENSE                               */
  /* -------------------------------------------- */
  async function meleeDefense({ ability = null, weapon = null } = {}) {
    const resolveWithContext = async (context) => {
      const weapon = context.weapon;
      const offProps = getOffhandProps(context);
      const rollName = `Defense with ${weapon.name}`;
      const mainDefense = Number(weapon.system.defense) || 0;
      const offDefense = Number(offProps?.defense) || 0;
      const mainCrit = Number(weapon.system.critDefense) || 0;
      const offCrit = Number(offProps?.critDefense) || 0;
      console.log("DEFENSE CONTEXT:", context);

      const { doctrineCritDefenseBonus, doctrineDefenseBonus } =
        await game.tos.getDoctrineBonuses(actor, weapon);

      const defense = actor.system.combatSkills.meleeDefense;
      const defenseRating = defense.rating;
      const abilityDefense = Number(ability?.system?.defense) || 0;

      const criticalSuccessThreshold =
        defense.criticalSuccessThreshold +
        mainCrit +
        offCrit +
        doctrineCritDefenseBonus;

      const criticalFailureThreshold = defense.criticalFailureThreshold;

      const rollData = {
        defenseRating,
        weaponDefense: mainDefense + offDefense,
        doctrineDefenseBonus,
        abilityDefense,
      };

      const roll = new Roll(
        "@defenseRating + @weaponDefense + @doctrineDefenseBonus + @abilityDefense - 1d100",
        rollData,
      );

      await roll.evaluate();

      await createDefenseChatMessage(
        roll,
        weapon,
        rollName,
        criticalSuccessThreshold,
        criticalFailureThreshold,
      );
    };

    if (!weapon) {
      const context = game.tos.resolveWeaponContext(actor, ability);
      if (context?.weapon) {
        return resolveWithContext(context);
      }
    }
    /* -------------------------------------------- */
    /*  IF WEAPON ALREADY KNOWN → SKIP DIALOG       */
    /* -------------------------------------------- */
    if (weapon) {
      const context = game.tos.resolveWeaponContext(actor, ability, weapon);
      if (!context) return;
      return resolveWithContext(context);
    }

    /* -------------------------------------------- */
    /*  OTHERWISE → ASK PLAYER                     */
    /* -------------------------------------------- */
    const weapons = actor.items.filter(
      (i) =>
        i.type === "weapon" &&
        ["axe", "sword", "blunt", "polearm"].includes(i.system.class) &&
        i.system.thrown !== true,
    );

    if (!weapons.length) {
      ui.notifications.warn("This actor has no melee weapons.");
      return;
    }

    showWeaponDialog(weapons, async (index) => {
      const selected = weapons[index];
      const context = game.tos.resolveWeaponContext(actor, ability, selected);
      if (!context) return;
      await resolveWithContext(context);
    });
  }

  /* -------------------------------------------- */
  /*  RANGED DEFENSE                              */
  /* -------------------------------------------- */
  async function rangedDefense({ ability = null, weapon = null } = {}) {
    const resolveWithContext = async (context) => {
      const weapon = context.weapon;
      const offProps = getOffhandProps(context);

      const rollName = `Ranged defense with ${weapon.name}`;

      const { doctrineCritDefenseBonus, doctrineRangedDefenseBonus } =
        await game.tos.getDoctrineBonuses(actor, weapon);

      const defense = actor.system.combatSkills.rangedDefense;
      const abilityDefense = Number(ability?.system?.rangedDefense) || 0;

      const criticalSuccessThreshold =
        defense.criticalSuccessThreshold + doctrineCritDefenseBonus;

      const criticalFailureThreshold = defense.criticalFailureThreshold;

      const rollData = {
        defenseRating: defense.rating,
        doctrineRangedDefenseBonus,
        abilityDefense,
      };

      const roll = new Roll(
        "@defenseRating + @doctrineRangedDefenseBonus + @abilityDefense - 1d100",
        rollData,
      );

      await roll.evaluate();

      await createDefenseChatMessage(
        roll,
        weapon,
        rollName,
        criticalSuccessThreshold,
        criticalFailureThreshold,
      );
    };

    if (!weapon) {
      const context = game.tos.resolveWeaponContext(actor, ability);
      if (context?.weapon) return resolveWithContext(context);
    }

    if (weapon) {
      const context = game.tos.resolveWeaponContext(actor, ability, weapon);
      if (!context) return;
      return resolveWithContext(context);
    }

    const weapons = actor.items.filter((i) => i.type === "weapon");

    if (!weapons.length) {
      ui.notifications.warn("This actor has no weapons.");
      return;
    }

    showWeaponDialog(weapons, async (index) => {
      const selected = weapons[index];
      const context = game.tos.resolveWeaponContext(actor, ability, selected);
      if (!context) return;
      await resolveWithContext(context);
    });
  }

  /* -------------------------------------------- */
  /*  DODGE DEFENSE                               */
  /* -------------------------------------------- */

  async function dodgeDefense({ ability = null, weapon = null } = {}) {
    const resolveWithContext = async (context) => {
      const weapon = context.weapon;
      const offProps = getOffhandProps(context);

      const rollName = `Dodge with ${weapon.name}`;

      const mainDodge = Number(weapon.system.dodge) || 0;
      const offDodge = Number(offProps?.dodge) || 0;
      const offCritDodge = Number(offProps?.critDodge) || 0;

      const dodge = actor.system.combatSkills.dodge;
      const abilityDefense = Number(ability?.system?.dodge) || 0;

      const criticalSuccessThreshold =
        dodge.criticalSuccessThreshold +
        (Number(weapon.system.critDodge) || 0) +
        offCritDodge;

      const criticalFailureThreshold = dodge.criticalFailureThreshold;

      const staminaCost = 4;
      const stamina = actor.system.stats.stamina.value ?? 0;

      if (stamina < staminaCost) {
        ui.notifications.warn("Not enough stamina!");
        return;
      }

      await actor.update({
        "system.stats.stamina.value": stamina - staminaCost,
      });

      const rollData = {
        dodgeRating: dodge.rating,
        weaponDodge: mainDodge + offDodge,
        abilityDefense,
      };

      const roll = new Roll(
        "@dodgeRating + @weaponDodge + @abilityDefense - 1d100",
        rollData,
      );

      await roll.evaluate();

      await createDefenseChatMessage(
        roll,
        weapon,
        rollName,
        criticalSuccessThreshold,
        criticalFailureThreshold,
      );
    };

    if (!weapon) {
      const context = game.tos.resolveWeaponContext(actor, ability);
      if (context?.weapon) return resolveWithContext(context);
    }

    if (weapon) {
      const context = game.tos.resolveWeaponContext(actor, ability, weapon);
      if (!context) return;
      return resolveWithContext(context);
    }

    const weapons = actor.items.filter((i) => i.type === "weapon");

    if (!weapons.length) {
      ui.notifications.warn("This actor has no weapons.");
      return;
    }

    showWeaponDialog(weapons, async (index) => {
      const selected = weapons[index];
      const context = game.tos.resolveWeaponContext(actor, ability, selected);
      if (!context) return;
      await resolveWithContext(context);
    });
  }

  /* -------------------------------------------- */
  /*  CHAT MESSAGE                                */
  /* -------------------------------------------- */

  async function createDefenseChatMessage(
    roll,
    weapon,
    rollName,
    criticalSuccessThreshold,
    criticalFailureThreshold,
  ) {
    const rollResult = roll.dice[0].results[0].result;

    const critSuccess = rollResult <= criticalSuccessThreshold;
    const critFailure = rollResult >= criticalFailureThreshold;

    const armor = actor.system.armor;

    const armorRows = [
      ["Armor", armor.total],
      ["Acid Armor", armor.acid.total],
      ["Fire Armor", armor.fire.total],
      ["Frost Armor", armor.frost.total],
      ["Lightning Armor", armor.lightning.total],
      ["Magic Armor", armor.magic.total],
    ].filter(([label, value]) => {
      if (label === "Armor") return true;
      return value > 0;
    });

    const armorTable = `
      <table style="width:100%;text-align:center;font-size:15px;">
        <tr><th>Type</th><th>Value</th></tr>
        ${armorRows
          .map(
            ([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`,
          )
          .join("")}
      </table>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      rolls: [roll],
      flavor: `
        <div style="display:flex;align-items:center;gap:8px;font-size:1.3em;font-weight:bold;">
          <img src="${weapon.img}" width="36" height="36">
          <span>${rollName}</span>
        </div>
        <hr>
        <p style="text-align:center;font-size:20px;"><b>
          ${
            critSuccess
              ? "Critical Success!"
              : critFailure
                ? "Critical Failure!"
                : ""
          }
        </b></p>
        ${armorTable}        
      `,
      flags: {
        tos: {
          rollName,
          criticalSuccessThreshold,
          criticalFailureThreshold,
        },
      },
    });
  }
}

function buildWeaponSetView(actor) {
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

    result[setId] = {
      main,
      off,
      mainIsTwoHanded,
      offIsShield,
    };
  }

  return result;
}
function renderWeaponLoadoutsDialog(actor) {
  const weaponSets = buildWeaponSetView(actor);
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

function getOffhandProps(weaponContext) {
  if (!weaponContext?.isDualWield || !weaponContext.offWeapon) {
    return null;
  }
  return weaponContext.offWeapon.system.offhandProperties ?? null;
}
