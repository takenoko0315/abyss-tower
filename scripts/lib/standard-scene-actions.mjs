// balance-bot / combat-decision-bot共通:戦闘画面(combat)以外のシーンでの選択ロジック。
// どちらのボットも「何を計測したいか」は戦闘中の判断に限られ、クラス選択・分岐路・戦利品などは
// 従来のbalance-bot標準方針(祝福/クラス/難易度はCLI指定があれば固定、それ以外はランダム)を流用する。
import { chance, clickByText, clickRandom } from "./dom-actions.mjs";

/**
 * @param {object} opts
 * @param {string|null} opts.classFilter - assassin/warrior/vampire/mage を固定する場合のキー
 * @param {Record<string,string>} opts.classLabel - クラスキー→表示名
 * @param {string} opts.diffName - 難易度の表示名(例: "ノーマル")
 * @param {string|null} opts.blessingFilter - 祝福/契約キーを固定する場合("none"で契約回避)
 * @param {Record<string,string>} opts.blessingName - 祝福キー→表示名
 * @param {Set<string>} opts.keystoneKeys - 契約(キーストーン)のキー集合
 * @returns {boolean|null} クリックできれば true、そのシーンを未対応として扱うなら null
 */
export function nonCombatAction(container, d, opts) {
  const { scene, player, stats } = d;
  const { classFilter, classLabel, diffName, blessingFilter, blessingName, keystoneKeys } = opts;
  switch (scene) {
    case "title": return clickByText(container, "挑戦する");
    case "classSelect":
      if (classFilter) return clickByText(container, classLabel[classFilter]) || clickRandom(container, ["戻る"]);
      return clickRandom(container, ["戻る"]);
    case "variantSelect": return clickRandom(container, ["クラス選択に戻る"]);
    case "diffSelect": return clickByText(container, diffName) || clickRandom(container, ["クラス選択に戻る"]);
    case "blessing": {
      const choices = d.blessingChoices || [];
      if (blessingFilter === "none") {
        // 契約(キーストーン)を避け、通常祝福からランダムに選ぶ(基準計測用)
        const nonKs = choices.filter(k => !keystoneKeys.has(k));
        const k = nonKs.length ? nonKs[Math.floor(Math.random() * nonKs.length)] : choices[Math.floor(Math.random() * choices.length)];
        return clickByText(container, blessingName[k]);
      }
      if (blessingFilter) {
        // 指定した契約が選択肢になければfalseを返す(呼び出し側でリロール扱い)
        if (!choices.includes(blessingFilter)) return false;
        return clickByText(container, blessingName[blessingFilter]);
      }
      return clickRandom(container);
    }
    case "origin": return clickRandom(container);
    case "zoneSelect": return clickRandom(container);
    case "levelup": return clickRandom(container);
    case "loot": {
      const { drop } = d;
      if (drop?.identified === false) {
        if (chance(0.5)) return clickByText(container, "賭けて装備");
        return clickByText(container, "鑑定する") || clickByText(container, "捨てて進む");
      }
      if (chance(0.7)) return clickByText(container, "装備する");
      return clickByText(container, "捨てて進む");
    }
    case "forge": return clickByText(container, "店を出て進む");
    case "shop": return clickByText(container, "店を出て進む");
    case "relicChoice": return clickRandom(container);
    case "relicSwap": return clickRandom(container);
    case "dojo": return clickRandom(container);
    case "eventChoice": return clickRandom(container);
    case "path": {
      const hpPct = player.hp / stats.maxHp;
      if (hpPct < 0.5 && clickByText(container, "焚き火")) return true;
      return clickRandom(container, ["ステータス", "スキルツリー"]);
    }
    default: return null;
  }
}
