export async function delayTurn() {
  const combat = game.combat;
  if (!combat) {
    ui.notifications.warn("No active combat.");
    return;
  }

  const token = canvas.tokens.controlled[0];
  if (!token) {
    ui.notifications.warn("Select your token.");
    return;
  }

  const combatant = combat.getCombatantByToken(token.id);
  if (!combatant) {
    ui.notifications.warn("Token not in combat.");
    return;
  }

  if (combatant.id !== combat.combatant?.id) {
    ui.notifications.warn("You can only delay on your own turn.");
    return;
  }

  const currentInit = combatant.initiative;
  if (currentInit === null) {
    ui.notifications.warn("You have not rolled initiative.");
    return;
  }

  // Sorted list for consistent ordering
  const ordered = combat.combatants
    .filter((c) => c.id !== combatant.id && c.initiative !== null)
    .sort((a, b) => b.initiative - a.initiative);

  const options = ordered
    .map((c) => `<option value="${c.id}">${c.name} (${c.initiative})</option>`)
    .join("");

  new Dialog({
    title: "Delay Initiative",
    content: `
<p><strong>Current initiative:</strong> ${currentInit}</p>

<h3>Delay until after</h3>
<select name="afterTarget">
  <option value="">— Choose —</option>
  ${options}
</select>

<hr>

<h3>Advanced: Set initiative value</h3>
<input type="number" name="manualInit" step="0.01"/>
`,
    buttons: {
      cancel: { label: "Cancel" },
      delay: {
        label: "Delay",
        callback: async (html) => {
          const targetId = html.find('[name="afterTarget"]').val();
          const manualRaw = html.find('[name="manualInit"]').val();

          // Enforce exclusivity
          if (!!targetId === !!manualRaw) {
            ui.notifications.warn("Choose exactly one delay option.");
            return;
          }

          let newInit;

          // Option 1: After target
          if (targetId) {
            const target = combat.combatants.get(targetId);
            newInit = target.initiative - 0.1;
          }

          // Option 2: Manual value
          if (manualRaw) {
            newInit = Number(manualRaw);
          }

          if (isNaN(newInit)) {
            ui.notifications.warn("Invalid initiative value.");
            return;
          }

          if (newInit > currentInit) {
            ui.notifications.warn("You can only delay, not act earlier.");
            return;
          }

          // Advance turn first
          await combat.nextTurn();

          // Yield to let Foundry settle turn state
          await new Promise((r) => setTimeout(r, 0));

          // Update initiative
          await combatant.update({ initiative: newInit });
        },
      },
    },
  }).render(true);
}

export async function restAndRecover() {
  // Ensure a token is selected
  const token = canvas.tokens.controlled[0];
  if (!token || !token.actor) {
    ui.notifications.error("Please select a token first.");
    return;
  }

  const actor = token.actor;

  // Increase stamina
  const stamina = actor.system.stats.stamina.value ?? 0;
  const newStamina = Math.max(0, stamina + 5);

  await actor.update({
    "system.stats.stamina.value": newStamina,
  });

  // Icon (macro-safe fallback)
  let iconUrl = "icons/consumables/plants/tearthumb-halberd-leaf-green.webp";
  const characterName = actor.name;

  const chatMessage = `
<div style="display:flex; align-items:center; gap:10px;">
  <img src="${iconUrl}" width="36" height="36" style="border-radius:50%;" />
  <div>
    <p style="color:green; font-size:1.2em;">
      <strong>Used Rest action</strong>
    </p>
    <strong>${characterName}</strong> is resting and recovers 5 stamina.
  </div>
</div>
`;

  await ChatMessage.create({
    content: chatMessage,
    speaker: ChatMessage.getSpeaker({ actor }),
  });
}

