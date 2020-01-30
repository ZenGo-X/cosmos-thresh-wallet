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

async function getAccountInfo(
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

  // Generate a transaction to send from the parameters
  async generateTransaction(
    from: string,
    to: string,
    amount: string,
    denom: Denom,
    chainName: ChainName,
    accountInfo: any,
    options?: SendOptions,
    sendAll?: boolean,
  ) {
    if (sendAll) {
      const balance = await getBalance(from, chainName);
      console.log('balance=', balance);
      amount = getAmountOfDenom(balance, denom);
      console.log('Balance of', denom, 'is', amount);
    }

    // We estimate gas with a fake fee of 1, so we pass our amount - 1
    // to get correct estimation even when sending all
    const gas_estimate = await getEstimateGas(
      from,
      to,
      (parseInt(amount) - 1).toString(),
      denom,
      accountInfo,
      options,
    );
    console.log('gas_estimate =', gas_estimate);

    const estimatedFeeAmount = calcFee(
      times(gas_estimate, DEFAULT_GAS_COEFFICIENT),
    );

    if (sendAll) {
      amount = (parseInt(amount) - parseInt(estimatedFeeAmount)).toString();
    }

    console.log('estimatedFeeAmount =', estimatedFeeAmount);
    const feeAmount = times(estimatedFeeAmount || 0, 1);
    // TODO: code denom for payed fees
    const fee = { amount: feeAmount, denom: 'umuon' };
    const gas = calcGas(fee.amount);

    const gasData = {
      gas,
      gas_prices: [{ amount: GAS_PRICE, denom: fee.denom }],
    };

    const payload = { amount: [{ amount, denom }] };
    const body = {
      base_req: {
        ...accountInfo,
        memo: options && options.memo,
        simulate: false,
        //manual_gas
        ...gasData,
      },
      ...payload,
    };
    // Send the base transaction again, now with the specified gas values
    console.log('Posting', JSON.stringify(body));

    const { value: tx } = await post(
      chainName,
      `/bank/accounts/${to}/transfers`,
      body,
    );

    console.log('tx =', JSON.stringify(tx));
    return tx;
  }

  public async transfer(
    from: string,
    to: string,
    amount: string,
    denom: Denom,
    options?: SendOptions,
    sendAll?: boolean,
    dryRun?: boolean,
  ) {
    console.log('from =', from);
    console.log('to =', to);
    console.log('amount =', amount);
    console.log('denom =', denom);
    console.log('options =', options);
    const chainName: ChainName = (options && options.chainName) || 'gaia';
    /* Step 1: Generate the transaction from the paprameters */
    const accountInfo = await getAccountInfo(chainName, from);

    const rawTx = await this.generateTransaction(
      from,
      to,
      amount,
      denom,
      chainName,
      accountInfo,
      options,
      sendAll,
    );

    /* Step 2: Extract the TX hash of the transaction */
    const txHash = createTxHash(rawTx, {
      ...accountInfo,
      type: 'send',
    });

    console.log('txHash=' + txHash);

    /* sign */
    const signer = this.getMPCSigner(from);

    // const signedTx = await signTx(rawTx, signer);
    const { signature, publicKey } = await signTxHash(rawTx, signer);

    // const signedTx = injectSignatrue(rawTx, signature, publicKey, accountInfo);

    // console.log('type =', typeof signedTx);
    // console.log('signedTx =', signedTx);
    // const data = {
    //   tx: JSON.parse(signedTx),
    //   mode: 'block',
    // };
    // console.log('actual_data =', data);

    // if (dryRun) {
    //   console.log('------ Dry Run ----- ');
    //   console.log(JSON.stringify(data));
    // } else {
    //   console.log(' ===== Executing ===== ');
    //   const res = await post(chainName, `/txs`, data);
    //   console.log('Send Res', res);
    // }
  }

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
      // const signature = signatureMPC.toBuffer();
      // console.log('sigBuffer=', signature);

      // const publicKeyBasePoint = this.getPublicKey(addressIndex);
      // const publicKeyHex = publicKeyBasePoint.encode('hex', true);
      // const publicKey = Buffer.from(publicKeyHex, 'hex');
      // console.log('publicKeyBuffer =', publicKey);
      return { signature, publicKey };
    };
  }
}

/**
 * @return estimated gas
 */
async function getEstimateGas(
  from: string,
  to: string,
  amount: string,
  denom: string,
  accountInfo: any,
  options?: SendOptions,
): Promise<string> {
  const memo = options && options.memo;
  const chainName = (options && options.chainName) || 'gaia';
  console.log('From=', from);

  console.log('accountInfo =', accountInfo);
  const payload = { amount: [{ amount, denom }] };
  console.log('payload =', payload);

  const simulationFees = { amount: '1', denom }; // denom can be a different fee denom (any available asset)
  const gasData = { gas: 'auto', fees: [simulationFees] };

  // 1. simulate for gas estimation
  const base_req = { ...accountInfo, memo, simulate: true, ...gasData };
  console.log('base_req =', base_req);
  const body = {
    base_req,
    ...payload,
  };
  console.log('body(simulate) =', body);
  const returnValue = await post(
    chainName,
    `/bank/accounts/${to}/transfers`,
    body,
  );
  console.log('returnValue=', returnValue);
  const { gas_estimate } = returnValue;
  return gas_estimate;
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
