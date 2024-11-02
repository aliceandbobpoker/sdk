// src/Crypto.ts
import { Scalar } from "ffjavascript";
import { getRandomBytes } from '@iden3/js-crypto';

require('crypto');

export function unstringifyBigInts(o:any): any {
  if (typeof o == "string" && /^[0-9]+$/.test(o)) {
      return BigInt(o);
  } else if (typeof o == "string" && /^0x[0-9a-fA-F]+$/.test(o)) {
      return BigInt(o);
  } else if (Array.isArray(o)) {
      return o.map(unstringifyBigInts);
  } else if (typeof o == "object") {
      if (o === null) return null;
      const res: any = {};
      const keys = Object.keys(o);
      keys.forEach((k) => {
          res[k] = unstringifyBigInts(o[k]);
      });
      return res;
  } else {
      return o;
  }
}

export function stringifyBigInts(o: any): any {
  if (typeof o == "bigint" || o.eq !== undefined) {
      return o.toString(10);
  } else if (o instanceof Uint8Array) {
      return Scalar.fromRprLE(o, 0);
  } else if (Array.isArray(o)) {
      return o.map(stringifyBigInts);
  } else if (typeof o == "object") {
      const res: any = {};
      const keys = Object.keys(o);
      keys.forEach((k) => {
          res[k] = stringifyBigInts(o[k]);
      });
      return res;
  } else {
      return o;
  }
}

//function that serializes a bigint to bytes
function bigIntToBytes(num: bigint): Uint8Array {
  const hex = num.toString(16).padStart(64, '0');
  // const length = hex.length / 2;
  return hexToBytes(hex, 32);
}

//function that converts a hex string to bytes
function hexToBytes(hex: string, length: number): Uint8Array {
  const result = new Uint8Array(length);
  for (let i = length * 2 - 2, j = 0; i >= 0; i -= 2, j++) {
    result[j] = parseInt(hex.substring(i, i + 2), 16);
  }
  console.assert(result.length === length);
  console.assert(result[result.length - 1] < 64);
  return result;
}

function g1ToBytes(p: any, curve: any): Uint8Array {
  let yArr = curve.G1.y(curve.G1.fromObject(p));
  let y = curve.G1.F.toObject(yArr);
  let yInv = curve.G1.F.toObject(curve.G1.F.neg(yArr));
  let isNeg = (y > yInv);
  var result = bigIntToBytes(p[0]);
  if (isNeg) {
    result[result.length - 1] = result[result.length - 1] + 128;
  }
  return result;
}

function g2ToBytes(p: any, curve: any): Uint8Array {
  let yArr = curve.G2.y(curve.G2.fromObject(p));
  let y = curve.G2.F.toObject(yArr);
  let yInv = curve.G2.F.toObject(curve.G2.F.neg(yArr));
  let isNeg = (y[1] > yInv[1]);

  let xArr = curve.G2.x(curve.G2.fromObject(p));
  let x = curve.G2.F.toObject(xArr);

  var c0 = bigIntToBytes(x[0]);
  var c1 = bigIntToBytes(x[1]);
  var result = new Uint8Array(c0.length + c1.length);
  result.set(c0);
  result.set(c1, c0.length);
  if (isNeg) {
    result[result.length - 1] = result[result.length - 1] + 128;
  }
  return result;
}

export function proofToBytes(proof: any, curve: any): Uint8Array {
  const a_bytes = g1ToBytes(proof.pi_a, curve);
  const b_bytes = g2ToBytes(proof.pi_b, curve);
  const c_bytes = g1ToBytes(proof.pi_c, curve);
  var result = new Uint8Array(a_bytes.length + b_bytes.length + c_bytes.length);
  result.set(a_bytes);
  result.set(b_bytes, a_bytes.length);
  result.set(c_bytes, a_bytes.length + b_bytes.length);
  return result;
}

export function BigIntsToBytes(inputs: bigint[]): Uint8Array {
  const length = inputs.length * 32;
  // const bcs = new BCS(getSuiMoveConfig());
  var result = new Uint8Array(length);
  for (let i = 0; i < inputs.length; i++) {
    const bytes = bigIntToBytes(inputs[i]);
    // const bytesCheck = bcs.ser(BCS.U256, inputs[i].toString()).toBytes();
    // check equal
    // for (let j = 0; j < 32; j++) {
    //   console.log(bytes[j] === bytesCheck[j]);
    // }
    result.set(bytes, i * 32);
  }
  return result;
}

export function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const arr of arrays) {
    totalLength += arr.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export function getRandomScalar(modulus: bigint): bigint {
  // @ts-ignore
  const bitLength = (typeof window === 'undefined') ? Scalar.bitLength(modulus) : window.bitLength(modulus);
  const nBytes = (bitLength * 2) / 8;
  let res = BigInt(0);
  for (let i = 0; i < nBytes; i++) {
    res = (res << BigInt(8)) + BigInt(getRandomBytes(1)[0]);
  }
  return res % modulus;
}