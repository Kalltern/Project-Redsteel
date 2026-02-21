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
    stacking: "stack",
    maxStacks: 6,
    triggers: {
      onApply: {
        formula: "1d4",
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
};
