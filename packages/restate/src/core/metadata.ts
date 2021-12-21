import { RESTATE_META_KEY } from "./lib/consts";
import { RestateMeta } from "./lib/types";
import { DEFAULT } from "./policies";

/** @internal */
export const getRestateMeta = (target: any) => {
  if (!(RESTATE_META_KEY in target)) {
    Object.defineProperty(target, RESTATE_META_KEY, {
      value: {},
      enumerable: false,
    });
  }

  return target[RESTATE_META_KEY];
};

/** @internal */
export const getKeysToPack = (target: any): Set<string | symbol> => {
  if (!target) return new Set();

  const protoKeys = getKeysToPack(Reflect.getPrototypeOf(target));
  const ownKeys = Reflect.ownKeys(target).filter(
    (key) =>
      Reflect.getOwnPropertyDescriptor(target, key)?.enumerable ||
      getRestateMeta(target)[`.${key.toString()}`]
  );

  return new Set([...protoKeys, ...ownKeys]);
};

/** @internal */
export const getPackOptions = (
  target: any,
  key: string | symbol = ""
): RestateMeta => {
  if (!target) return { evaluate: false, policy: DEFAULT };

  const protoMeta = getPackOptions(Reflect.getPrototypeOf(target), key);
  const ownMeta = getRestateMeta(target)[`.${key.toString()}`] ?? {};
  const meta = { ...protoMeta, ...ownMeta };

  return meta;
};
