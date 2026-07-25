// Nulls always sort last, in either direction (a value can genuinely be
// absent — a weapon's RPM, a roll's score). Direction must be applied
// inside the comparator, not by reversing the sorted array afterward, or
// "last in ascending" becomes "first in descending" for the null case.
export function compareNullableNumber(
  a: number | null,
  b: number | null,
  sign: number,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return sign * (a - b);
}
