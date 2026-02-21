// Import document classes.
import { ToSActor } from "./documents/actor.mjs";
import { ToSItem } from "./documents/item.mjs";
import { ToSCombat } from "./documents/combat.mjs";
import { ToSActiveEffect } from "./documents/effects.mjs";
// Import sheet classes.
import { ToSActorSheet } from "./sheets/actor-sheet.mjs";
import { ToSItemSheet } from "./sheets/item-sheet.mjs";
import { registerEffectSheetExtensions } from "./sheets/effect-sheet.mjs";
// Import helper/utility classes and constants.

import { TOS } from "./helpers/config.mjs";
import { usePotion } from "./utils/usePotion.mjs";
import { defenseRoll } from "./utils/defense.mjs";
import { throwExplosive } from "./utils/throwExplosive.mjs";
import { castSpell } from "./utils/castSpell.mjs";
import { spellDefense } from "./utils/spellDefense.mjs";
import {
  combatAbilities,
  deductAbilityCost,
} from "./utils/combatAbilities.mjs";
import {
  resolveWeaponContext,
  buildWeaponSetView,
} from "./utils/weaponResolver.mjs";
import { attackActions, autoAttack } from "./utils/attackActions.mjs";
import {
  universalAttackLogic,
  rangedAttack,
  throwingAttack,
  meleeAttack,
} from "./utils/basicAttack.mjs";
import {
  delayTurn,
  restAndRecover,
  longRest,
  firstAid,
} from "./utils/otherActions.mjs";

import {
  getNonWeaponAbility,
  getDoctrineBonuses,
  getWeaponSkillBonuses,
  getAttackRolls,
  getDamageRolls,
  getEffectRolls,
  getCriticalRolls,
  evaluateDmgVsArmor,
} from "./utils/combatSkillBonuses.mjs";
import {
  showSpellSelectionDialogs,
  deductMana,
  calculateAttackBonuses,
  performAttackRoll,
  finalizeRollsAndPostChat,
} from "./utils/magicSkillBonuses.mjs";

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

// Add key classes to the global scope so they can be more easily used
// by downstream developers
globalThis.tos = {
  documents: {
    ToSActor,
    ToSItem,
    ToSCombat,
    ToSActiveEffect,
  },
  applications: {
    ToSActorSheet,
    ToSItemSheet,
  },
  utils: {
    rollItemMacro,
  },
};

Hooks.once("init", function () {
  // Add custom constants for configuration.
  CONFIG.TOS = TOS;

  game.tos = game.tos || {};
  game.tos.applyEffect = ToSActiveEffect.applyEffect.bind(ToSActiveEffect);
  game.tos.resolveWeaponContext = resolveWeaponContext;
  game.tos.deductAbilityCost = deductAbilityCost;
  game.tos.buildWeaponSetView = buildWeaponSetView;
  game.tos.evaluateDmgVsArmor = evaluateDmgVsArmor;
  game.tos.firstAid = firstAid;
  game.tos.combatAbilities = combatAbilities;
  game.tos.delayTurn = delayTurn;
  game.tos.restAndRecover = restAndRecover;
  game.tos.longRest = longRest;
  game.tos.spellDefense = spellDefense;
  game.tos.attackActions = attackActions;
  game.tos.meleeAttack = meleeAttack;
  game.tos.universalAttackLogic = universalAttackLogic;
  game.tos.rangedAttack = rangedAttack;
  game.tos.throwingAttack = throwingAttack;
  game.tos.castSpell = castSpell;
  game.tos.throwExplosive = throwExplosive;
  game.tos.usePotion = usePotion;
  game.tos.getNonWeaponAbility = getNonWeaponAbility;
  game.tos.getDoctrineBonuses = getDoctrineBonuses;
  game.tos.getWeaponSkillBonuses = getWeaponSkillBonuses;
  game.tos.getAttackRolls = getAttackRolls;
  game.tos.getDamageRolls = getDamageRolls;
  game.tos.getEffectRolls = getEffectRolls;
  game.tos.getCriticalRolls = getCriticalRolls;
  game.tos.showSpellSelectionDialogs = showSpellSelectionDialogs;
  game.tos.deductMana = deductMana;
  game.tos.calculateAttackBonuses = calculateAttackBonuses;
  game.tos.performAttackRoll = performAttackRoll;
  game.tos.finalizeRollsAndPostChat = finalizeRollsAndPostChat;
  game.tos.defenseRoll = defenseRoll;
  game.tos.autoAttack = autoAttack;
  registerDynamicInitiative();
  registerEffectSheetExtensions();

  /**
   * Set an initiative formula for the system
   * @type {String}
   */

  // Define custom Document classes
  CONFIG.Actor.documentClass = ToSActor;
  CONFIG.Item.documentClass = ToSItem;
  CONFIG.Combat.documentClass = ToSCombat;
  CONFIG.ActiveEffect.documentClass = ToSActiveEffect;
  ToSActiveEffect.registerHooks();
  CONFIG.statusEffects = TOS.statusEffects;
  // Active Effects are never copied to the Actor,
  // but will still apply to the Actor from within the Item
  // if the transfer property on the Active Effect is true.
  CONFIG.ActiveEffect.legacyTransferral = false;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("tos", ToSActorSheet, {
    makeDefault: true,
    label: "TOS.SheetLabels.Actor",
  });
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("tos", ToSItemSheet, {
    makeDefault: true,
    label: "TOS.SheetLabels.Item",
  });
});

