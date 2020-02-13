// Cosmos-thresh-wallet
//
// Copyright 2020 by Kzen Networks (kzencorp.com)
// Cosmos-threash-wallet is free software: you can redistribute
// it and/or modify it under the terms of the GNU General Public
// License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.
import * as bech32 from 'bech32';
import { Address, bech32Prefix } from './address';

/**
 * AccAddressのクラス。
 */
export class AccAddress extends Address {
  /**
   * Bech32フォーマットのアドレスに変換する。
   */
  toBech32() {
    const words = bech32.toWords(Buffer.from(this._value));
    return bech32.encode(bech32Prefix.accAddr, words);
  }

  /**
   * Bech32フォーマットのアドレスからインスタンスを作成する。
   * @param accAddress
   */
  static fromBech32(accAddress: string) {
    const { prefix, words } = bech32.decode(accAddress);
    if (prefix !== bech32Prefix.accAddr) {
      throw Error();
    }

    return new AccAddress(bech32.fromWords(words));
  }

  static fromPublicKey(publicKey: Buffer) {
    return new this(this.hash160(publicKey));
  }

  /**
   * JSON.stringify時に参照される。
   */
  toJSON() {
    return this.toBech32();
  }
}
