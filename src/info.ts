import { get, post, ChainName } from './api';
import { Coin } from './Coin';

export async function getTxInfo(
  txHash: string,
  chainName: ChainName,
): Promise<any> {
  return get(chainName, `/txs/${txHash}`);
}

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

export async function getAPR(chainName: ChainName): Promise<string | Error> {
  const bondedTokensRes: any = await get(chainName, '/staking/pool');
  const bondedTokens = bondedTokensRes.result.bonded_tokens;

  const supplyInfo: any = await get(chainName, '/supply/total');
  const supply = supplyInfo.result[0].amount;

  const mintingInfo: any = await get(chainName, '/minting/inflation');
  const inflation = mintingInfo.result;

  try {
    const apr =
      (parseFloat(inflation) /
        (parseFloat(bondedTokens) / parseFloat(supply))) *
      100;
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
  console.log(query);
  return get(chainName, query);
}