/* -------------------------------------------- */
/*  ToS Specific Game settings                  */
/* -------------------------------------------- */

function registerDynamicInitiative() {
  game.settings.register("tos", "registerDynamicInitiative", {
    config: true,
    scope: "world",
    name: "TOS.Config.Initiative.name",
    hint: "TOS.Config.Initiative.label",
    type: Boolean,
    default: false,
  });
}

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

// If you need to add Handlebars helpers, here is a useful example:
Handlebars.registerHelper("toLowerCase", function (str) {
  return str.toLowerCase();
});

Handlebars.registerHelper("or", function () {
  return Array.from(arguments).slice(0, -1).some(Boolean);
});

Handlebars.registerHelper("eq", function (a, b) {
  return a === b;
});

Handlebars.registerHelper("hasVisibleSkillsOfId", function (skills, id) {
  if (!skills) return false;

  const targetId = Number(id);

  return Object.values(skills).some(
    (skill) => skill.id === targetId && skill.visible,
  );
});

Handlebars.registerHelper(
  "filterSkillsByAbility",
  function (skills, abilityId) {
    return Object.entries(skills).filter(
      ([key, skill]) => skill.id === abilityId,
    );
  },
);
Handlebars.registerHelper("range", function (start, end) {
  var range = [];
  for (var i = start; i <= end; i++) {
    range.push(i);
  }
  return range;
});

Handlebars.registerHelper("gt", function (a, b) {
  return a > b;
});

Handlebars.registerHelper("hasValue", function (value) {
  return value !== null && value !== undefined && value !== "";
});
Handlebars.registerHelper("array-lookup", function (array, index) {
  return array && array[index] !== undefined ? array[index] : false;
});
Handlebars.registerHelper("math", function (left, operator, right) {
  left = parseFloat(left);
  right = parseFloat(right);
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right !== 0 ? left / right : 0;
    case "%":
      return left % right;
    default:
      return 0;
  }
});
Handlebars.registerHelper("groupSpellsBySchool", function (spells) {
  const grouped = {};

  for (const spell of spells) {
    // Only include spells where system.option is "magic" but it does not work
    if (spell.system.option === "magic") {
      const school = spell.system?.type;

      // Ensure school is defined and not empty
      if (school) {
        if (!grouped[school]) {
          grouped[school] = [];
        }

        grouped[school].push(spell);
      }
    }
  }

  console.log("Final grouped spells:", grouped);

  // Return grouped spells as an array of objects with school and spells
  return Object.entries(grouped).map(([school, spells]) => ({
    school,
    spells,
  }));
});

Handlebars.registerHelper("groupBySchool", function (spells, options) {
  const schools = {};

  // Group spells by school type
  spells.forEach((spell) => {
    const school = spell.system.type; // Assuming `type` is the school field
    if (!schools[school]) {
      schools[school] = [];
    }
    schools[school].push(spell);
  });

  // Convert into an array to loop over in Handlebars
  return Object.entries(schools).map(([school, spells]) => ({
    school,
    spells,
  }));
});

Handlebars.registerHelper("groupByRank", function (spells, options) {
  if (!Array.isArray(spells)) spells = []; // safeguard
  const ranks = ["wild", "apprentice", "expert", "master", "grandmaster"];
  // Map each rank to an object containing the spells of that rank
  return ranks.map((rank) => ({
    rank,
    spells: spells.filter((s) => s.system?.rank === rank),
  }));
});

