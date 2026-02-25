export async function statusEffectManager() {
  const STATUS_EFFECTS = Object.entries(CONFIG.TOS.effectDefinitions)
    .map(([id, def]) => ({
      id,
      name: def.name,
      icon: def.img,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  function getSelectedActors() {
    const tokens = canvas.tokens.controlled;

    if (!tokens.length) {
      ui.notifications.warn("Select at least one token.");
      return [];
    }

    return [...new Set(tokens.map((t) => t.actor).filter(Boolean))];
  }

  function getEffect(actor, effectId) {
    return actor.effects.find((e) => e.statuses?.has(effectId));
  }

  async function applyEffectToAll(effectId) {
    const actors = getSelectedActors();
    if (!actors.length) return;

    await Promise.all(
      actors.map((actor) => game.tos.applyEffect(actor, effectId)),
    );
  }

  async function removeEffectFromAll(effectId) {
    const actors = getSelectedActors();
    if (!actors.length) return;

    await Promise.all(
      actors.map(async (actor) => {
        const existing = getEffect(actor, effectId);
        if (existing) await existing.delete();
      }),
    );
  }

  async function removeAllEffects() {
    const actors = getSelectedActors();
    if (!actors.length) return;

    await Promise.all(
      actors.map(async (actor) => {
        const tosEffects = actor.effects.filter((e) =>
          e.getFlag("core", "statusId"),
        );

        for (const effect of [...tosEffects]) {
          await effect.delete();
        }
      }),
    );

    ui.notifications.info("All status effects removed.");
  }

  /* ---------------- UI BUILD ---------------- */

  let content = `
<style>
.tos-status-wrapper {
  display:flex;
  flex-direction:column;
  gap:6px;
}

.tos-scroll {
  max-height:400px;
  overflow-y:auto;
  padding-right:4px;
}

.tos-row {
  display:flex;
  justify-content:space-between;
  align-items:center;
  font-size:13px;
  padding:4px 0;
}

.tos-effect-info {
  display:flex;
  align-items:center;
  gap:6px;
}

.tos-effect-icon {
  width:18px;
  height:18px;
  object-fit:contain;
}

.tos-effect-name {
  transition:0.15s;
}

.tos-row.hovering .tos-effect-name {
  color:#ff4d4d;
  text-shadow:0 0 6px red;
}

.tos-actions span {
  cursor:pointer;
  margin-left:6px;
  transition:0.15s;
}

.tos-actions span:hover {
  color:#ff4d4d;
}
</style>

<div class="tos-status-wrapper">
  <button data-action="removeAll" style="background:#5a1d1d;color:white;">
    🗑 Remove All Status Effects
  </button>
  <hr/>
  <div class="tos-scroll">
`;

  for (const effect of STATUS_EFFECTS) {
    content += `
<div class="tos-row" data-effect-row="${effect.id}">
  <div class="tos-effect-info">
    <img src="${effect.icon}" class="tos-effect-icon"/>
    <span class="tos-effect-name">${effect.name}</span>
  </div>
  <div class="tos-actions">
        <span data-apply="${effect.id}">APPLY</span> |
        <span data-remove="${effect.id}">REMOVE</span>
      </div>
    </div>
  `;
  }

  content += `
  </div>
</div>
`;

  new Dialog({
    title: "Status Effects",
    content,
    buttons: {},
    render: (html) => {
      const root = html[0];

      root
        .querySelector('[data-action="removeAll"]')
        .addEventListener("click", async () => {
          await removeAllEffects();
        });

      root.querySelectorAll("[data-apply]").forEach((el) => {
        el.addEventListener("click", async (e) => {
          const effectId = e.currentTarget.dataset.apply;
          await applyEffectToAll(effectId);
        });
      });

      root.querySelectorAll("[data-remove]").forEach((el) => {
        el.addEventListener("click", async (e) => {
          const effectId = e.currentTarget.dataset.remove;
          await removeEffectFromAll(effectId);
        });
      });
      root.querySelectorAll(".tos-row").forEach((row) => {
        const apply = row.querySelector("[data-apply]");
        const remove = row.querySelector("[data-remove]");

        const addHover = () => row.classList.add("hovering");
        const removeHover = () => row.classList.remove("hovering");

        if (apply) {
          apply.addEventListener("mouseenter", addHover);
          apply.addEventListener("mouseleave", removeHover);
        }

        if (remove) {
          remove.addEventListener("mouseenter", addHover);
          remove.addEventListener("mouseleave", removeHover);
        }
      });
    },
  }).render(true);
}
