// Cosmos-thresh-wallet
//
// Copyright 2020 by Kzen Networks (kzencorp.com)
// Cosmos-threash-wallet is free software: you can redistribute
// it and/or modify it under the terms of the GNU General Public
// License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.

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
import { Coin } from './Coin';

import fs from 'fs';
import path from 'path';
import low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';

const client_debug = require('debug')('client_debug');

const P1_ENDPOINT = 'http://localhost:8000';
const HD_COIN_INDEX = 0;
const CLIENT_DB_PATH = path.join(__dirname, '../../client_db');
const MUON = 1;

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

type SendOptions = {
  memo?: string;
  chainName?: ChainName;
  feeDenom?: string;
};

type BroadcastType = 'async' | 'sync' | 'block';

interface AccountInfo {
  from: string;
  chain_id: string;
  account_number: string;
  sequence: string;
}

/* Get the total amount owned by and account of a certain denom */
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

/* Returns the balance of an address */
export async function getBalance(
  address: string,
  chainName: ChainName,
): Promise<any> {
  return get(chainName, `/bank/balances/${address}`);
}

/* Returns the information about current delegations by and address */
export async function getDelegationInfo(
  delegator: string,
  chainName: ChainName,
): Promise<any> {
  return get(chainName, `/staking/delegators/${delegator}/delegations`);
}

/* Returns information of outstanding rewards of an address */
export async function getRewardsInfo(
  delegator: string,
  chainName: ChainName,
): Promise<any> {
  return get(chainName, `/distribution/delegators/${delegator}/rewards`);
}

/* Returns information of funds currently during unbonding period */
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

async function getAccountInfo(
  chainName: ChainName,
  from: string,
): Promise<AccountInfo> {
  /* latest */
  const latest = await get(chainName, '/blocks/latest');
  const { chain_id } = latest.block.header;
  client_debug('chain_id =', chain_id);

  /* account */
  const account = await get(chainName, `/auth/accounts/${from}`);
  client_debug('account =', account);
  const { account_number, sequence } = getValue(account);

  return { from, chain_id, account_number, sequence };
}

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
    client_debug('generate accountInfo=', accountInfo);
    client_debug('generate gasData=', gasData);
    client_debug('generate payLoad=', payload);

    const body = {
      base_req: {
        ...accountInfo,
        memo: memo,
        simulate: false,
        ...gasData,
      },
      ...payload,
    };
    client_debug('Generate body=', body);
    // Send the base transaction again, now with the specified gas values
    client_debug('Posting', JSON.stringify(body));

    const { value: tx } = await post(chainName, endpoint, body);

    client_debug('tx =', JSON.stringify(tx));
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
    client_debug('GasData=', gasData);

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
    client_debug('GasData=', gasData);

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
    client_debug('GasData=', gasData);

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
    client_debug('GasData=', gasData);

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

    /* In order for gas estimation to return correctly it requires gas amount > 0
     * If we want to estimate gas for a transaction sending all funds,
     * we need to specify an amount such that gas + amount_to_send < total_balance.
     * We thus use total_balance - MUON as the amount_to_send and gas = MUON.
     * After the actual gas estimation is received, we substitute amount_to_send
     * with total_balance - gas_actual.
     * We then add back the MUON we subtracted for initial estimation.
     * */
    if (sendAll) {
      const balance = await getBalance(from, chainName);
      client_debug('balance=', balance);
      amount = getAmountOfDenom(balance, denom);
      client_debug('Balance of', denom, 'is', amount);
      amount = (parseInt(amount) - MUON).toString();
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
    client_debug('GasData=', gasData);

    // If sendAll: Update amount to send to be total_balance - actual_gas
    // and add back the MUON subtracted for estimation. Otherwise you'll have
    // MUON left in the account after the transaction is complete
    if (sendAll) {
      amount = (
        parseInt(amount) -
        parseInt(estimatedFeeAmount) +
        MUON
      ).toString();
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

  /* This is where we sign and broadcast the transaction in json format.
   * Step 1: The rawTx is generated according to parameters passed by the user
   * Step 2: The digest (txHash) of the transaction is extracted for signing
   * Step 3: Perform a 2 party signing with gotham server
   * Step 4: Broadcast the transaction to the blockchain and wait for response.
   */
  private async signAndBroadcast(
    from: string,
    accountInfo: any,
    chainName: ChainName,
    rawTx: any,
    dryRun?: boolean,
  ): Promise<any> {
    /* Step 1: Step 1 was generating the rawTx this function received */
    /* Step 2: Extract the TX hash of the transaction */
    const txHash = createTxHash(rawTx, {
      ...accountInfo,
      type: 'send',
    });

    client_debug('txHash=', txHash);

    /* Step 3: Sign */
    const signer = this.getMPCSigner(from);

    const { signature, publicKey } = await signTxHash(txHash, signer);

    const signedTx = injectSignatrue(rawTx, signature, publicKey, accountInfo);

    client_debug('signedTx =', signedTx);
    const data = {
      tx: signedTx,
      mode: 'block',
    };
    client_debug('actual_data =', data);

    /* Step 4: Broadcast transaction and return the receipt*/
    if (dryRun) {
      return data;
    } else {
      const res = await post(chainName, `/txs`, data);
      return res;
    }
  }

  /*
   * Returns a two-party signer.
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
      client_debug('addressObj=', addressObj);

      const signatureMPC: MPCSignature = await this.p2.sign(
        signHash,
        p2ChildShare,
        HD_COIN_INDEX,
        addressIndex,
      );
      client_debug('Signature', MPCSignature);
      const signature = signatureMPC.toBuffer();

      const publicKeyBasePoint = this.getPublicKey(addressIndex);
      const publicKeyHex = publicKeyBasePoint.encode('hex', true);
      const publicKey = Buffer.from(publicKeyHex, 'hex');
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
  /* The simulated transaction requires gas amount > 0, and simulate = true
   * in order to return a correct value. The place holder can then be replaced
   * with the actual gas estimation returned by the simulation
   */
  const simulationFees = { amount: `${MUON}`, denom: 'umuon' };
  const gasData = { gas: 'auto', fees: [simulationFees] };

  const base_req = { ...accountInfo, memo, simulate: true, ...gasData };
  client_debug('simulate base_req =', base_req);
  const body = {
    base_req,
    ...payload,
  };
  client_debug('simulate body', body);
  const returnValue = await post(chainName, endpoint, body);
  client_debug('returnValue=', returnValue);
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
  const gas_estimate = await simulateTransaction(
    accountInfo,
    endpoint,
    payload,
    memo,
    chainName,
  );

  client_debug('gas_estimate =', gas_estimate);

  const estimatedFeeAmount = calcFee(
    times(gas_estimate, DEFAULT_GAS_COEFFICIENT),
  );

  client_debug('estimatedFeeAmount =', estimatedFeeAmount);
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
