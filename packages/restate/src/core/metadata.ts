import { nanoid } from "nanoid";
import { RESTATE_META_KEY } from "./consts";
import { RestateMetadata } from "./types";
import { DEFAULT } from "./policies";

/** @internal */
export const getOwnRestateMetadata = (
  target: any,
  key?: string | symbol
): RestateMetadata => {
  if (!Reflect.ownKeys(target).includes(RESTATE_META_KEY)) {
    Object.defineProperty(target, RESTATE_META_KEY, {
      value: { properties: {} },
      enumerable: false,
      writable: true,
    });
  }

  return key
    ? (target[RESTATE_META_KEY].properties[key] ??= {})
    : target[RESTATE_META_KEY];
};

/** @internal */
export const getRestateMetadata = (
  target: any,
  key?: string | symbol
): Readonly<RestateMetadata> => {
  if (!target) return { policy: DEFAULT, isView: false, isAction: false };

  const protoMeta = getRestateMetadata(Reflect.getPrototypeOf(target), key);
  const ownMeta = getOwnRestateMetadata(target, key);
  const meta = { ...protoMeta, ...ownMeta };

  return meta;
};

/** @internal */
export const getKeysToPack = (target: any): Set<string | symbol> => {
  if (!target) return new Set();

  const protoKeys = getKeysToPack(Reflect.getPrototypeOf(target));
  const ownKeys = Reflect.ownKeys(target).filter(
    (key) =>
      Reflect.getOwnPropertyDescriptor(target, key)?.enumerable ||
      getRestateMetadata(target, key).pack
  );

  return new Set([...protoKeys, ...ownKeys]);
};

/** @internal */
export const getRefId = (target: any) =>
  (getOwnRestateMetadata(target).refId ??= nanoid());