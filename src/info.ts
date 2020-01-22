import { get, post, ChainName } from './api';

export async function getTxInfo(
  txHash: string,
  chainName: ChainName,
): Promise<any> {
  return get(chainName, `/txs/${txHash}`);
}

interface GetTransactionsOptions {
  action?: string;
  sender?: string;
  page?: string;
  limit?: string;
  network?: ChainName;
}

export async function getTransactions(options: GetTransactionsOptions = {}) {
  const chainName = (options && options.network) || 'gaia';
  return get(
    chainName,
    `/txs?` +
      (options.action ? `&message.action=${options.action}` : '') +
      (options.sender ? `&message.sender=${options.sender}` : '') +
      (options.page ? `&page=${options.page}` : '') +
      (options.limit ? `&limit=${options.limit}` : ''),
  );
}
