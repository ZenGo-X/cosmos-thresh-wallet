// Cosmos-thresh-wallet
//
// Copyright 2020 by Kzen Networks (kzencorp.com)
// Cosmos-threash-wallet is free software: you can redistribute
// it and/or modify it under the terms of the GNU General Public
// License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.

import BN from "bignumber.js";

/* math */
export const plus = (a: BN.Value, b: BN.Value): string =>
  new BN(a || 0).plus(b || 0).toString();

export const minus = (a: BN.Value, b: BN.Value): string =>
  new BN(a || 0).minus(b || 0).toString();

export const times = (a: BN.Value, b: BN.Value): string =>
  new BN(a || 0).times(b || 0).toString();

export const div = (a: BN.Value, b: BN.Value): string =>
  new BN(a || 0).div(b || 1).toString();

export const sum = (array: BN.Value[]): string =>
  BN.sum.apply(null, array.filter(isFinite)).toString();

export const min = (array: BN.Value[]): string =>
  BN.min.apply(null, array.filter(isFinite)).toString();

export const ceil = (n: BN.Value): string =>
  new BN(n).integerValue(BN.ROUND_CEIL).toString();

export const floor = (n: BN.Value): string =>
  new BN(n).integerValue(BN.ROUND_FLOOR).toString();

/* format */
export const percent = (n: BN.Value, f: number = 2): string =>
  new BN(times(n, 100)).toFixed(f) + "%";

export const toNumber = (n: BN.Value): number => new BN(n).toNumber();

/* boolean */
export const gt = (a: BN.Value, b: BN.Value): boolean => new BN(a).gt(b);
export const lt = (a: BN.Value, b: BN.Value): boolean => new BN(a).lt(b);
export const gte = (a: BN.Value, b: BN.Value): boolean => new BN(a).gte(b);
export const lte = (a: BN.Value, b: BN.Value): boolean => new BN(a).lte(b);

export const isFinite = (n: BN.Value): boolean => new BN(n).isFinite();
export const isInteger = (n: BN.Value): boolean => new BN(n).isInteger();