Handlebars.registerHelper("healthPercentage", function (current, max) {
  if (max === 0) return 0; // Avoid division by zero
  return (current / max) * 100;
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", () => {
  ui.controls.initialize();
  ToSActiveEffect.registerStatusCounterIntegration();
});
Hooks.once("ready", function () {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on("hotbarDrop", (bar, data, slot) => createDocMacro(data, slot));
});
const SOCKET = "system.tos";
Hooks.once("ready", () => {
  console.log("TOS | Socket Listener Registered");

  game.socket.on(SOCKET, async (data) => {
    console.log("TOS | GM Received Socket Data:", data);
    if (!game.user.isGM) return;
    if (data.type === "applyDamage") {
      await applyDamageAsGM(data);
    }
  });
});

Hooks.once("ready", async () => {
  // Prevent re-adding macros every load
  if (game.user.getFlag("tos", "hotbarInitialized")) return;

  // Define your preset macros
  const macroData = [
    {
      name: "Attack actions",
      command: `game.tos.attackActions();`,
      img: "icons/skills/melee/hand-grip-sword-white-brown.webp",
      slot: 1,
    },
    {
      name: "Defense actions",
      command: `game.tos.defenseRoll();`,
      img: "icons/equipment/shield/shield-round-boss-wood-brown.webp",
      slot: 2,
    },
    {
      name: "Combat abilities",
      command: `game.tos.combatAbilities();`,
      img: "icons/skills/melee/weapons-crossed-swords-yellow.webp",
      slot: 3,
    },
    {
      name: "Channeling",
      command: `game.tos.castSpell();`,
      img: "icons/magic/lightning/orb-ball-spiral-blue.webp",
      slot: 4,
    },
    {
      name: "Spell defense",
      command: `game.tos.spellDefense();`,
      img: "icons/magic/defensive/shield-barrier-blades-teal.webp",
      slot: 5,
    },
    {
      name: "First aid",
      command: `game.tos.firstAid();`,
      img: "icons/magic/life/cross-yellow-green.webp",
      slot: 7,
    },
    {
      name: "Rest",
      command: `game.tos.restAndRecover();`,
      img: "icons/consumables/plants/tearthumb-halberd-leaf-green.webp",
      slot: 8,
    },
    {
      name: "Potions",
      command: `game.tos.usePotion();`,
      img: "icons/consumables/potions/bottle-round-label-cork-red.webp",
      slot: 9,
    },
    {
      name: "Delay turn",
      command: `game.tos.delayTurn();`,
      img: "icons/magic/time/hourglass-brown-orange.webp",
      slot: 10,
    },
  ];

  for (const data of macroData) {
    let macro = game.macros.getName(data.name);

    if (!macro) {
      macro = await Macro.create({
        name: data.name,
        type: "script",
        command: data.command,
        img: data.img,
      });
    }

    await game.user.assignHotbarMacro(macro, data.slot);
  }

  await game.user.setFlag("tos", "hotbarInitialized", true);
});

/* -------------------------------------------- */
/*  Hooks for Dynamic initiative if enabled     */
/* -------------------------------------------- */

