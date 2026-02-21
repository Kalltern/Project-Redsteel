export class ToSActiveEffect extends ActiveEffect {
  /* -------------------------------------------- */
  /*  CHANGE STRUCTURE                            */
  /* -------------------------------------------- */
  static registerHooks() {
    Hooks.on("updateCombat", this._onCombatUpdate.bind(this));
  }
  static registerStatusCounterIntegration() {
    const counterApi = game.modules.get("statuscounter")?.api;
    if (!counterApi) return;

    Hooks.on("preCreateActiveEffect", (effect) => {
      if (!effect.statuses?.has("bleed")) return;

      effect.updateSource({
        "flags.statuscounter.config.dataSource": "flags.tos.stacks",
        "flags.tos.stacks": effect.getFlag("tos", "stacks") ?? 1,
        "flags.statuscounter.visible": true,
      });
    });

    Hooks.on("updateActiveEffect", async (effect) => {
      const status = [...(effect.statuses ?? [])][0];
      const def = CONFIG.TOS.effectDefinitions[status];
      if (!def?.maxStacks) return;

      const stacks = effect.getFlag("tos", "stacks");
      if (stacks > def.maxStacks) {
        await effect.setFlag("tos", "stacks", def.maxStacks);
      }
    });
  }

  static async _onCombatUpdate(combat, changed) {
    if ("round" in changed) {
      await this._onRoundStart(combat);
    }

    if ("turn" in changed) {
      await this._onTurnStart(combat);
    }
  }
  static async _onTurnStart(combat) {
    const actor = combat.combatant?.actor;
    if (!actor) return;

    for (const effect of actor.effects) {
      await effect._onActorTurnStart?.();
    }
  }

  static async _onRoundStart(combat) {
    for (const combatant of combat.combatants) {
      const actor = combatant.actor;
      if (!actor) continue;

      for (const effect of actor.effects) {
        await effect.executeTrigger?.("onRoundStart");
      }
    }
  }

  async _onActorTurnStart() {
    await this.executeTrigger("onTurnStart");
    await this.decrementActorTurn();
  }

  static async applyEffect(actor, effectId, { turns } = {}) {
    const def = CONFIG.TOS.effectDefinitions[effectId];
    if (!def) {
      ui.notifications.error(`Effect not found: ${effectId}`);
      return;
    }

    const duration = turns ?? def.defaultTurns ?? 0;

    // Check for existing effect with same status
    const existing = actor.effects.find((e) => e.statuses?.has(effectId));

    if (existing) {
      switch (def.stacking ?? "refresh") {
        case "ignore":
          return existing;

        case "refresh":
          await existing.setFlag("tos", "actorTurns", duration);
          return existing;

        case "replace":
          await existing.delete();
          break;

        case "stack": {
          const currentStacks = existing.getFlag("tos", "stacks") ?? 1;

          if (currentStacks >= (def.maxStacks ?? 99)) {
            return existing;
          }

          const newStacks = currentStacks + 1;
          await existing.setFlag("tos", "stacks", newStacks);

          // 🔥 THIS LINE
          await existing.executeTrigger("onApply");

          return existing;
        }
      }
    }

    const tosFlags = {
      triggers: def.triggers ?? {},
    };

    // Only set stacks if stackable
    if (def.stacking === "stack") {
      tosFlags.stacks = 1;
    }

    // Only set duration if positive
    if (duration > 0) {
      tosFlags.actorTurns = duration;
    }

    const [created] = await actor.createEmbeddedDocuments("ActiveEffect", [
      {
        name: def.name,
        img: def.img,
        statuses: def.statuses ?? [],
        flags: { tos: tosFlags, core: { statusId: effectId } },
        changes: def.changes ?? [],
      },
    ]);

    await created.executeTrigger("onApply");

    return created;
  }

  getChangesByKey(key) {
    return this.allChanges.filter((c) => c.key === key);
  }

  async addChange({ key, mode, value }) {
    const changes = [...this.allChanges, { key, mode, value }];
    return this.update({ changes });
  }

  /* -------------------------------------------- */
  /*  DURATION STRUCTURE                          */
  /* -------------------------------------------- */

  get actorTurns() {
    return this.getFlag("tos", "actorTurns") ?? 0;
  }

  async decrementActorTurn() {
    if (!this.actorTurns) return;

    if (this.actorTurns <= 1) {
      return this.delete();
    }

    return this.setFlag("tos", "actorTurns", this.actorTurns - 1);
  }

  /* -------------------------------------------- */
  /*  TRIGGER STRUCTURE                           */
  /* -------------------------------------------- */

  get triggers() {
    return this.getFlag("tos", "triggers") ?? {};
  }

  async _handleBurningPanic() {
    // Only resolve once
    if (this.getFlag("tos", "panicResolved")) return;

    const actor = this.parent;
    if (!actor) return;

    const resolve = actor.system.secondaryAttributes.res?.value ?? 0;

    const roll = await new Roll(`${resolve * 10} - 1d100`).roll();

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: "Burning – Panic Test",
    });

    if (roll.total >= 0) {
      // Success → no further panic tests
      await this.setFlag("tos", "panicResolved", true);
      return;
    }

    // Failure → apply panic effect
    await game.tos.applyEffect(actor, "panic");

    // Only test once per burn instance
    await this.setFlag("tos", "panicResolved", true);
  }

  async executeTrigger(type) {
    const trigger = this.triggers[type];
    if (!trigger) return;

    const actor = this.parent;
    if (!actor) return;

    let formula = trigger.formula;
    let panic = trigger.panic;
    // Replace {stacks} placeholder
    const stacks = this.getFlag("tos", "stacks") ?? 1;
    formula = formula.replace("{stacks}", stacks);
    if (panic) {
      await this._handleBurningPanic();
    }

    const roll = await new Roll(formula, actor.getRollData()).roll();

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: this.name,
    });

    if (trigger.target) {
      const current = foundry.utils.getProperty(actor, trigger.target);
      if (typeof current !== "number") return;

      await actor.update({
        [trigger.target]: current - roll.total,
      });
    }
  }
}
