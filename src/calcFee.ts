// Cosmos-thresh-wallet
//
// Copyright 2020 by Kzen Networks (kzencorp.com)
// Cosmos-threash-wallet is free software: you can redistribute
// it and/or modify it under the terms of the GNU General Public
// License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.

import { times, div, ceil, floor } from './math'

export const GAS_PRICE = '0.025';
export const calcFee = (gas: string): string => ceil(times(gas, GAS_PRICE));
export const calcGas = (fee: string): string => floor(div(fee, GAS_PRICE));
