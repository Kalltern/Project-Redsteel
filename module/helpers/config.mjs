export const TOS = {};

/**
 * The set of Attribute Scores used within the system.
 * @type {Object}
 */
TOS.attributes = {
  str: "TOS.Actor.Character.Attribute.Str.long",
  dex: "TOS.Actor.Character.Attribute.Dex.long",
  end: "TOS.Actor.Character.Attribute.End.long",
  int: "TOS.Actor.Character.Attribute.Int.long",
  wil: "TOS.Actor.Character.Attribute.Wil.long",
  cha: "TOS.Actor.Character.Attribute.Cha.long",
  per: "TOS.Actor.Character.Attribute.Per.long",
};

TOS.attributeAbbreviations = {
  str: "TOS.Actor.Character.Attribute.Str.abbr",
  dex: "TOS.Actor.Character.Attribute.Dex.abbr",
  end: "TOS.Actor.Character.Attribute.End.abbr",
  int: "TOS.Actor.Character.Attribute.Int.abbr",
  wil: "TOS.Actor.Character.Attribute.Wil.abbr",
  cha: "TOS.Actor.Character.Attribute.Cha.abbr",
  per: "TOS.Actor.Character.Attribute.Per.abbr",
};

TOS.secondaryAttributes = {
  spd: "TOS.Actor.Character.SecondaryAttribute.Spd.long",
  lck: "TOS.Actor.Character.SecondaryAttribute.Lck.long",
  res: "TOS.Actor.Character.SecondaryAttribute.Res.long",
  fth: "TOS.Actor.Character.SecondaryAttribute.Fth.long",
  sin: "TOS.Actor.Character.SecondaryAttribute.Sin.long",
  vis: "TOS.Actor.Character.SecondaryAttribute.Vis.long",
  ini: "TOS.Actor.Character.SecondaryAttribute.Ini.long",
};

TOS.secondaryAttributeAbbreviations = {
  spd: "TOS.Actor.Character.SecondaryAttribute.Spd.abbr",
  lck: "TOS.Actor.Character.SecondaryAttribute.Lck.abbr",
  res: "TOS.Actor.Character.SecondaryAttribute.Res.abbr",
  fth: "TOS.Actor.Character.SecondaryAttribute.Fth.abbr",
  sin: "TOS.Actor.Character.SecondaryAttribute.Sin.abbr",
  vis: "TOS.Actor.Character.SecondaryAttribute.Vis.abbr",
  ini: "TOS.Actor.Character.SecondaryAttribute.Ini.abbr",
};

TOS.statusEffects = [
  {
    id: "dead",
    name: "EFFECT.StatusDead",
    img: "icons/svg/skull.svg",
  },
  {
    id: "prone",
    name: "EFFECT.StatusProne",
    img: "icons/svg/falling.svg",
  },
  {
    id: "bleed",
    name: "Bleeding",
    img: "icons/svg/blood.svg",
    statuses: ["bleed"],
  },
  {
    id: "stagger",
    name: "EFFECT.StatusStaggered",
    img: "icons/svg/daze.svg",
    statuses: ["stagger"],
  },
  {
    id: "burn",
    name: "Burning",
    img: "icons/magic/fire/flame-burning-embers-yellow.webp",
    statuses: ["burn"],
  },
  {
    id: "channeling",
    name: "Channeling",
    img: "icons/magic/lightning/orb-ball-spiral-blue.webp",
  },
];

