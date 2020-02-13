// Cosmos-thresh-wallet
//
// Copyright 2020 by Kzen Networks (kzencorp.com)
// Cosmos-threash-wallet is free software: you can redistribute
// it and/or modify it under the terms of the GNU General Public
// License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.

import { signWithPrivateKey } from "./keys";
import { ec as EC } from "elliptic";
const ec = new EC("secp256k1");

export default async (privateKeyHex: string) => {
  return (signMessage: string) => {
    const signature = signWithPrivateKey(
      signMessage,
      Buffer.from(privateKeyHex, "hex")
    );

    const publicKey = Buffer.from(
      ec
        .keyFromPrivate(privateKeyHex, "hex")
        .getPublic()
        .encodeCompressed("array")
    );
    console.log("publicKey =", publicKey);
    return { signature, publicKey };
  };
};
