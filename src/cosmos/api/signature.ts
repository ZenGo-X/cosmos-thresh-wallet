type CreateSignMessageParams = {
  sequence: number;
  accountNumber: number;
  chainId: string;
};

export const createSignMessage = (
  jsonTx: any,
  params: CreateSignMessageParams
) => {
  const fee = {
    amount: jsonTx.fee.amount || [],
    gas: jsonTx.fee.gas
  };

  return JSON.stringify(
    removeEmptyProperties({
      fee,
      memo: jsonTx.memo,
      msgs: jsonTx.msg,
      sequence: params.sequence,
      account_number: params.accountNumber,
      chain_id: params.chainId
    })
  );
};

export const createSignature = (
  signature: any,
  sequence: number,
  accountNumber: number,
  publicKey: Buffer
) => ({
  signature: signature.toString("base64"),
  account_number: accountNumber,
  sequence,
  pub_key: {
    type: "tendermint/PubKeySecp256k1",
    value: publicKey.toString("base64")
  }
});

export const removeEmptyProperties = (jsonTx: any): any => {
  if (Array.isArray(jsonTx)) {
    return jsonTx.map(removeEmptyProperties);
  }

  if (typeof jsonTx !== "object") {
    return jsonTx;
  }

  const sorted: any = {};
  Object.keys(jsonTx)
    .sort()
    .forEach(key => {
      if (jsonTx[key] === undefined || jsonTx[key] === null) return;
      sorted[key] = removeEmptyProperties(jsonTx[key]);
    });

  return sorted;
};
