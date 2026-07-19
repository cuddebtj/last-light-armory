import { bungieUrl } from "./bungie";

describe("bungieUrl", () => {
  it("prefixes paths with the bungie.net origin", () => {
    expect(bungieUrl("/common/destiny2_content/icons/abc.png")).toBe(
      "https://www.bungie.net/common/destiny2_content/icons/abc.png",
    );
  });
});