TOS.effectDefinitions = {
  stagger: {
    name: "Staggered",
    img: "icons/svg/daze.svg",
    statuses: ["stagger"],
    defaultTurns: 1,
    changes: [
      {
        key: "system.globalBonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -10,
      },
    ],
  },

  bleed: {
    name: "Bleeding",
    img: "icons/skills/wounds/blood-drip-droplet-red.webp",
    statuses: ["bleed"],
    maxStacks: 6,
    triggers: {
      onApply: {
        formula: "{appliedStacks}d4",
        target: "system.stats.health.value",
      },
      onRoundStart: {
        formula: "{stacks}d4",
        target: "system.stats.health.value",
      },
    },
  },
  burn: {
    name: "Burning",
    img: "icons/magic/fire/flame-burning-campfire-rocks.webp",
    statuses: ["burn"],
    triggers: {
      onApply: {
        formula: "3d6",
        target: "system.stats.health.value",
        panic: true,
      },
      onRoundStart: {
        formula: "3d6",
        target: "system.stats.health.value",
        panic: true,
      },
    },
  },

  panic: {
    name: "Panicked",
    img: "icons/magic/control/fear-fright-white.webp",
    statuses: ["panic"],
    defaultTurns: 2,
    changes: [
      {
        key: "system.globalMod",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -10,
      },
    ],
  },
  wet: {
    name: "Wet",
    img: "icons/magic/water/water-drop-swirl-blue.webp",
    statuses: ["wet"],
    changes: [
      {
        key: "system.effectMods.slow.applyChance",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 40,
      },
      {
        key: "system.effectMods.freeze.applyChance",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 25,
      },
      {
        key: "system.effectMods.burn.applyChance",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -40,
      },
      {
        key: "system.effectMods.chain.applyChance",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 35,
      },
    ],
  },
  // needs upgrade for suffocation and the existence of a ice block health
  freeze: {
    name: "Freeze",
    img: "icons/magic/water/barrier-ice-crystal-wall-faceted.webp",
    statuses: ["freeze"],
    triggers: {
      onApply: {
        formula: "4d6",
        target: "system.stats.health.value",
      },
      onRoundStart: {
        formula: "4d6",
        target: "system.stats.health.value",
      },
    },
    changes: [
      {
        key: "system.effectMods.slow.applyChance",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 40,
      },
      {
        key: "system.effectMods.freeze.applyChance",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 25,
      },
      {
        key: "system.effectMods.burn.applyChance",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -40,
      },
      {
        key: "system.effectMods.chain.applyChance",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 35,
      },
    ],
  },
  slow: {
    name: "Slow",
    img: "icons/magic/movement/chevrons-down-yellow.webp",
    statuses: ["slow"],
    defaultTurns: 3,
    changes: [
      {
        key: "system.secondaryAttributes.spd.total",
        mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY,
        value: 0.5,
      },
      {
        key: "system.combatSkills.throwing.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -5,
      },
      {
        key: "system.combatSkills.meleeDefense.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -5,
      },
      {
        key: "system.combatSkills.rangedDefense.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -5,
      },
      {
        key: "system.combatSkills.dodge.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -30,
      },
      {
        key: "system.combatSkills.combat.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -5,
      },
      {
        key: "system.combatSkills.archery.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -5,
      },
    ],
  },
  root: {
    name: "Root",
    img: "icons/magic/nature/root-vine-entwined-thorns.webp",
    statuses: ["root"],
    defaultTurns: 3,
    changes: [
      {
        key: "system.secondaryAttributes.spd.total",
        mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY,
        value: 0.5,
      },
      {
        key: "system.combatSkills.meleeDefense.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -15,
      },
      {
        key: "system.combatSkills.rangedDefense.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -15,
      },
      {
        key: "system.combatSkills.dodge.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -15,
      },
      {
        key: "system.combatSkills.combat.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -15,
      },
    ],
  },
  shadowbound: {
    name: "Shadowbound",
    img: "icons/magic/control/debuff-chains-purple.webp",
    statuses: ["shadowbound"],
    triggers: {
      onApply: {
        formula: "2d6",
        target: "system.stats.health.value",
      },
      onRoundStart: {
        formula: "2d6",
        target: "system.stats.health.value",
      },
    },
    changes: [
      {
        key: "system.combatSkills.meleeDefense.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -15,
      },
      {
        key: "system.combatSkills.rangedDefense.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -15,
      },
      {
        key: "system.combatSkills.dodge.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -15,
      },
      {
        key: "system.combatSkills.combat.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -15,
      },
    ],
  },
  poison: {
    name: "Poison",
    img: "icons/magic/acid/dissolve-drip-droplet-smoke.webp",
    statuses: ["poison"],
    defaultTurns: 3,
    triggers: {
      onApply: {
        formula: "2d6",
        target: "system.stats.health.value",
      },
      onRoundStart: {
        formula: "2d6",
        target: "system.stats.health.value",
      },
    },
    changes: [
      {
        key: "system.globalBonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -5,
      },
    ],
  },
  corrosion: {
    name: "Corrosion",
    img: "icons/skills/melee/shield-damaged-broken-gold.webp",
    statuses: ["corrosion"],
    maxStacks: 99,
    changes: [
      {
        key: "system.armor.natural.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 0,
      },
    ],
  },
  soul_mark: {
    name: "Soul Mark",
    img: "icons/svg/daze.svg",
    statuses: ["soul_mark"],
  },
  fear: {
    name: "Fear",
    img: "icons/magic/death/undead-ghost-scream-teal.webp",
    statuses: ["fear"],
    defaultRounds: 3,
    maxStacks: 99,
    triggers: {
      onApply: {
        custom: "fearTest",
      },
      onRoundStart: {
        custom: "fearRound",
      },
    },
    changes: [
      {
        key: "system.armor.natural.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -4,
      },
    ],
  },
  stun: {
    name: "Stun",
    img: "icons/magic/movement/abstract-ribbons-red-orange.webp",
    statuses: ["stun"],
    defaultTurns: 2,
    changes: [
      {
        key: "system.globalBonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -25,
      },
    ],
  },
  resist_acid: {
    name: "Resist Acid",
    img: "icons/magic/acid/projectile-bubble.webp",
    statuses: ["resist_acid"],
    changes: [
      {
        key: "system.armor.acid.resistance",
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: true,
      },
    ],
  },

  resist_fire: {
    name: "Resist Fire",
    img: "icons/magic/fire/flame-burning-embers-yellow.webp",
    statuses: ["resist_fire"],
    changes: [
      {
        key: "system.armor.fire.resistance",
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: true,
      },
    ],
  },

  resist_frost: {
    name: "Resist Frost",
    img: "icons/magic/water/snowflake-ice-blue.webp",
    statuses: ["resist_frost"],
    changes: [
      {
        key: "system.armor.frost.resistance",
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: true,
      },
    ],
  },

  resist_lightning: {
    name: "Resist Lightning",
    img: "icons/magic/lightning/bolt-strike-blue.webp",
    statuses: ["resist_lightning"],
    changes: [
      {
        key: "system.armor.lightning.resistance",
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: true,
      },
    ],
  },

  resist_magic: {
    name: "Resist Magic",
    img: "icons/magic/symbols/runes-star-glow-purple.webp",
    statuses: ["resist_magic"],
    changes: [
      {
        key: "system.armor.magic.resistance",
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: true,
      },
    ],
  },

  resist_dark: {
    name: "Resist Dark",
    img: "icons/magic/death/skull-energy-purple.webp",
    statuses: ["resist_dark"],
    changes: [
      {
        key: "system.armor.dark.resistance",
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: true,
      },
    ],
  },

  ice_weapon: {
    name: "Ice Weapon",
    img: "icons/magic/water/snowflake-ice-blue.webp",
    statuses: ["ice_weapon"],

    combatModifiers: {
      exclusiveGroup: "weaponEnchant",

      damageBonus: 2,
      penetrationBonus: 1,

      damageTypeMode: "expand",
      damageTypes: ["magic", "frost"],

      extraEffects: {
        slow: 15,
      },
    },
  },
  lightning_weapon: {
    name: "Lightning Weapon",
    img: "icons/magic/fire/dagger-rune-enchant-flame-blue-yellow.webp",
    statuses: ["lightning_weapon"],

    combatModifiers: {
      exclusiveGroup: "weaponEnchant",
      penetrationBonus: 4,

      damageTypeMode: "expand",
      damageTypes: ["magic", "lightning"],

      extraEffects: {
        stagger: 10,
      },
    },
  },
  fire_weapon: {
    name: "Fire Weapon",
    img: "icons/magic/fire/dagger-rune-enchant-flame-orange.webp",
    statuses: ["fire_weapon"],

    combatModifiers: {
      exclusiveGroup: "weaponEnchant",

      damageBonus: 3,
      damageTypeMode: "expand",
      damageTypes: ["magic", "fire"],

      extraEffects: {
        burning: 5,
      },
    },
  },
  poisoned_weapon: {
    name: "Poisoned Weapon",
    img: "icons/magic/fire/dagger-rune-enchant-green.webp",
    statuses: ["poisoned_weapon"],

    combatModifiers: {
      exclusiveGroup: "weaponEnchant",

      damageTypeMode: "expand",
      damageTypes: ["poison"],

      extraEffects: {
        poison: 10,
      },
    },
  },
  acid_weapon: {
    name: "Acid Weapon",
    img: "icons/magic/fire/dagger-rune-enchant-flame-green.webp",
    statuses: ["acid_weapon"],

    combatModifiers: {
      exclusiveGroup: "weaponEnchant",

      damageBonus: 1,

      damageTypeMode: "expand",
      damageTypes: ["acid"],

      extraEffects: {
        corrosion: 35,
      },
    },
  },
  dark_weapon: {
    name: "Dark Weapon",
    img: "icons/magic/fire/dagger-rune-enchant-flame-purple.webp",
    statuses: ["dark_weapon"],

    combatModifiers: {
      exclusiveGroup: "weaponEnchant",

      damageBonus: 2,
      penetrationBonus: 2,

      damageTypeMode: "expand",
      damageTypes: ["magic", "dark"],
    },
  },
  whetstone: {
    name: "Whetstone",
    img: "icons/commodities/stone/paver-cobble-white.webp",
    statuses: ["whetstone"],

    combatModifiers: {
      exclusiveGroup: "weaponEnchant",
      extraEffects: {
        bleed: 10,
      },
    },
  },
  defensive_stance: {
    name: "Defensive stance",
    img: "icons/skills/melee/shield-block-gray-yellow.webp",
    statuses: ["defensive_stance"],
    triggers: {
      onRoundStart: {
        formula: "1",
        target: "system.stats.stamina.value",
      },
    },
    changes: [
      {
        key: "system.combatSkills.meleeDefense.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 20,
      },
      {
        key: "system.combatSkills.rangedDefense.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 10,
      },
    ],
  },

  guard: {
    name: "Guard",
    img: "icons/skills/melee/shield-block-gray-yellow.webp",
    statuses: ["guard"],
    defaultTurns: 1,
  },

  channeling: {
    name: "Channeling",
    img: "icons/magic/lightning/orb-ball-spiral-blue.webp",
    statuses: ["channeling"],

    triggers: {
      onRoundStart: {
        custom: "channelingDrain",
      },
    },
  },
};
