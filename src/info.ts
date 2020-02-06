import { get, post, ChainName } from './api';

export async function getTxInfo(
  txHash: string,
  chainName: ChainName,
): Promise<any> {
  return get(chainName, `/txs/${txHash}`);
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
