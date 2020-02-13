// Cosmos-thresh-wallet
//
// Copyright 2020 by Kzen Networks (kzencorp.com)
// Cosmos-threash-wallet is free software: you can redistribute
// it and/or modify it under the terms of the GNU General Public
// License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.

import { get, ChainName } from './api';
import { Coin } from './Coin';
const info_debug = require('debug')('info_debug');

interface BondedTokensInfo {
  not_bonded_tokens: string;
  bonded_tokens: string;
}

interface StakingPoolInfo {
  height: string;
  result: BondedTokensInfo;
}

interface SupplyInfo {
  height: string;
  result: [Coin];
}

interface MintingInfo {
  height: string;
  result: string;
}

interface ValidatorInfo {
  heigh: string;
  result: ValidatorDetails;
}

interface ValidatorDetails {
  jailed: boolean;
  commission: CommissionInfo;
}

interface CommissionInfo {
  rate: string;
  max_rate: string;
  max_change_rate: string;
}

export async function getTxInfo(
  txHash: string,
  chainName: ChainName,
): Promise<any> {
  return get(chainName, `/txs/${txHash}`);
}

export async function getValidatorCommission(
  validator: string,
  chainName: ChainName,
): Promise<string> {
  const validatorInfo: any = await get(
    chainName,
    `/staking/validators/${validator}`,
  );
  const commission = validatorInfo.result.commission.commission_rates.rate;
  return commission;
}

export async function getEffectiveValidatorAPR(
  validator: string,
  chainName: ChainName,
): Promise<string | Error> {
  let apr;
  try {
    apr = await getAPR(chainName);
  } catch {
    return new Error('Unable to parse affective apr');
  }

  const commission = await getValidatorCommission(validator, chainName);
  try {
    return (
      (1 - parseFloat(commission)) *
      parseFloat(apr as string)
    ).toString();
  } catch {
    return new Error('Unable to parse affective apr');
  }
}

export async function getAPR(chainName: ChainName): Promise<string | Error> {
  const bondedTokensRes: any = await get(chainName, '/staking/pool');
  const bondedTokens = bondedTokensRes.result.bonded_tokens;

  const supplyInfo: any = await get(chainName, '/supply/total');
  const supply = supplyInfo.result[0].amount;

  const mintingInfo: any = await get(chainName, '/minting/inflation');
  const inflation = mintingInfo.result;

  try {
    const apr =
      parseFloat(inflation) / (parseFloat(bondedTokens) / parseFloat(supply));
    return apr.toString();
  } catch {
    return new Error('Unable to parse APR');
  }
}

export async function getRedelegationsInfo(
  chainName: ChainName,
  delegator?: string,
): Promise<any> {
  const query =
    '/staking/redelegations' + (delegator ? `?&delegator=${delegator}` : '');
  return get(chainName, query);
}

interface GetTransactionsOptions {
  sender?: string;
  receiver?: string;
  page?: string;
  limit?: string;
  network?: ChainName;
}

export async function getTransactions(options: GetTransactionsOptions = {}) {
  const chainName = (options && options.network) || 'gaia';
  const query =
    `/txs?` +
    '&message.action=send' +
    (options.sender ? `&message.sender=${options.sender}` : '') +
    (options.receiver ? `&transfer.recipient=${options.receiver}` : '') +
    (options.page ? `&page=${options.page}` : '') +
    (options.limit ? `&limit=${options.limit}` : '');
  info_debug(query);
  return get(chainName, query);
}
