// balance-bot / combat-decision-bot共通のDOM操作ヘルパー。
// ボタン文言(textContent)で対象を探して fireEvent.click する。画面判定自体は
// window.__abyssDebug の生の状態を見て行い、ここはクリック実行だけを担当する。
import { fireEvent } from "@testing-library/react";

export const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;

export function allButtons(container) {
  return Array.from(container.querySelectorAll("button"));
}

export function clickByText(container, text) {
  const btn = allButtons(container).find(b => !b.disabled && b.textContent.includes(text));
  if (!btn) return false;
  fireEvent.click(btn);
  return true;
}

export function clickRandom(container, excludeTexts = []) {
  const btns = allButtons(container).filter(b => !b.disabled && !excludeTexts.some(t => b.textContent.includes(t)));
  if (!btns.length) return false;
  fireEvent.click(rand(btns));
  return true;
}
