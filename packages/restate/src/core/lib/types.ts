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
  value: any;
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
export interface RestateMeta {
  policy: Policy<any>;
  evaluate: boolean;
  clientParamIndex?: number;
}
