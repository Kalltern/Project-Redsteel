export async function castSpell() {
  // --- 1. Token Selection and Initial Checks ---
  const selectedToken = canvas.tokens.controlled[0];
  if (!selectedToken) {
    ui.notifications.warn("Please select a token.");
    return;
  }

  const actor = selectedToken.actor;

  // --- 2. School / Spell Selection ---
  // Returns the selected spell or null if canceled
  const result = await game.tos.showSpellSelectionDialogs(actor);
  if (!result) {
    ui.notifications.info("Spell casting canceled.");
    return;
  }

  const { spell, freeCast, focusSpent, ignoreChanneling, maintainChanneling } =
    result;

  // --- 3. Mana Deduction ---
  if (!freeCast) {
    const ok = await game.tos.deductMana(actor, spell);
    if (!ok) return;
  }

  // --- 4. Bonus Calculation (Scalable) ---
  const bonuses = game.tos.calculateAttackBonuses(actor, spell);

  // --- 5. Attack Roll ---
  const attackResults = await game.tos.performAttackRoll(
    actor,
    spell,
    bonuses.attackBonus,
    focusSpent,
    { ignoreChanneling },
  );

  // --- 6. Finalization ---
  await game.tos.finalizeRollsAndPostChat(
    actor,
    spell,
    bonuses,
    attackResults,
    { ignoreChanneling, maintainChanneling },
  );
}
