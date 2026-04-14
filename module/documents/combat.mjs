/**
 * Extend the basic Combat with custom initiative handling.
 * @extends {Combat}
 */
export class RedsteelCombat extends Combat {
  async rollInitiative(
    ids,
    { formula = null, updateTurn = true, messageOptions = {} } = {},
  ) {
    console.log("Rolling initiative for IDs:", ids);

    ids = typeof ids === "string" ? [ids] : ids;
    const currentId = this.combatant?.id;
    const chatRollMode = game.settings.get("core", "rollMode");

    const updates = [];
    const messages = [];

    for (let [i, id] of ids.entries()) {
      const combatant = this.combatants.get(id);
      const actor = combatant?.actor;
      if (!combatant?.isOwner || !actor) continue;

      // Custom formula per actor type
      const rollFormula =
        actor.type === "npc"
          ? "1d12 + @secondaryAttributes.ini.total"
          : actor.system.doctrines.rogue.value >= 7
            ? "2d12kh1 + @secondaryAttributes.ini.total + @secondaryAttributes.spd.total"
            : "1d12 + @secondaryAttributes.ini.total + @secondaryAttributes.spd.total";

      const roll = new Roll(rollFormula, actor.getRollData());
      await roll.evaluate();

      updates.push({ _id: id, initiative: roll.total });

      const messageData = foundry.utils.mergeObject(
        {
          speaker: ChatMessage.getSpeaker({
            actor,
            token: combatant.token,
            alias: combatant.name,
          }),
          flavor: game.i18n.format("COMBAT.RollsInitiative", {
            name: combatant.name,
          }),
          flags: { "core.initiativeRoll": true },
        },
        messageOptions,
      );

      const chatData = await roll.toMessage(messageData, { create: false });
      chatData.rollMode =
        "rollMode" in messageOptions
          ? messageOptions.rollMode
          : combatant.hidden
            ? CONST.DICE_ROLL_MODES.PRIVATE
            : chatRollMode;

      if (i > 0) chatData.sound = null;
      messages.push(chatData);
    }

    if (!updates.length) return this;

    await this.updateEmbeddedDocuments("Combatant", updates);

    if (updateTurn && currentId) {
      await this.update({
        turn: this.turns.findIndex((t) => t.id === currentId),
      });
    }

    await ChatMessage.implementation.create(messages);
    return this;
  }
}
