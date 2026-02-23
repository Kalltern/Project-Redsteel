/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class ToSItem extends Item {
  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    super.prepareData();

    // Only initialize effectTypes for relevant items (e.g., spells, consumables)

    if (
      this.type === "spell" ||
      this.type === "ability" ||
      this.type === "weapon"
    ) {
      this.system.effectTypes = [
        "Custom",
        "Bleeding",
        "Blinded",
        "Burning",
        "Chain",
        "Corrosion",
        "Corrosion-severe",
        "Dazzled",
        "Disorientation",
        "Dispell",
        "Fear",
        "Flammable",
        "Frozen",
        "Heavy stun",
        "Paralyzed",
        "Poisoned",
        "Precision",
        "Rooted",
        "Shield strain",
        "Shield break",
        "Slowed",
        "Soul mark",
        "Stun",
        "Terror",
        "Vulnerable",
        "Weakened",
        "Wet",
      ];

      this.system.dmgTypes = [
        "blunt",
        "piercing",
        "slash",
        "physical",
        "acid",
        "dark",
        "fire",
        "frost",
        "lightning",
        "magic",
        "poison",
        "psychic",
      ];

      if (this.type === "spell" || this.type === "ability") {
        this.system.resourceOptions = {
          modes: ["add", "drain"],
          types: ["Health", "Stamina", "Mana", "Toxicity"],
        };
      }
    }

    if (this.system.roll) {
      const { diceNum, diceSize, diceBonus } = this.system.roll;

      let formula = "";

      if (this.type === "consumable" || this.type === "spell") {
        // Define a unique formula for consumables
        formula = `${diceNum}d${diceSize} ${diceBonus ? `+${diceBonus}` : ""}`;
      } else {
        // Default to Strength
        let attr = "str";

        if (this.actor) {
          let str = this.actor.system.attributes.str.total;
          let dex = this.actor.system.attributes.dex.total;
          let per = this.actor.system.attributes.per.total;

          // Check if the actor owns an item named "Finesse"
          const hasFinesse = this.actor.items.some(
            (item) => item.name.toLowerCase() === "finesse",
          );
          // Check if the actor owns an item named "Giant"
          const hasGiant = this.actor.items.some(
            (item) => item.name.toLowerCase() === "giant",
          );

          // Check if *this* weapon has finesse
          if (this.system.finesse === true && hasFinesse && str <= dex) {
            attr = "dex"; // Use Dexterity if all conditions are met
          }

          // Check if *this* weapon is bow or crossbow
          if (this.system.class === "crossbow" || this.system.class === "bow") {
            attr = "per"; // Use Perception if ranged weapon
          }

          // Check if *this* weapon is throwing and compare str with per
          if (this.system.thrown && str <= per) {
            attr = "per";
            // Check if *this* weapon has finesse
            if (
              this.system.finesse === true &&
              hasFinesse &&
              str <= dex &&
              str <= per
            ) {
              attr = "dex"; // Use Dexterity if all conditions are met
            }
          }
          if (
            hasGiant &&
            this.system.class !== "crossbow" &&
            this.system.class !== "bow"
          ) {
            formula = `${diceNum}d${diceSize} + 1d4 ${
              diceBonus ? `+${diceBonus} + @${attr} ` : ""
            }`;
          } else {
            formula = `${diceNum}d${diceSize} ${
              diceBonus ? `+${diceBonus} + @${attr} ` : ""
            }`;
          }
          if (this.actor.type === "npc") {
            formula = `${diceNum}d${diceSize}  ${
              diceBonus ? `+${diceBonus}` : ""
            } + ${this.actor.system.combatSkills.damageBonus.value}`;
          }
        }
      }

      // Store the formula in system.formula
      this.system.formula = formula;

      // Potentially possible to add roll.total and roll.toMessage
    }

    if (this.type === "ability") {
      this._prepareAbilityRollData();
    }
  }

  _prepareAbilityRollData() {
    const raw = this.system.roll?.diceBonus;

    const parsed = this._parseAbilityDiceBonus(raw);

    // Roll-safe value
    this.system.roll.diceBonusFormula = parsed.formula;

    // Semantic flags
    this.system.roll.halfDamage = parsed.half;
  }

  _parseAbilityDiceBonus(input) {
    if (!input) {
      return { formula: "", half: false };
    }

    let half = false;
    let formula = input;

    if (typeof formula === "string" && formula.includes("@Half")) {
      half = true;
      formula = formula.replace("@Half", "");
    }

    return {
      formula: formula.trim(),
      half,
    };
  }

  /**
   * Prepare a data object which defines the data schema used by dice roll commands against this Item
   * @override
   */
  getRollData() {
    // Starts off by populating the roll data with a shallow copy of `this.system`
    const rollData = { ...this.system };

    // Quit early if there's no parent actor
    if (!this.actor) return rollData;
    // If present, add the actor's roll data
    rollData.actor = this.actor.getRollData();

    // Check if the item is owned by an actor
    if (this.actor) {
      rollData.actor = this.actor.getRollData();

      // Include specific actor attributes in rollData
      rollData.str = this.actor.system.attributes.str.total;
      rollData.dex = this.actor.system.attributes.dex.total;
    }

    return rollData;
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll(event) {
    const item = this;

    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get("core", "rollMode");
    const label = `[${item.type}] ${item.name}`;

    // If there's no roll data, send a chat message.
    if (!this.system.formula) {
      ChatMessage.create({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
        content: item.system.description ?? "",
      });
    }
    // Otherwise, create a roll and send a chat message from it.
    else {
      // Retrieve roll data.
      const rollData = this.getRollData();
      // Invoke the roll and submit it to chat.
      const roll = new Roll(rollData.formula, rollData);
      // If you need to store the value first, uncomment the next line.
      // const result = await roll.evaluate();
      roll.toMessage({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
      });
      return roll;
    }
  }
  // Handle tooltip data

  getTooltipData() {
    const system = this.system;

    return {
      name: this.name,
      difficulty: system.difficulty,
      cost: system.cost,
      perRound: system.perRound,
      actionCost: system.actionCost,
      range: system.range,
      description: system.description,
      penetration: system.penetration,
      //damage types
      dmgType1: system.dmgType1,
      dmgType2: system.dmgType2,
      dmgType3: system.dmgType3,
      dmgType4: system.dmgType4,
      bool2: system.bool2,
      bool3: system.bool3,
      bool4: system.bool4,
      //effect types
      effectType1: system.effectType1,
      effectType2: system.effectType2,
      effectType3: system.effectType3,
      //effect chances
      effects: system.effects,
    };
  }
}
