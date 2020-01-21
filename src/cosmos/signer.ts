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
