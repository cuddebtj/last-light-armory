import { compareNullableNumber } from "./sort";

describe("compareNullableNumber", () => {
  it("covers every null combination directly, since Array.sort's own comparison pattern isn't guaranteed to exercise all four", () => {
    expect(compareNullableNumber(null, null, 1)).toBe(0);
    expect(compareNullableNumber(null, 5, 1)).toBe(1); // a null -> sorts after
    expect(compareNullableNumber(5, null, 1)).toBe(-1); // b null -> sorts after
    expect(compareNullableNumber(10, 5, 1)).toBe(5); // ascending
    expect(compareNullableNumber(10, 5, -1)).toBe(-5); // descending
  });
});
