export async function statusEffectManager() {
  const STATUS_EFFECTS = Object.entries(CONFIG.TOS.effectDefinitions)
    .map(([id, def]) => ({ id, name: def.name }))
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
  padding:2px 0;
}
.tos-actions span {
  cursor:pointer;
  margin-left:6px;
  transition:0.15s;
}
.tos-actions span:hover {
  color:#ff4d4d;
  text-shadow:0 0 6px red;
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
    <div class="tos-row">
      <div>${effect.name}</div>
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
    },
  }).render(true);
}
