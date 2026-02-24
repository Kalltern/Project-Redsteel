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
      const statusId = effect.getFlag("core", "statusId");
      const def = CONFIG.TOS.effectDefinitions[statusId];
      if (!def?.maxStacks) return;

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

  async updateCorrosionChange() {
    if (this.getFlag("core", "statusId") !== "corrosion") return;

    const stacks = this.getFlag("tos", "stacks") ?? 1;
    const penalty = -4 * stacks;

    const changes = this.changes.map((c) => {
      if (c.key === "system.armor.natural.bonus") {
        return { ...c, value: penalty };
      }
      return c;
    });

    await this.update({ changes });
  }

  async _onActorTurnStart() {
    await this.executeTrigger("onTurnStart");
    await this.decrementActorTurn();
  }

  static async applyEffect(actor, effectId, { stacks = 1, turns } = {}) {
    const def = CONFIG.TOS.effectDefinitions[effectId];
    if (!def) {
      ui.notifications.error(`Effect not found: ${effectId}`);
      return;
    }

    const duration = turns ?? def.defaultTurns ?? 0;
    const maxStacks = def.maxStacks ?? 99;

    const existing = actor.effects.find((e) => e.statuses?.has(effectId));

    // ============================================
    // EXISTING EFFECT
    // ============================================
    if (existing) {
      const currentStacks = existing.getFlag("tos", "stacks") ?? 1;

      const newStacks = Math.min(currentStacks + stacks, maxStacks);
      const appliedStacks = newStacks - currentStacks;

      if (appliedStacks <= 0) return existing;

      await existing.setFlag("tos", "stacks", newStacks);
      await existing.updateCorrosionChange();

      if (duration > 0) {
        await existing.setFlag("tos", "actorTurns", duration);
      }

      await existing.executeTrigger("onApply", { appliedStacks });
      console.log("Corrosion stacks before:", currentStacks);
      console.log("Corrosion stacks after:", newStacks);

      return existing;
    }

    // ============================================
    // NEW EFFECT
    // ============================================

    const initialStacks = Math.min(stacks, maxStacks);

    const tosFlags = {
      triggers: def.triggers ?? {},
      stacks: initialStacks,
    };

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

    await created.executeTrigger("onApply", { appliedStacks: initialStacks });
    await created.updateCorrosionChange();
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

  async executeTrigger(type, context = {}) {
    const trigger = this.triggers[type];
    if (!trigger) return;

    const actor = this.parent;
    if (!actor) return;

    let formula = trigger.formula;

    const totalStacks = this.getFlag("tos", "stacks") ?? 1;
    const appliedStacks = context.appliedStacks ?? 0;

    // Replace safely
    formula = formula.replaceAll("{stacks}", totalStacks);
    formula = formula.replaceAll("{appliedStacks}", appliedStacks);

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
