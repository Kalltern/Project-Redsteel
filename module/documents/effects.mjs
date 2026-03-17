export class ToSActiveEffect extends ActiveEffect {
  /* -------------------------------------------- */
  /*  CHANGE STRUCTURE                            */
  /* -------------------------------------------- */
  static EFFECT_OVERRIDES = {
    stun: ["stagger"],
    guard: ["defensive_stance"],
  };
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
      if (!this._isAuthoritative()) return;

      if ("round" in changed) {
        await this._onRoundStart(combat);
      }

      if ("turn" in changed) {
        await this._onTurnStart(combat);
      }
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

    for (const combatant of combat.combatants.values()) {
      const actor = combatant.actor;
      if (!actor) continue;

      for (const effect of actor.effects) {
        await effect.executeTrigger?.("onRoundStart");
      }
    }
  }

  static async _applyCombatModifiers(actor, combatModifiers) {
    const group = combatModifiers.exclusiveGroup ?? "default";

    const current = foundry.utils.deepClone(
      actor.system.activeCombatEffects ?? {},
    );

    // Remove any existing modifier in same exclusive group
    if (current[group]) {
      delete current[group];
    }

    current[group] = combatModifiers;

    await actor.update({
      "system.activeCombatEffects": current,
    });
  }

  static async _removeCombatModifiers(actor, effectId) {
    const def = CONFIG.TOS.effectDefinitions[effectId];
    if (!def?.combatModifiers) return;

    const group = def.combatModifiers.exclusiveGroup ?? "default";

    console.log("Removing group:", group);

    await actor.update({
      [`system.activeCombatEffects.-=${group}`]: null,
    });
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
    // Effect Override Rules
    // ============================================
    const overrides = this.EFFECT_OVERRIDES?.[effectId];
    if (overrides?.length) {
      for (const overrideId of overrides) {
        const existing = actor.effects.find((e) => e.statuses?.has(overrideId));
        if (existing) {
          await existing.delete();
        }
      }
    }

    // ============================================
    // EXISTING EFFECT
    // ============================================
    if (existing) {
      // -----------------------------
      // FEAR: Reset instead of stack
      // -----------------------------
      if (effectId === "fear") {
        await existing.setFlag("tos", "stacks", 3);
        await existing.executeTrigger("onApply", { appliedStacks: 3 });
        return existing;
      }

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
      return existing;
    }

    // ============================================
    // NEW EFFECT
    // ============================================

    const initialStacks = effectId === "fear" ? 3 : Math.min(stacks, maxStacks);

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
    // Corrosion armor update
    await created.updateCorrosionChange();
    // --------------------------------------------
    // COMBAT MODIFIER INTEGRATION
    // --------------------------------------------
    if (def.combatModifiers) {
      await this._applyCombatModifiers(actor, def.combatModifiers);
    }
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

    const remaining = this.actorTurns - 1;
    console.log("Remaining stacks", remaining);
    if (remaining <= 0) {
      await this.delete();
      return;
    }

    await this.setFlag("tos", "actorTurns", remaining);
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
    const resolve = actor.system.secondaryAttributes.res?.total ?? 0;

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

  async _handleFearTest() {
    const actor = this.parent;
    if (!actor) return;

    const resolve = actor.system.secondaryAttributes.res?.total ?? 0;

    const roll = await new Roll(`${resolve * 10} - 1d100`).roll();

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: "Fear – Resolve Test",
    });

    const total = roll.total;

    // Extract raw d100 result safely
    const dice = roll.terms.find((t) => t.faces === 100);
    const diceResult = dice?.results?.[0]?.result ?? 0;

    let stacks = this.getFlag("tos", "stacks") ?? 1;

    // =========================
    // CRITICAL FAILURE
    // =========================
    if (total <= -60 || diceResult >= 96) {
      stacks += 1;
      await this.setFlag("tos", "stacks", stacks);

      ui.notifications.info(`${actor.name} is overwhelmed by fear! (+1 round)`);
      return;
    }

    // =========================
    // CRITICAL SUCCESS
    // =========================
    if (total >= 60 || diceResult <= 5) {
      stacks -= 1;

      if (stacks <= 0) {
        await this.delete();
        ui.notifications.info(`${actor.name} overcomes their fear!`);
        return;
      }

      await this.setFlag("tos", "stacks", stacks);
      ui.notifications.info(`${actor.name} steels their nerves. (-1 round)`);
      return;
    }

    // Any fail will apply panic
    if (roll.total >= 0) return;
    await game.tos.applyEffect(actor, "panic");
  }

  async _handleFearRound() {
    const actor = this.parent;
    if (!actor) return;

    let stacks = this.getFlag("tos", "stacks") ?? 1;

    // -------------------------
    // Automatic decrement
    // -------------------------
    stacks -= 1;

    if (stacks <= 0) {
      await this.delete();
      ui.notifications.info(`${actor.name} is no longer afraid.`);
      return;
    }

    await this.setFlag("tos", "stacks", stacks);

    // -------------------------
    // Now perform resolve test
    // -------------------------
    await this._handleFearTest();
  }

  async executeTrigger(type, context = {}) {
    const trigger = this.triggers?.[type];
    if (!trigger) return;

    const actor = this.parent;
    if (!actor) return;

    // Handle custom trigger
    if (trigger.custom === "fearTest") {
      return this._handleFearTest();
    }

    if (trigger.custom === "channelingDrain") {
      return this._handleChannelingDrain();
    }

    if (trigger.custom === "fearRound") {
      return this._handleFearRound();
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
  async _onDelete(options, userId) {
    await super._onDelete(options, userId);

    const actor = this.parent;
    if (!actor) return;

    console.log("Deleting effect:", this.name);
    console.log("StatusId:", this.getFlag("core", "statusId"));
    console.log("Combat Effects BEFORE:", actor.system.activeCombatEffects);

    const effectId = this.getFlag("core", "statusId");
    if (!effectId) return;

    await ToSActiveEffect._removeCombatModifiers(actor, effectId);
  }

  async _handleChannelingDrain() {
    const actor = this.parent;
    if (!actor) return;

    const costPerRound = this.getFlag("tos", "costPerRound") ?? 0;
    if (!costPerRound) return;

    const currentMana = actor.system.stats.mana?.value ?? 0;
    const newMana = Math.max(currentMana - costPerRound, 0);

    await actor.update({
      "system.stats.mana.value": newMana,
    });

    ui.notifications.info(
      `<p><b>Maintaining Channeling:</b> -${costPerRound} Mana</p>`,
    );

    // Break if no mana
    if (newMana <= 0) {
      await this.delete();

      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p><b>Channeling Broken (No Mana)</b></p>`,
      });
    }
  }
}
