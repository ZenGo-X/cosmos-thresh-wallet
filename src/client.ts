import {
  EcdsaParty2 as Party2,
  EcdsaParty2Share as Party2Share,
  EcdsaSignature as MPCSignature,
} from '@kzen-networks/thresh-sig';
export * from './address/acc-address';
export * from './address/address';
import { get, post, ChainName } from './api';
import { GAS_PRICE, calcFee, calcGas } from './calcFee';
import { times } from './math';
import getSigner from './cosmos/signer';
import { createTxHash, signTxHash, injectSignatrue } from './cosmos/api/signTx';
import { DEFAULT_GAS_COEFFICIENT, Denom } from './constants';
import * as CryptoJS from 'crypto-js';
import { AccAddress } from './address/acc-address';

import fs from 'fs';
import path from 'path';
import low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';

const P1_ENDPOINT = 'http://localhost:8000';
const HD_COIN_INDEX = 0;
const CLIENT_DB_PATH = path.join(__dirname, '../../client_db');

/* helpers */
enum AccountType {
  // TODO: These might be different on cosmos
  STANDARD = 'cosmos-sdk/Account',
  VESTING = 'cosmos-sdk/LazyGradedVestingAccount',
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

interface Balance {
  height: string;
  result: [Coin];
}

export interface Coin {
  denom: string;
  amount: string;
}

function getAmountOfDenom(balanceResult: Balance, denom: Denom): string {
  const value = balanceResult.result.find((res) => res.denom === denom);
  return value ? value.amount : '';
}

function ensureDirSync(dirpath: string) {
  try {
    fs.mkdirSync(dirpath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

export async function getBalance(
  address: string,
  chainName: ChainName,
): Promise<any> {
  return get(chainName, `/bank/balances/${address}`);
}

export async function getDelegationInfo(
  delegator: string,
  chainName: ChainName,
): Promise<any> {
  return get(chainName, `/staking/delegators/${delegator}/delegations`);
}

export async function getRewardsInfo(
  delegator: string,
  chainName: ChainName,
): Promise<any> {
  return get(chainName, `/distribution/delegators/${delegator}/rewards`);
}

export async function getUnbondingInfo(
  delegator: string,
  chainName: ChainName,
): Promise<any> {
  return get(
    chainName,
    `/staking/delegators/${delegator}/unbonding_delegations`,
  );
}

function getValue(account: StandardAccount | VestingAccount): AccountValue {
  return account.result.type === AccountType.STANDARD
    ? account.result.value
    : account.result.value.BaseVestingAccount.BaseAccount;
}

interface AccountInfo {
  from: string;
  chain_id: string;
  account_number: string;
  sequence: string;
}

async function getAccountInfo(
  chainName: ChainName,
  from: string,
): Promise<AccountInfo> {
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

type BroadcastType = 'async' | 'sync' | 'block';

export class CosmosThreshSigClient {
  private mainnet: boolean;
  private p2: Party2;
  private p2MasterKeyShare: Party2Share;
  private db: any;
  private broadcastType: BroadcastType;

  constructor(mainnet = false, broadcastType: BroadcastType = 'block') {
    this.mainnet = mainnet;
    this.p2 = new Party2(P1_ENDPOINT);
    this.broadcastType = broadcastType;
  }

  public async init() {
    this.initDb();
    return this.initMasterKey();
  }

  private initDb() {
    ensureDirSync(CLIENT_DB_PATH);
    const adapter = new FileSync(`${CLIENT_DB_PATH}/db.json`);
    this.db = low(adapter);
    this.db.defaults({ mkShare: null, addresses: [] }).write();
  }

  /**
   * get the address of the specified index. If the index is omitted, will return the default address (of index 0).
   * @param addressIndex HD index of the address to get
   */
  public getAddress(addressIndex = 0): string {
    const publicKey = this.getPublicKey(addressIndex);
    const publicKeyHex = publicKey.encode('hex', true);
    const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');
    const address = AccAddress.fromPublicKey(publicKeyBuffer).toBech32();
    const dbAddress = this.db
      .get('addresses')
      .find({ address })
      .value();
    if (!dbAddress) {
      this.db
        .get('addresses')
        .push({ address, index: addressIndex })
        .write();
    }
    return address;
  }
  /**
   * Initialize the client's master key.
   * Will either generate a new one by the 2 party protocol, or restore one from previous session.
   * @return {Promise}
   */
  private async initMasterKey() {
    this.p2MasterKeyShare = await this.restoreOrGenerateMasterKey();
  }

  /**
   * @return {Elliptic.PublicKey} PubKey
   */
  private getPublicKey(addressIndex: number) {
    // assuming a single default address
    const p2ChildShare = this.p2.getChildShare(
      this.p2MasterKeyShare,
      HD_COIN_INDEX,
      addressIndex,
    );
    return p2ChildShare.getPublicKey();
  }

  private async restoreOrGenerateMasterKey(): Promise<Party2Share> {
    const p2MasterKeyShare = this.db.get('mkShare').value();
    if (p2MasterKeyShare) {
      return p2MasterKeyShare;
    }

    return this.generateMasterKeyShare();
  }

  private async generateMasterKeyShare(): Promise<Party2Share> {
    const p2MasterKeyShare: Party2Share = await this.p2.generateMasterKey();
    this.db.set('mkShare', p2MasterKeyShare).write();

    return p2MasterKeyShare;
  }

  async generateTx(
    accountInfo: AccountInfo,
    endpoint: string,
    payload: any,
    memo: string,
    chainName: ChainName,
    gasData: any,
  ): Promise<any> {
    console.log('generate accountInfo=', accountInfo);
    console.log('generate gasData=', gasData);
    console.log('generate payLoad=', payload);

    const body = {
      base_req: {
        ...accountInfo,
        memo: memo,
        simulate: false,
        ...gasData,
      },
      ...payload,
    };
    console.log('Generate body=', body);
    // Send the base transaction again, now with the specified gas values
    console.log('Posting', JSON.stringify(body));

    const { value: tx } = await post(chainName, endpoint, body);

    console.log('tx =', JSON.stringify(tx));
    return tx;
  }

  public async collectRewards(
    delegator: string,
    options?: SendOptions,
    dryRun?: boolean,
  ): Promise<any> {
    const chainName: ChainName = (options && options.chainName) || 'gaia';
    const memo = (options && options.memo) || '';
    const accountInfo: AccountInfo = await getAccountInfo(chainName, delegator);

    const payload = {};

    const endpoint = `/distribution/delegators/${delegator}/rewards`;

    // Get gasData from simulation
    const [gasData, _] = await simulateAndGetFee(
      accountInfo,
      endpoint,
      payload,
      memo,
      chainName,
    );
    console.log('GasData=', gasData);

    /* Step 1: Generate the transaction from the paprameters */
    const rawTx = await this.generateTx(
      accountInfo,
      endpoint,
      payload,
      memo,
      chainName,
      gasData,
    );

    return this.signAndBroadcast(
      delegator,
      accountInfo,
      chainName,
      rawTx,
      dryRun,
    );
  }

  public async delegate(
    from: string,
    to: string,
    amount: string,
    denom: Denom,
    options?: SendOptions,
    sendAll?: boolean,
    dryRun?: boolean,
  ): Promise<any> {
    const chainName: ChainName = (options && options.chainName) || 'gaia';
    const memo = (options && options.memo) || '';
    const accountInfo: AccountInfo = await getAccountInfo(chainName, from);

    const payload = {
      delegator_address: from,
      validator_address: to,
      amount: { amount, denom },
    };

    const endpoint = `/staking/delegators/${from}/delegations`;

    // Get gasData from simulation
    const [gasData, _] = await simulateAndGetFee(
      accountInfo,
      endpoint,
      payload,
      memo,
      chainName,
    );
    console.log('GasData=', gasData);

    /* Step 1: Generate the transaction from the paprameters */
    const rawTx = await this.generateTx(
      accountInfo,
      endpoint,
      payload,
      memo,
      chainName,
      gasData,
    );

    return this.signAndBroadcast(from, accountInfo, chainName, rawTx, dryRun);
  }

  public async undelegate(
    from: string,
    to: string,
    amount: string,
    denom: Denom,
    options?: SendOptions,
    sendAll?: boolean,
    dryRun?: boolean,
  ): Promise<any> {
    const chainName: ChainName = (options && options.chainName) || 'gaia';
    const memo = (options && options.memo) || '';
    const accountInfo: AccountInfo = await getAccountInfo(chainName, from);

    const payload = {
      delegator_address: from,
      validator_address: to,
      amount: { amount, denom },
    };

    const endpoint = `/staking/delegators/${from}/unbonding_delegations`;

    // Get gasData from simulation
    const [gasData, _] = await simulateAndGetFee(
      accountInfo,
      endpoint,
      payload,
      memo,
      chainName,
    );
    console.log('GasData=', gasData);

    /* Step 1: Generate the transaction from the paprameters */
    const rawTx = await this.generateTx(
      accountInfo,
      endpoint,
      payload,
      memo,
      chainName,
      gasData,
    );

    return this.signAndBroadcast(from, accountInfo, chainName, rawTx, dryRun);
  }

  public async redelegate(
    from: string,
    validator_src: string,
    validator_dst: string,
    amount: string,
    denom: Denom,
    options?: SendOptions,
    sendAll?: boolean,
    dryRun?: boolean,
  ): Promise<any> {
    const chainName: ChainName = (options && options.chainName) || 'gaia';
    const memo = (options && options.memo) || '';
    const accountInfo: AccountInfo = await getAccountInfo(chainName, from);

    const payload = {
      delegator_address: from,
      validator_src_address: validator_src,
      validator_dst_address: validator_dst,
      amount: { amount, denom },
    };

    const endpoint = `/staking/delegators/${from}/redelegations`;

    // Get gasData from simulation
    const [gasData, _] = await simulateAndGetFee(
      accountInfo,
      endpoint,
      payload,
      memo,
      chainName,
    );
    console.log('GasData=', gasData);

    /* Step 1: Generate the transaction from the paprameters */
    const rawTx = await this.generateTx(
      accountInfo,
      endpoint,
      payload,
      memo,
      chainName,
      gasData,
    );

    return this.signAndBroadcast(from, accountInfo, chainName, rawTx, dryRun);
  }

  public async transfer(
    from: string,
    to: string,
    amount: string,
    denom: Denom,
    options?: SendOptions,
    sendAll?: boolean,
    dryRun?: boolean,
  ): Promise<any> {
    const chainName: ChainName = (options && options.chainName) || 'gaia';
    const memo = (options && options.memo) || '';
    const accountInfo: AccountInfo = await getAccountInfo(chainName, from);

    if (sendAll) {
      const balance = await getBalance(from, chainName);
      console.log('balance=', balance);
      amount = getAmountOfDenom(balance, denom);
      console.log('Balance of', denom, 'is', amount);
      // If sendAll: do not use the actuall full amount
      amount = (parseInt(amount) - 1).toString();
    }

    let payload = { amount: [{ amount, denom }] };
    const endpoint = `/bank/accounts/${to}/transfers`;

    const [gasData, estimatedFeeAmount] = await simulateAndGetFee(
      accountInfo,
      endpoint,
      payload,
      memo,
      chainName,
    );
    console.log('GasData=', gasData);

    // If sendAll: Update amount to send
    if (sendAll) {
      amount = (parseInt(amount) - parseInt(estimatedFeeAmount) + 1).toString();
      payload = { amount: [{ amount, denom }] };
    }

    const rawTx = await this.generateTx(
      accountInfo,
      endpoint,
      payload,
      memo,
      chainName,
      gasData,
    );

    return this.signAndBroadcast(from, accountInfo, chainName, rawTx, dryRun);
  }

  private async signAndBroadcast(
    from: string,
    accountInfo: any,
    chainName: ChainName,
    rawTx: any,
    dryRun?: boolean,
  ): Promise<any> {
    /* Step 2: Extract the TX hash of the transaction */
    const txHash = createTxHash(rawTx, {
      ...accountInfo,
      type: 'send',
    });

    console.log('txHash=', txHash);

    /* Step 3: Sign */
    const signer = this.getMPCSigner(from);

    const { signature, publicKey } = await signTxHash(txHash, signer);

    const signedTx = injectSignatrue(rawTx, signature, publicKey, accountInfo);

    console.log('type =', typeof signedTx);
    console.log('signedTx =', signedTx);
    const data = {
      tx: signedTx,
      mode: 'block',
    };
    console.log('actual_data =', data);

    /* Step 4: Broadcast transaction */
    if (dryRun) {
      console.log('------ Dry Run ----- ');
      console.log(JSON.stringify(data));
    } else {
      console.log(' ===== Executing ===== ');
      const res = await post(chainName, `/txs`, data);
      console.log('Send Res', res);
      return res;
    }
  }

  /*
   * Retruns a two-party signer.
   * The signer is a function receiving a txHash and performing
   * 2-party signing with the gotham server
   */
  private getMPCSigner(fromAddress: string) {
    return async (signHash: Buffer) => {
      const addressObj: any = this.db
        .get('addresses')
        .find({ address: fromAddress })
        .value();
      const addressIndex: number = addressObj.index;
      const p2ChildShare: Party2Share = this.p2.getChildShare(
        this.p2MasterKeyShare,
        HD_COIN_INDEX,
        addressIndex,
      );
      console.log('addressObj=', addressObj);

      const signatureMPC: MPCSignature = await this.p2.sign(
        signHash,
        p2ChildShare,
        HD_COIN_INDEX,
        addressIndex,
      );
      console.log('MPCSignatreu', MPCSignature);
      const signature = signatureMPC.toBuffer();
      console.log('sigBuffer=', signature);

      const publicKeyBasePoint = this.getPublicKey(addressIndex);
      const publicKeyHex = publicKeyBasePoint.encode('hex', true);
      const publicKey = Buffer.from(publicKeyHex, 'hex');
      console.log('publicKeyBuffer =', publicKey);
      return { signature, publicKey };
    };
  }
}

async function simulateTransaction(
  accountInfo: any,
  endpoint: string,
  payload: any,
  memo: string,
  chainName: ChainName,
): Promise<string> {
  const simulationFees = { amount: '1', denom: 'umuon' };
  const gasData = { gas: 'auto', fees: [simulationFees] };

  const base_req = { ...accountInfo, memo, simulate: true, ...gasData };
  console.log('simulate base_req =', base_req);
  const body = {
    base_req,
    ...payload,
  };
  console.log('simulate body', body);
  const returnValue = await post(chainName, endpoint, body);
  console.log('returnValue=', returnValue);
  const { gas_estimate } = returnValue;
  return gas_estimate;
}

/* Send a transaction to the simulation endpoint,
 * Calculate and the return the gasData object
 * and the estimatedFeeAmount
 *
 */
async function simulateAndGetFee(
  accountInfo: AccountInfo,
  endpoint: string,
  payload: any,
  memo: string,
  chainName: ChainName,
): Promise<[any, string]> {
  // We estimate gas with a fake fee of 1, so we pass our amount - 1
  // to get correct estimation even when sending all
  const gas_estimate = await simulateTransaction(
    accountInfo,
    endpoint,
    payload,
    memo,
    chainName,
  );

  console.log('gas_estimate =', gas_estimate);

  const estimatedFeeAmount = calcFee(
    times(gas_estimate, DEFAULT_GAS_COEFFICIENT),
  );

  console.log('estimatedFeeAmount =', estimatedFeeAmount);
  const feeAmount = times(estimatedFeeAmount || 0, 1);
  // TODO: code denom for payed fees
  const fee = { amount: feeAmount, denom: 'umuon' };
  const gas = calcGas(fee.amount);

  const gasData = {
    gas,
    gas_prices: [{ amount: GAS_PRICE, denom: fee.denom }],
  };
  return [gasData, estimatedFeeAmount];
}
