// Cosmos-thresh-wallet
//
// Copyright 2020 by Kzen Networks (kzencorp.com)
// Cosmos-threash-wallet is free software: you can redistribute
// it and/or modify it under the terms of the GNU General Public
// License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version

export const createBroadcastBody = (signedTx: any, returnType = 'sync') =>
    JSON.stringify({ tx: signedTx, mode: returnType });

export const createSignedTransactionObject = (tx: any, signature: any) =>
    Object.assign({}, tx, { signatures: [signature] });
