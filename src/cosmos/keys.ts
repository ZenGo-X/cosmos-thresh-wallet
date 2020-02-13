// Cosmos-thresh-wallet
//
// Copyright 2020 by Kzen Networks (kzencorp.com)
// Cosmos-threash-wallet is free software: you can redistribute
// it and/or modify it under the terms of the GNU General Public
// License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.

import * as bech32 from 'bech32';
import * as secp256k1 from 'secp256k1';
import * as CryptoJS from 'crypto-js';

const bech32ify = (address: string, prefix: string) => {
  const words = bech32.toWords(Buffer.from(address, 'hex'));
  return bech32.encode(prefix, words);
};

export const signWithPrivateKey = (
  signMessage: string | any,
  privateKey: Buffer,
) => {
  const signMessageString =
    typeof signMessage === 'string' ? signMessage : JSON.stringify(signMessage);
  const signHash = Buffer.from(
    CryptoJS.SHA256(signMessageString).toString(),
    `hex`,
  );
  const { signature } = secp256k1.sign(signHash, privateKey);

  return signature;
};
