import * as bech32 from 'bech32';
import * as secp256k1 from 'secp256k1';
import * as CryptoJS from 'crypto-js';

// function getAddress(publicKey: Buffer): Buffer {
//   if (typeof publicKey !== 'object' || publicKey.constructor !== Buffer) {
//     throw TypeError('parameter must be Buffer that contains public key');
//   }
//
//   const message: LibWordArray = Hex.parse(publicKey.toString('hex'));
//   const array: LibWordArray = SHA256(message);
//   const hash = RIPEMD160(array).toString();
//   const address = Buffer.from(hash, 'hex');
//   return bech32.toWords(address);
// }
//
// // NOTE: this only works with a compressed public key (33 bytes)
// export function getAccAddress(publicKey: Buffer): string {
//   const words = getAddress(publicKey);
//   return bech32.encode('cosmos', words);
// }

// export const getTerraAddress = (publicKey: Buffer) => {
//   const message = CryptoJS.enc.Hex.parse(publicKey.toString('hex'));
//   const address = CryptoJS.RIPEMD160(CryptoJS.SHA256(message)).toString();
//   return bech32.encode('cosmos', address.toString());
// };

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
