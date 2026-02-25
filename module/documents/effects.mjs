export class ToSActiveEffect extends ActiveEffect {
  /* -------------------------------------------- */
  /*  CHANGE STRUCTURE                            */
  /* -------------------------------------------- */

  static registerStatusCounterIntegration() {
    if (!game.user.isGM) {
      console.log(
        "Skipping StatusCounter integration on non-GM:",
        game.user.name,
      );
      return;
    }

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
  static registerHooks() {
    if (this._hooksRegistered) return;

    Hooks.on("updateCombat", async (combat, changed) => {
      if (!("round" in changed)) return;

      if (!this._isAuthoritative()) return;

      await this._onRoundStart(combat);
    });

    Hooks.on("combatTurn", async (combat) => {
      if (!this._isAuthoritative()) return;
      await this._onTurnStart(combat);
    });

    this._hooksRegistered = true;
  }
  static _isAuthoritative() {
    if (!game.user.isGM) return false;
    if (!game.users.activeGM) return false;
    return game.user.id === game.users.activeGM.id;
  }
  static async _onTurnStart(combat) {
    const actor = combat.combatant?.actor;
    if (!actor) return;

    for (const effect of actor.effects) {
      await effect._onActorTurnStart?.();
    }
  }

  static async _onRoundStart(combat) {
    const lastProcessed = combat.getFlag("tos", "lastProcessedRound");

    if (lastProcessed === combat.round) {
      console.warn("TOS | Round already processed:", combat.round);
      return;
    }

    await combat.setFlag("tos", "lastProcessedRound", combat.round);

    console.log("TOS | Processing round:", combat.round);

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
    const trigger = this.triggers?.[type];
    if (!trigger) return;

    const actor = this.parent;
    if (!actor) return;

    // Handle custom trigger
    if (trigger.custom === "fearTest") {
      return game.tos?.handleFearTest?.(actor, this);
    }

    let formula = trigger.formula;
    if (!formula) return;

    const stacks = this.getFlag("tos", "stacks") ?? 1;
    const appliedStacks = context.appliedStacks ?? stacks;

    formula = formula
      .replace("{stacks}", stacks)
      .replace("{appliedStacks}", appliedStacks);

    const roll = await new Roll(formula).roll();

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${this.name} – ${type}`,
      create: true,
    });

    // Burning panic logic
    if (trigger.panic) {
      await this._handleBurningPanic();
    }
  }
}