export async function longRest() {
  // Ensure a token is selected
  const token = canvas.tokens.controlled[0];
  if (!token || !token.actor) {
    ui.notifications.error("Please select a token first.");
    return;
  }

  const actor = token.actor;
  const system = actor.system;

  // ─── Stamina ───
  const stamina = system.stats.stamina.value ?? 0;
  const newStamina = Math.max(0, stamina + system.stats.stamina.max);

  // ─── Health ───
  const health = system.stats.health.value ?? 0;
  const newHealth = Math.max(0, health + 10 + system.attributes.end.total * 2);

  // ─── Toxicity ───
  const toxicity = system.stats.toxicity.value ?? 0;
  const newToxicity = Math.max(
    0,
    toxicity - 5 - system.attributes.end.total * 2,
  );

  // ─── Mind ───
  const mind = Number(system.stats.mind.value ?? 0);
  const newMind = Math.max(0, mind + 1);

  await actor.update({
    "system.stats.stamina.value": newStamina,
    "system.stats.health.value": newHealth,
    "system.stats.toxicity.value": newToxicity,
    "system.stats.mind.value": newMind,
  });

  // ─── Mana (Elementalist only) ───
  if (system.doctrines.elementalist.value > 0) {
    const mana = system.stats.mana.value ?? 0;
    const newMana = Math.max(0, mana + 25);

    await actor.update({
      "system.stats.mana.value": newMana,
    });
  }

  // ─── Chat Message ───
  const iconUrl = "icons/magic/time/day-night-sunset-sunrise.webp";
  const characterName = actor.name;

  const chatMessage = `
<div style="display:flex; align-items:center; gap:10px;">
  <img src="${iconUrl}" width="36" height="36" style="border-radius:50%;" />
  <div>
    <p style="color:#007ba9; font-size:1.2em;">
      <strong>Used Long Rest action</strong>
    </p>
    <strong>${characterName}</strong> had a long rest that soothes body and soul.
  </div>
</div>
`;

  await ChatMessage.create({
    content: chatMessage,
    speaker: ChatMessage.getSpeaker({ actor }),
  });
}

export async function firstAid() {
  const selectedToken = canvas.tokens.controlled[0];
  if (!selectedToken) {
    ui.notifications.warn("Please select a token.");
    return;
  }

  let actor = selectedToken.actor.system;
  let firstAidData = actor.skills.firstAid;

  const firstAidRoll = new Roll(`@skills.firstAid.rating - 1d100`, actor);
  await firstAidRoll.evaluate({ async: true });

  const d100 = firstAidRoll.dice[0]?.total;
  const critFail = firstAidData.criticalFailureThreshold;
  const critSuccess = firstAidData.criticalSuccessThreshold;

  let critStatus = "";
  let healRoll = null;

  if (d100 >= critFail) {
    critStatus =
      "<strong style='color: red;'>Critical Failure! Injury caused!</strong>";
    healRoll = new Roll("2d4");
    Math.floor(healRoll);
    await healRoll.evaluate({ async: true });
  } else if (d100 <= critSuccess || firstAidRoll.total >= 60) {
    critStatus = "<strong style='color: green;'>Critical Success!</strong>";
    healRoll = new Roll("(3d6+3)*2");
    Math.floor(healRoll);
    await healRoll.evaluate({ async: true });
  } else if (firstAidRoll.total >= 25) {
    healRoll = new Roll("(3d6+3)*1.5");
    Math.floor(healRoll);
    await healRoll.evaluate({ async: true });
  } else {
    healRoll = new Roll("3d6+3");
    Math.floor(healRoll);
    await healRoll.evaluate({ async: true });
  }

  const iconUrl = "icons/magic/life/cross-yellow-green.webp";

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: selectedToken.actor }),
    flavor: `
<div style="display:flex; align-items:center; gap:10px;">
  <img src="${iconUrl}" width="36" height="36" style="border-radius:50%;" />
  <div>
    <p style="color:#007ba9; font-size:1.2em;">
      <strong>Used first aid action</strong>
      ${critStatus}
    </p>
  </div>
</div>
  `,
    rolls: healRoll ? [firstAidRoll, healRoll] : [firstAidRoll],
    type: CONST.CHAT_MESSAGE_TYPES.ROLL,
  });
}
