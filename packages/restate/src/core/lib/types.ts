import { Cascade } from "@koreanwglasses/cascade";

export interface Client {}

export interface Policy<T> {
  (client: Client, target: T, key?: keyof T):
    | Promise<Cascade<boolean>>
    | Cascade<boolean>
    | Promise<boolean>
    | boolean;
}

export interface Packed {
  result: any;
  refs: Record<string, any>;
}

export type Unpacked<T> = T extends Promise<infer S> | Cascade<infer S>
  ? Unpacked<S>
  : T extends (infer S)[]
  ? Unpacked<S>[]
  : T extends Record<any, any>
  ? {
      [K in keyof T]: Unpacked<T[K]>;
    } & (T extends (...args: any) => any ? T : unknown)
  : T;
export type Got<T, Keys> = {
  [K in keyof T]: K extends Keys
    ? T[K] extends (...args: any) => infer R
      ? R
      : never
    : T[K];
};

/** @internal */
export interface PackedRef {
  __ref_id: number;
}

/** @internal */
export const isPackedRef = (target: unknown): target is PackedRef => {
  return (
    !!target &&
    (typeof target === "object" || typeof target === "function") &&
    typeof (target as PackedRef).__ref_id === "string"
  );
};

/** @internal */
export interface PackedCallable {
  __isCallable: true;
  __isAction: boolean;
  properties: any;
}

/** @internal */
export const isPackedCallable = (target: unknown): target is PackedCallable => {
  return (
    !!target &&
    (typeof target === "object" || typeof target === "function") &&
    (target as PackedCallable).__isCallable
  );
};

/** @internal */
export interface PackOptions {
  policy: Policy<any>;
  isGetter: boolean;
  isAction: boolean;
  clientIn?: number;
}
