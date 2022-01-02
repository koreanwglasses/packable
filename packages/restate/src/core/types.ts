import { Cascade } from "@koreanwglasses/cascade";

export interface Client {}

export interface Policy<T> {
  (client: Client, target: T, key?: keyof T):
    | Promise<Cascade<boolean>>
    | Cascade<boolean>
    | Promise<boolean>
    | boolean;
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

export type WithViews<T, Keys> = {
  [K in keyof T]: K extends Keys
    ? T[K] extends (...args: any) => infer R
      ? R
      : never
    : T[K];
};

/** @internal */
export interface RestateMetadata {
  policy: Policy<any>;
  isView: boolean;
  isAction: boolean;
  clientIn?: number;
  pack?: boolean;
  refId?: string;
}

/** @internal */
export interface Packed {
  result: any;
  refs: Record<string, Ref>;
}

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
export type Ref = ObjectRef | CallableRef;

/** @internal */
export interface ObjectRef {
  isCallable?: false;
  properties: Record<any, unknown>;
  isCascade: boolean;
}

/** @internal */
export interface CallableRef {
  isCallable: true;
  properties: Record<any, unknown>;
  isCascade: boolean;
}
