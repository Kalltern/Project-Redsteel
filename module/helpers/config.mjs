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
    id: "stun",
    name: "EFFECT.StatusStunned",
    img: "icons/svg/daze.svg",
    statuses: ["stun"],
  },
  {
    id: "burn",
    name: "Burning",
    img: "icons/magic/fire/flame-burning-embers-yellow.webp",
    statuses: ["burn"],
  },
];

TOS.effectDefinitions = {
  stun: {
    name: "Stunned",
    img: "icons/svg/daze.svg",
    statuses: ["stun"],
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
    img: "icons/svg/blood.svg",
    statuses: ["bleed"],
    stacking: "refresh",
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
    img: "icons/magic/fire/flame-burning-embers-yellow.webp",
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
    img: "icons/svg/daze.svg",
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
    img: "icons/svg/daze.svg",
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
    img: "icons/svg/daze.svg",
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
    img: "icons/svg/daze.svg",
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
    img: "icons/svg/daze.svg",
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
    img: "icons/svg/daze.svg",
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
    img: "icons/svg/daze.svg",
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
    img: "icons/svg/daze.svg",
    statuses: ["corrosion"],
    stacking: "stack",
    scaleWithStacks: true,
    changes: [
      {
        key: "system.armor.natural.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -4,
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
    img: "icons/svg/daze.svg",
    statuses: ["fear"],
    changes: [
      {
        key: "system.armor.natural.bonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -4,
      },
    ],
  },
  heavy_stun: {
    name: "Heavy stun",
    img: "icons/svg/daze.svg",
    statuses: ["heavy_stun"],
    defaultTurns: 2,
    changes: [
      {
        key: "system.globalBonus",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -25,
      },
    ],
  },
};
