import { createSignedTransactionObject } from './send';
import { createSignMessage, createSignature } from './signature';
import * as CryptoJS from 'crypto-js';

export const createTxHash = (tx: any, request: any) => {
  let signature, publicKey;
  const { sequence, account_number, chain_id } = request;
  const _req = { sequence, accountNumber: account_number, chainId: chain_id };
  const signMessage = createSignMessage(tx, _req);
  const signMessageString =
    typeof signMessage === 'string' ? signMessage : JSON.stringify(signMessage);

  console.log('signMessageString', signMessageString);

  const signHashBuffer = Buffer.from(
    CryptoJS.SHA256(signMessageString).toString(),
    `hex`,
  );
  console.log('signHashBuffer', signHashBuffer);
  return signHashBuffer;
};

export const signTxHash = async (txHash: Buffer, signer: any) => {
  let signature, publicKey;
  try {
    ({ signature, publicKey } = await signer(txHash));
  } catch (err) {
    throw new Error('Signing failed: ' + err.message);
  }
  return { signature, publicKey };
};

export const injectSignatrue = (
  tx: any,
  signature: any,
  publicKey: any,
  accountInfo: any,
) => {
  const { sequence, account_number } = accountInfo;
  const signatureObject = createSignature(
    signature,
    sequence,
    account_number,
    publicKey,
  );
  console.log('Signature again', signature);
  console.log('Public key again', publicKey);
  return createSignedTransactionObject(tx, signatureObject);
};

export const createSignedTransaction = async (
  tx: any,
  signer: any,
  request: any,
) => {
  let signature, publicKey;
  const { sequence, account_number, chain_id } = request;
  const _req = { sequence, accountNumber: account_number, chainId: chain_id };
  const signMessage = createSignMessage(tx, _req);

  try {
    ({ signature, publicKey } = await signer(signMessage));
  } catch (err) {
    throw new Error('Signing failed: ' + err.message);
  }

  const signatureObject = createSignature(
    signature,
    sequence,
    account_number,
    publicKey,
  );
  console.log('Signature again', signature);
  console.log('Public key again', publicKey);

  return createSignedTransactionObject(tx, signatureObject);
};

// export default async (tx: any, signer: any, request: any) => {
//   const signedTx = await createSignedTransaction(tx, signer, request);
//   return JSON.stringify(signedTx);
// };
