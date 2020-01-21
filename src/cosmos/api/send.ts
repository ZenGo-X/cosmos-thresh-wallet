export const createBroadcastBody = (signedTx: any, returnType = 'sync') =>
    JSON.stringify({ tx: signedTx, mode: returnType });

export const createSignedTransactionObject = (tx: any, signature: any) =>
    Object.assign({}, tx, { signatures: [signature] });
