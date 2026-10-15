/** Value a WS command returns to the client's ack callback. */
export type Ack<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
