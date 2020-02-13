// Cosmos-thresh-wallet
//
// Copyright 2020 by Kzen Networks (kzencorp.com)
// Cosmos-threash-wallet is free software: you can redistribute
// it and/or modify it under the terms of the GNU General Public
// License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.

import crypto from 'crypto';

const prefix = {
  main: 'cosmos',
  account: 'acc',
  validator: 'val',
  consensus: 'cons',
  public: 'pub',
  operator: 'oper',
  address: 'addr',
};
export const bech32Prefix = {
  accAddr: prefix.main,
  accPub: prefix.main + prefix.public,
  valAddr: prefix.main + prefix.validator + prefix.operator,
  valPub: prefix.main + prefix.validator + prefix.operator + prefix.public,
  consAddr: prefix.main + prefix.validator + prefix.consensus,
  consPub: prefix.main + prefix.validator + prefix.consensus + prefix.public,
};

/**
 * 各種アドレスの基底クラス。
 */
export class Address {
  protected _value: Buffer;

  /**
   *
   * @param value
   * @throws Error アドレスの長さが20でない場合、エラーがスローされます。
   */
  constructor(value: Buffer) {
    const addressLength = 20;
    if (value.length !== addressLength) {
      throw Error();
    }
    this._value = value;
  }

  static hash160(buffer: Buffer): Buffer {
    const sha256Hash: Buffer = crypto
      .createHash('sha256')
      .update(buffer)
      .digest();
    try {
      return crypto
        .createHash('rmd160')
        .update(sha256Hash)
        .digest();
    } catch (err) {
      return crypto
        .createHash('ripemd160')
        .update(sha256Hash)
        .digest();
    }
  }

  /**
   * 公開鍵からアドレスのインスタンスを作成する。
   * @param publicKey
   */
  static fromPublicKey(publicKey: Buffer) {
    return new Address(this.hash160(publicKey));
  }
}
