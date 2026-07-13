export const RHYTHMS = Object.freeze({
  executioner: { key: "executioner", guardedMultiplier: 0.25, exposedMultiplier: 2 },
  dragon: { key: "dragon", flyingMultiplier: 0.3, flyingActions: 2, overheatedMultiplier: 1.6, overheatedActions: 2 },
  crystal: { key: "crystal", repeatMultiplier: 0.2, exposedMultiplier: 1.5, requiredCategories: 3, fallbackRepeats: 3 },
});

export function rhythmFor(enemy) {
  return Object.values(RHYTHMS).find(item => item.key === enemy?.combatRhythm) || null;
}

export function initializeRhythm(enemy, override = {}) {
  const rhythm = rhythmFor(enemy);
  if (!rhythm) return { ...enemy };
  if (rhythm.key === "executioner") return { ...enemy, rhythmState: { phase: "armored", parryReady: false, ...override } };
  if (rhythm.key === "dragon") return { ...enemy, rhythmState: { phase: "flying", actionsLeft: 2, ...override } };
  return { ...enemy, rhythmState: { phase: "barrier", lastCategory: null, categories: [], repeatCount: 0, ...override } };
}

export function previewPlayerAction(enemy, category) {
  const rhythm = rhythmFor(enemy);
  const state = enemy?.rhythmState;
  if (!rhythm || !state) return { multiplier: 1, effective: true };
  if (rhythm.key === "executioner") return { multiplier: state.phase === "exposed" ? 2 : category === "attack" || category === "skill" || category === "status" ? 0.25 : 1, effective: category === "defend" || state.phase === "exposed" };
  if (rhythm.key === "dragon") return { multiplier: state.phase === "overheated" ? 1.6 : state.phase === "flying" && ["attack", "skill"].includes(category) ? 0.3 : 1, effective: state.phase !== "flying" || !["attack", "skill"].includes(category) };
  const repeat = state.phase === "barrier" && state.lastCategory === category;
  return { multiplier: state.phase === "exposed" ? 1.5 : repeat ? 0.2 : 1, effective: !repeat };
}

export function resolvePlayerRhythmAction(enemy, category) {
  const rhythm = rhythmFor(enemy);
  if (!rhythm || !enemy?.rhythmState) return { enemy: { ...enemy }, events: [] };
  const next = { ...enemy, rhythmState: { ...enemy.rhythmState } };
  const state = next.rhythmState;
  const events = [];
  if (rhythm.key === "executioner") {
    if (state.phase === "exposed") { state.phase = "armored"; events.push({ type: "armor-restored" }); }
    else if (category === "defend") { state.parryReady = true; events.push({ type: "parry-ready" }); }
  } else if (rhythm.key === "dragon") {
    if (state.phase === "flying") {
      state.actionsLeft = Math.max(0, state.actionsLeft - 1);
      if (state.actionsLeft === 0) { state.phase = "breath"; next.intent = "heavy"; events.push({ type: "breath-ready" }); }
    } else if (state.phase === "overheated") {
      state.actionsLeft = Math.max(0, state.actionsLeft - 1);
      if (state.actionsLeft === 0) { state.phase = "flying"; state.actionsLeft = rhythm.flyingActions; events.push({ type: "flying" }); }
    }
  } else if (state.phase === "exposed") {
    state.phase = "barrier"; state.lastCategory = category; state.categories = [category]; state.repeatCount = 0;
    events.push({ type: "barrier-restored" });
  } else {
    const repeated = state.lastCategory === category;
    state.repeatCount = repeated ? state.repeatCount + 1 : 0;
    state.lastCategory = category;
    state.categories = repeated ? state.categories : [...new Set([...state.categories, category])];
    if (state.categories.length >= rhythm.requiredCategories || state.repeatCount >= rhythm.fallbackRepeats) {
      state.phase = "exposed"; state.categories = []; state.repeatCount = 0;
      events.push({ type: "barrier-broken", fallback: repeated });
    }
  }
  return { enemy: next, events };
}

export function resolveEnemyRhythmAction(enemy, { intent, defended, ccInterrupted = false }) {
  const rhythm = rhythmFor(enemy);
  if (!rhythm || !enemy?.rhythmState) return { enemy: { ...enemy }, events: [] };
  const next = { ...enemy, rhythmState: { ...enemy.rhythmState } };
  const state = next.rhythmState;
  const events = [];
  if (rhythm.key === "executioner" && intent === "heavy") {
    if ((defended && state.parryReady) || ccInterrupted) {
      state.phase = "exposed"; state.parryReady = false;
      events.push({ type: "armor-broken", method: ccInterrupted ? "cc" : "parry" });
    }
  }
  if (rhythm.key === "dragon" && intent === "heavy" && state.phase === "breath") {
    state.phase = "overheated"; state.actionsLeft = rhythm.overheatedActions;
    events.push({ type: "overheated" });
  }
  return { enemy: next, events };
}
