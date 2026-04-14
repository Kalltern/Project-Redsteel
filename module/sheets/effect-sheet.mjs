export function registerEffectSheetExtensions() {
  Hooks.on("renderActiveEffectConfig", (app, html) => {
    const durationTab = html.querySelector('.tab[data-tab="duration"]');
    if (!durationTab) return;

    const effect = app.document;
    const current = effect?.getFlag("redsteel", "actorTurns") ?? "";

    const field = `
      <div class="form-group">
        <label>Actor Turns</label>
        <div class="form-fields">
          <input type="number"
                 name="flags.redsteel.actorTurns"
                 value="${current}"
                 min="0"
                 step="1"/>
        </div>
      </div>
    `;

    durationTab.insertAdjacentHTML("beforeend", field);
  });
}
