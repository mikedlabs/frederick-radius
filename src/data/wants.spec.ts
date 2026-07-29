import { describe, expect, it } from "vitest";
import { WANTS } from "./wants";

describe("Today want destinations", () => {
  it("opens playgrounds on the complete near-me amenity map", () => {
    const outdoors = WANTS.find((want) => want.key === "outdoors");
    const playgrounds = outdoors?.subs.find(
      (sub) => sub.label === "Playgrounds",
    );

    expect(playgrounds?.href).toBe(
      "/map?intent=outside&sub=playgrounds&amenity=play&in=nearme",
    );
  });

  it("makes auto care reachable from the practical get-around path", () => {
    const around = WANTS.find((want) => want.key === "around");
    const autoCare = around?.subs.find((sub) => sub.label === "Auto care");

    expect(autoCare?.href).toBe("/category/auto-care");
  });
});
