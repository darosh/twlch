import { expect, test } from "vite-plus/test";
import { pchip } from "../src/index.ts";

test("pchip passes through the samples", () => {
  const y = [0.97, 0.94, 0.89, 0.8, 0.7, 0.62, 0.55];
  const f = pchip(y);
  y.forEach((v, i) => expect(f(i)).toBeCloseTo(v, 12));
});

test("pchip never overshoots monotone data", () => {
  const y = [0, 0, 1, 1, 5, 5.1];
  const f = pchip(y);
  for (let t = 0; t <= y.length - 1; t += 0.05) {
    const v = f(t);
    expect(v).toBeGreaterThanOrEqual(-1e-12);
    expect(v).toBeLessThanOrEqual(5.1 + 1e-12);
  }
});

test("pchip keeps a peak at its data point", () => {
  const f = pchip([0.1, 0.2, 0.3, 0.2, 0.1]);
  for (let t = 0; t <= 4; t += 0.02) expect(f(t)).toBeLessThanOrEqual(0.3 + 1e-12);
});

test("pchip clamps outside the range", () => {
  const f = pchip([1, 2, 3]);
  expect(f(-5)).toBe(1);
  expect(f(9)).toBe(3);
});
