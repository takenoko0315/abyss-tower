import { describe, expect, it } from "vitest";
import { pickUnownedRelic } from "./utils.js";

describe("pickUnownedRelic", () => {
  const relics = [{ key: "owned" }, { key: "first" }, { key: "last" }];

  it("draws only from relics the player does not own", () => {
    expect(pickUnownedRelic(relics, ["owned"], () => 0)).toEqual({ key: "first" });
    expect(pickUnownedRelic(relics, ["owned"], () => 0.99)).toEqual({ key: "last" });
  });

  it("returns undefined when every relic is already owned", () => {
    expect(pickUnownedRelic(relics, relics.map(relic => relic.key), () => 0)).toBeUndefined();
  });
});
