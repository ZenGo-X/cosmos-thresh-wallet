export * from './address/acc-address';
export * from './address/address';
import { get, post, ChainName } from './api';
import { GAS_PRICE, calcFee, calcGas } from './calcFee';
import { times } from './math';
import getSigner from './cosmos/signer';
import signTx from './cosmos/api/signTx';

const DEFAULT_GAS_COEFFICIENT = '1.3';

/* helpers */
enum AccountType {
  STANDARD = 'cosmos-sdk/Account',
  VESTING = 'core/LazyGradedVestingAccount',
}

interface StandardAccount {
  result: {
    type: AccountType.STANDARD;
    value: AccountValue;
  };
}

interface VestingAccount {
  result: {
    type: AccountType.VESTING;
    value: { BaseVestingAccount: { BaseAccount: AccountValue } };
  };
}

interface AccountValue {
  account_number: string;
  sequence: string;
}

export async function getBalance(
  address: string,
  chainName: ChainName,
): Promise<any> {
  return get(chainName, `/bank/balances/${address}`);
}

function getValue(account: StandardAccount | VestingAccount): AccountValue {
  return account.result.type === AccountType.STANDARD
    ? account.result.value
    : account.result.value.BaseVestingAccount.BaseAccount;
}

async function getBaseRequest(
  chainName: ChainName,
  from: string,
): Promise<object> {
  /* latest */
  const latest = await get(chainName, '/blocks/latest');
  const { chain_id } = latest.block.header;
  console.log('chain_id =', chain_id);

  /* account */
  const account = await get(chainName, `/auth/accounts/${from}`);
  console.log('account =', account);
  const { account_number, sequence } = getValue(account);

  return { from, chain_id, account_number, sequence };
}

type SendOptions = {
  memo?: string;
  chainName?: ChainName;
  feeDenom?: string;
};

export async function transfer(
  privateKeyHex: string,
  from: string,
  to: string,
  amount: string,
  denom: string,
  options?: SendOptions,
) {
  console.log('from =', from);
  console.log('to =', to);
  console.log('amount =', amount);
  console.log('denom =', denom);
  console.log('options =', options);
  const gas_estimate = await simulate(from, to, amount, denom, options);
  console.log('gas_estimate =', gas_estimate);

  const estimatedFeeAmount = calcFee(
    times(gas_estimate, DEFAULT_GAS_COEFFICIENT),
  );
  console.log('estimatedFeeAmount =', estimatedFeeAmount);
  const feeAmount = times(estimatedFeeAmount || 0, 1);
  // TODO: code denom for payed fees
  const fee = { amount: feeAmount, denom: 'umuon' }; // denom here can be different than the transfer denomination
  const gas = calcGas(fee.amount);

  const chainName = (options && options.chainName) || 'gaia';
  const base = await getBaseRequest(chainName, from);
  const gasData = {
    gas,
    gas_prices: [{ amount: GAS_PRICE, denom: fee.denom }],
  };

  // let manual_gas = {
  //   amount: [{ denom: "umuon", amount: "3000" }],
  //   gas: "200005"
  // };
  // console.log("Manual Gas", manual_gas);

  const payload = { amount: [{ amount, denom }] };
  const body = {
    base_req: {
      ...base,
      memo: options && options.memo,
      simulate: false,
      //manual_gas
      ...gasData,
    },
    ...payload,
  };
  // This is another simulation?
  console.log('Posting', JSON.stringify(body));

  const { value: tx } = await post(
    chainName,
    `/bank/accounts/${to}/transfers`,
    body,
  );

  // Manual fee
  //tx.fee = { amount: [{ denom: "umuon", amount: "870" }], gas: "58333" };
  console.log('tx =', JSON.stringify(tx));

  /* sign */
  const submitType = 'local';
  const signer = await getSigner(privateKeyHex);
  const signedTx = await signTx(tx, signer, { ...base, type: 'send' });
  console.log('type =', typeof signedTx);
  console.log('signedTx =', signedTx);
  const data = {
    tx: JSON.parse(signedTx),
    mode: 'sync',
  };
  console.log('actual_data =', data);

  const res = await post(chainName, `/txs`, data);
  console.log('Send Res', res);
}

/**
 * @return estimated gas
 */
async function simulate(
  from: string,
  to: string,
  amount: string,
  denom: string,
  options?: SendOptions,
): Promise<string> {
  const memo = options && options.memo;
  const chainName = (options && options.chainName) || 'gaia';

  const base = await getBaseRequest(chainName, from);
  console.log('base =', base);
  const payload = { amount: [{ amount, denom }] };
  console.log('payload =', payload);

  const simulationFees = { amount: '1', denom }; // denom can be a different fee denom (any available asset)
  const gasData = { gas: 'auto', fees: [simulationFees] };

  // 1. simulate for gas estimation
  const base_req = { ...base, memo, simulate: true, ...gasData };
  console.log('base_req =', base_req);
  const body = {
    base_req,
    ...payload,
  };
  console.log('body =', body);
  const { gas_estimate } = await post(
    chainName,
    `/bank/accounts/${to}/transfers`,
    body,
  );
  return gas_estimate;
}