Hooks.on("ready", () => {
  const SYS_ID = "tos";
  const SETTING_KEY = "registerDynamicInitiative";
  const isDynamicInitEnabled = () => game.settings.get(SYS_ID, SETTING_KEY);

  //Next Round Wrapper - Reroll Initiative
  if (
    typeof Combat.prototype.nextRound === "function" &&
    !Combat.prototype.nextRound.hasOwnProperty("_wrapped_by_" + SYS_ID)
  ) {
    const originalNextRound = Combat.prototype.nextRound;
    originalNextRound["_wrapped_by_" + SYS_ID] = true;

    Combat.prototype.nextRound = async function () {
      if (isDynamicInitEnabled()) {
        try {
          const combat = this;

          const combatantUpdates = combat.combatants.map((c) => ({
            _id: c.id,
            flags: { [SYS_ID]: { PreviousRoundInitiative: c.initiative } },
          }));

          await Combatant.updateDocuments(combatantUpdates, { parent: combat });
          await combat.resetAll();
          await combat.rollAll();
        } catch (err) {
          // Translate permission error for players
          if (!game.user.isGM) {
            ui.notifications.warn(
              "Dynamic Initiative: the GM must advance to the next round.",
            );
            return;
          }

          // Preserve original error behavior for GM / unexpected cases

          throw err;
        }
      }

      return originalNextRound.call(this);
    };
  }

  //Previous Round Wrapper - Restore Initiative
  if (
    typeof Combat.prototype.previousRound === "function" &&
    !Combat.prototype.previousRound.hasOwnProperty("_wrapped_by_" + SYS_ID)
  ) {
    const originalPreviousRound = Combat.prototype.previousRound;
    originalPreviousRound["_wrapped_by_" + SYS_ID] = true;

    Combat.prototype.previousRound = async function () {
      if (isDynamicInitEnabled()) {
        try {
          const combat = this;
          const combatantUpdates = [];

          for (const combatant of combat.combatants) {
            const previousInit = combatant.getFlag(
              SYS_ID,
              "PreviousRoundInitiative",
            );

            if (previousInit !== undefined && previousInit !== null) {
              combatantUpdates.push({
                _id: combatant.id,
                initiative: previousInit,
              });

              combatant.unsetFlag(SYS_ID, "PreviousRoundInitiative");
            }
          }

          if (combatantUpdates.length > 0) {
            await Combatant.updateDocuments(combatantUpdates, {
              parent: combat,
            });
          }

          await combat.update({ turn: combat.turns.length - 1 });
        } catch (err) {
          // Translate permission error for players
          if (!game.user.isGM) {
            ui.notifications.warn(
              "Dynamic Initiative: the GM must move to the previous round.",
            );
            return;
          }

          throw err;
        }
      }

      //Call original function to decrement the round
      return originalPreviousRound.call(this);
    };
  }
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */

async function createDocMacro(data, slot) {
  // First, determine if this is a valid owned item.
  if (data.type !== "Item") return;
  if (!data.uuid.includes("Actor.") && !data.uuid.includes("Token.")) {
    return ui.notifications.warn(
      "You can only create macro buttons for owned Items",
    );
  }
  // If it is, retrieve it based on the uuid.
  const item = await Item.fromDropData(data);

  // Create the macro command using the uuid.
  const command = `game.tos.rollItemMacro("${data.uuid}");`;
  let macro = game.macros.find(
    (m) => m.name === item.name && m.command === command,
  );
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: { "tos.itemMacro": true },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemUuid
 */
function rollItemMacro(itemUuid) {
  // Reconstruct the drop data so that we can load the item.
  const dropData = {
    type: "Item",
    uuid: itemUuid,
  };
  // Load the item from the uuid.
  Item.fromDropData(dropData).then((item) => {
    // Determine if the item loaded and if it's an owned item.
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`,
      );
    }

    // Trigger the item roll
    item.roll();
  });
}

Hooks.on("createChatMessage", async (message) => {
  try {
    if (!message.isRoll) return;
    if (!game.user.isGM && message.user.id !== game.user.id) return;
    const flavor = message.flavor ?? "";

    // Read existing rollName from flags.tos (macro or previous messages)
    const existing = message.getFlag("tos", "rollName");

    let shouldSet = !existing;

    // If complex HTML (macro message), just use the macro-provided rollName
    if (/<(div|table|img|hr)/i.test(flavor)) {
      if (existing) {
        console.log("Macro Roll Name:", existing); // Already set by macro
      }
      shouldSet = false;
      // don’t try to infer
    }

    // If no existing rollName, infer from flavor or first roll formula
    if (shouldSet) {
      let rollName = "Roll";

      if (flavor.trim()) {
        rollName = flavor.replace(/<[^>]*>/g, "").trim();
      } else if (message.rolls?.length) {
        rollName = message.rolls[0].formula;
      }

      await message.setFlag("tos", "rollName", rollName);
    }

    // Determine rollName to use (macro flag or inferred)
    const rollNameToUse =
      existing || (await message.getFlag("tos", "rollName"));
    console.log("Roll Name:", rollNameToUse);
  } catch (err) {
    console.error("ToS rollName hook error", err);
  }
});
async function handleApplyDamage(messageId) {
  const message = game.messages.get(messageId);
  if (!message?.flags?.attack) return;

  const checkTargetsAndContinue = () => {
    const targets = Array.from(game.user.targets);
    if (!targets.length) {
      ui.notifications.warn("Please select at least one target.");
      return false;
    }
    continueApplyDamage(message, targets);
    return true;
  };
  function continueApplyDamage(message, targets) {
    openDamageSelectionDialog(message, targets);
  }

  // Initial check
  if (!Array.from(game.user.targets).length) {
    new Dialog({
      title: "No Targets Selected",
      content: "<p>Please select one or more targets, then press OK.</p>",
      buttons: {
        ok: {
          label: "OK",
          callback: checkTargetsAndContinue,
        },
      },
      default: "ok",
    }).render(true);
    return;
  }

  // Targets already selected
  checkTargetsAndContinue();
}
async function applyDamageToTargets(message, targets, mode) {
  const data = {
    type: "applyDamage",
    messageId: message.id,
    mode: mode,
    sceneId: canvas.scene.id,
    targetIds: targets.map((t) => t.id),
  };

  if (game.user.isGM) {
    await applyDamageAsGM(data);
  } else {
    game.socket.emit(SOCKET, data);

    // UI Feedback for player so they know they sent it
    ui.notifications.info("Damage request sent to GM.");
  }
}
async function applyDamageAsGM(data) {
  const { messageId, mode, targetIds, sceneId } = data;
  if (!message?.flags?.attack) return;

  const attack = message.flags.attack;

  const scene = game.scenes.get(sceneId);
  const combat = game.combat;
  for (const tokenId of targetIds) {
    const tokenDoc = scene.tokens.get(tokenId);
    if (!tokenDoc) {
      console.warn(`GM: Token ${tokenId} not found in scene ${sceneId}`);
      continue;
    }

    const actor = tokenDoc.actor;
    if (!actor) continue;

    const currentHp = getProperty(actor, "system.stats.health.value");
    const currentTemporaryHp = getProperty(
      actor,
      "system.stats.temporaryHealth.value",
    );
    const armorTotal = getProperty(actor, "system.armor.total") || 0;

    const result = evaluateDmgVsArmor({
      damage: attack[mode].damage,
      penetration: attack[mode].penetration ?? 0,
      armor: armorTotal,
      hp: currentHp,
      tempHp: currentTemporaryHp,
      halfDamage: attack[mode].halfDamage ?? false,
    });

    const author =
      message.user ??
      game.users.get(message.userId) ??
      game.users.get(message.author);
    const authorIsGM = author?.isGM;

    if (game.user.isGM && !authorIsGM) {
      ui.notifications.info(
        `${author.name} applied ${result.totalHpLoss} damage to ${actor.name}`,
      );
    }
    console.log(
      `GM: Applying ${result.totalHpLoss} damage to ${actor.name}. New HP: ${result.newHp}`,
    );

    await actor.update({
      "system.stats.temporaryHealth.value": Number(result.newTempHp),
      "system.stats.health.value": Number(result.newHp),
    });
    const combatant = combat?.combatants.find((c) => c.tokenId === tokenDoc.id);
    await handlePostDamageStatus({ actor, combatant });
  }
}

function openDamageSelectionDialog(message, targets) {
  const attack = message.flags.attack;
  let mode = "normal";
  const hasCritical = attack.critical !== "" && attack.critical !== undefined;
  const hasBreakthrough =
    attack.breakthrough?.damage !== "" &&
    attack.breakthrough?.damage !== undefined;

  const renderPreview = () =>
    targets
      .map((t) => {
        const result = evaluateDmgVsArmor({
          damage: attack[mode].damage,
          penetration: attack[mode].penetration ?? 0,
          armor: t.actor.system.armor.total,
          hp: t.actor.system.stats.health.value,
          tempHp: t.actor.system.stats.temporaryHealth.value,
          halfDamage: attack[mode].halfDamage ?? false,
        });

        return `
        <li>
          ${t.name} →
          <strong>${result.finalDamage} HP</strong>
        </li>`;
      })
      .join("");

  new Dialog({
    title: "Apply Damage",
    content: `
      <form>
        <fieldset>
          <legend>Damage Type</legend>
          <label><input type="radio" name="mode" value="normal" checked> Normal</label>
         ${
           hasCritical
             ? ` <label> <input type="radio" name="mode" value="critical"> Critical </label> `
             : ""
         }
          ${
            hasBreakthrough
              ? ` <label> <input type="radio" name="mode" value="breakthrough"> Breakthrough </label> `
              : ""
          }
        </fieldset>

        <ul class="damage-preview">
          ${renderPreview()}
        </ul>
      </form>
    `,
    buttons: {
      apply: {
        label: "Apply",
        callback: () => applyDamageToTargets(message, targets, mode),
      },
      cancel: { label: "Cancel" },
    },
    render: (html) => {
      html.find('input[name="mode"]').on("change", (ev) => {
        mode = ev.target.value;
        html.find(".damage-preview").html(renderPreview());
      });
    },
  }).render(true);
}

async function handlePostDamageStatus({ actor, combatant }) {
  console.log("Actor", actor);
  console.log("combatant", combatant);
  const hp = actor.system.stats.health.value;
  if (hp > 0) return;

  // Characters fall prone
  if (actor.type === "character") {
    if (!actor.statuses.has("prone")) {
      await actor.toggleStatusEffect("prone", { active: true });
    }
    return;
  }

  // NPCs die
  if (!actor.statuses.has("dead")) {
    await actor.toggleStatusEffect("dead", {
      active: true,
      overlay: true,
    });
  }

  // Remove from combat if applicable
  if (combatant) {
    await combatant.parent.deleteEmbeddedDocuments("Combatant", [combatant.id]);
  }
}

Hooks.on("renderChatMessage", (message, html, data) => {
  function updateButtonContainerLayout(container) {
    const buttonCount = container.find("button, a.button").length;

    if (buttonCount <= 1) {
      container.addClass("single");
    } else {
      container.removeClass("single");
    }
  }

  // Check if the current user is the one who made the roll
  if (game.user.id === message.author.id) {
    // Add logic to check if the message is a roll message and create a reroll button
    if (message.content.includes("rolled") || message.rolls.length > 0) {
      const rerollButton = $('<button class="reroll-button">Re-Roll</button>');

      // Check if a button container already exists, if not, create one
      let buttonContainer = html.find(".button-container");

      if (buttonContainer.length === 0) {
        buttonContainer = $('<div class="button-container"></div>');
        html.find(".message-content").append(buttonContainer);
      }

      // Append the reroll button to the container
      buttonContainer.append(rerollButton);
      updateButtonContainerLayout(buttonContainer);
      // Add click event listener for the reroll button
      rerollButton.on("click", async (event) => {
        event.preventDefault();
        console.log("Re-roll button clicked");

        const rollFormula = message.rolls[0].formula;
        const roll = new Roll(rollFormula);
        await roll.evaluate();
        const d100Result = roll.dice[0]?.total; // Extract the d100 result
        const criticalSuccessThreshold =
          message.flags.tos.criticalSuccessThreshold;
        const criticalFailureThreshold =
          message.flags.tos.criticalFailureThreshold;
        const critSuccess = d100Result <= criticalSuccessThreshold;
        const rollName = message.getFlag("tos", "rollName");

        let flavorText = "";

        if (critSuccess) {
          flavorText = "Critical Success!";
        } else if (d100Result >= criticalFailureThreshold) {
          flavorText = "Critical Failure!";
        } else {
          flavorText = "";
        }

        roll.toMessage({
          speaker: ChatMessage.getSpeaker({ user: game.user }),
          flavor: `<p style="text-align: center; font-size: 20px;"><b><i class="fa-light fa-dice-d20"></i> ${rollName} <i class="fa-light fa-dice-d20"></i><hr></b></p>
          <p style="text-align: center; font-size: 20px;"><b>${flavorText}</b></p>`,
          flags: {
            tos: {
              rollName,
              criticalSuccessThreshold, // Store critical success threshold
              criticalFailureThreshold, // Store critical failure threshold
            },
          },
        });
      });
    }

    // Only create Apply Damage if this is an attack message
    if (message.flags?.attack) {
      // Reuse or create the button container
      let buttonContainer = html.find(".button-container");

      if (buttonContainer.length === 0) {
        buttonContainer = $('<div class="button-container"></div>');
        html.find(".message-content").append(buttonContainer);
      }

      const applyDamageButton = $(`
      <button
        type="button"
        class="tos-apply-damage"
        data-message-id="${message.id}">
        Apply Damage
      </button>
    `);

      buttonContainer.append(applyDamageButton);
      updateButtonContainerLayout(buttonContainer);
      applyDamageButton.on("click", async () => {
        console.log("Apply Damage clicked", message);
        await handleApplyDamage(message.id);
      });
    }
  }
});

Hooks.once("ready", () => {
  // Listen for checkbox changes to update skill visibility
  $(document).on("change", ".toggle-skill-visibility", function () {
    let skillKey = $(this).attr("data-skill");
    let isChecked = $(this).prop("checked");

    console.log(
      `Toggling visibility for skill: ${skillKey}, Checked: ${isChecked}`,
    );

    // Target the specific skill entry
    let skillEntry = $(`.skill-entry[data-skill="${skillKey}"]`); // Ensure uniqueness with section-based targeting

    // Reverse the logic: if checked, hide the skill, else show the skill
    if (isChecked) {
      skillEntry.addClass("hidden-skill");
    } else {
      skillEntry.removeClass("hidden-skill");
    }
  });
});
