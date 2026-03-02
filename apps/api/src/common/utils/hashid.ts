import Hashids from "hashids";

const hashids = new Hashids(process.env.HASHID_SALT || "", 8);

export function encodeId(id: number | string): string {
  return hashids.encode(Number(id));
}

export function decodeId(hash: string): number {
  const decoded = hashids.decode(hash);
  if (decoded.length !== 1) throw new Error(`Invalid ID: ${hash}`);
  return decoded[0] as number;
}
