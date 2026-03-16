export class HelpOverlay {
  static toggle() {
    const existing = document.getElementById("tos-help-overlay");
    if (existing) existing.remove();
    else this.render();
  }

  static render() {
    const overlay = document.createElement("div");
    overlay.id = "tos-help-overlay";

    const grouped = {};
    const CATEGORY_ORDER = ["movement", "combat", "magic", "other"];

    // Group actions
    for (const action of HELP_ACTIONS) {
      if (!grouped[action.type]) grouped[action.type] = [];
      grouped[action.type].push(action);
    }

    // Build rows
    const rows = CATEGORY_ORDER.filter((type) => grouped[type])
      .map((type) => {
        const actions = grouped[type];

        const labelType = game.i18n.localize(`TOS.Help.Category.${type}`);

        const cards = actions
          .map((action) => {
            const labelName = game.i18n.localize(
              `TOS.Help.Action.${action.name}`,
            );
            const labelCost = game.i18n.localize(
              `TOS.Help.Cost.${action.cost}`,
            );
            const labelDescription = game.i18n.localize(
              `TOS.Help.Description.${action.description}`,
            );

            return `
              <div class="help-card">

                <div class="card-header">
                  <h3>${labelName}</h3>
                </div>

                <div class="card-meta">
                  <span><b>Cena:</b> ${labelCost}</span>
                </div>

                <div class="card-body">
                  ${labelDescription}
                </div>

              </div>
            `;
          })
          .join("");

        return `
          <div class="help-category">

            <h2 class="category-title">${labelType}</h2>

            <div class="category-row">
              ${cards}
            </div>

          </div>
        `;
      })
      .join("");

    overlay.innerHTML = `
      <div class="help-board">
        ${rows}
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });

    const escHandler = (e) => {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", escHandler);
      }
    };

    document.addEventListener("keydown", escHandler);
  }
}

const HELP_ACTIONS = [
  {
    name: "move",
    cost: "oneAction",
    type: "movement",
    description: "move",
  },
  {
    name: "sprint",
    cost: "twoActions",
    type: "movement",
    description: "sprint",
  },
  {
    name: "slowMove",
    cost: "oneAction",
    type: "movement",
    description: "slowMove",
  },
  {
    name: "disengage",
    cost: "twoActions",
    type: "movement",
    description: "disengage",
  },

  {
    name: "aim",
    cost: "oneAction",
    type: "combat",
    description: "aim",
  },
  {
    name: "improvedAim",
    cost: "oneAction",
    type: "combat",
    description: "improvedAim",
  },
  {
    name: "attack",
    cost: "oneAction",
    type: "combat",
    description: "attack",
  },
  {
    name: "sneakAttack",
    cost: "freeAction",
    type: "combat",
    description: "sneakAttack",
  },
  {
    name: "multiAttack",
    cost: "twoActions",
    type: "combat",
    description: "multiAttack",
  },
  {
    name: "opportunityAttack",
    cost: "reaction",
    type: "combat",
    description: "opportunityAttack",
  },

  {
    name: "action",
    cost: "oneAction",
    type: "other",
    description: "action",
  },

  {
    name: "dodge",
    cost: "freeAction",
    type: "combat",
    description: "dodge",
  },

  {
    name: "rest",
    cost: "oneAction",
    type: "other",
    description: "rest",
  },
  {
    name: "reload",
    cost: "reload",
    type: "other",
    description: "reload",
  },

  {
    name: "castSpell",
    cost: "variable",
    type: "magic",
    description: "castSpell",
  },
  {
    name: "reactionSpell",
    cost: "reaction",
    type: "magic",
    description: "reactionSpell",
  },
  {
    name: "focus",
    cost: "oneAction",
    type: "magic",
    description: "focus",
  },
];
