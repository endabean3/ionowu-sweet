import { describe, expect, it } from "vitest";
import { takaranRacikan } from "./recipe";

describe("takaranRacikan — 65% bibit : 35% pelarut", () => {
  const t = takaranRacikan(65);

  it.each([
    [10, "6.5", "3.5"],
    [15, "9.8", "5.2"], // 9,75 dibulatkan ke atas; pelarut = sisanya
    [20, "13", "7"],
    [30, "19.5", "10.5"],
    [50, "32.5", "17.5"],
    [100, "65", "35"],
  ])("botol %i ml → bibit %s + pelarut %s", (botol, bibit, pelarut) => {
    expect(t.find((x) => x.botol === botol)).toEqual({ botol, bibit, pelarut });
  });

  it("bibit + pelarut selalu tepat satu botol", () => {
    for (const x of t) expect(Number(x.bibit) + Number(x.pelarut)).toBeCloseTo(x.botol, 10);
  });

  it("racikan mati atau tidak sah → kosong", () => {
    for (const p of [0, null, undefined, -5, 101, 65.5]) expect(takaranRacikan(p)).toEqual([]);
  });
});
