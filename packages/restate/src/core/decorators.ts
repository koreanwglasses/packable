import { Policy } from "./lib/types";
import { getRestateMeta } from "./metadata";

export function include(
  target: any,
  key: string,
  descriptor?: PropertyDescriptor
) {
  if (descriptor) descriptor.enumerable = true;
  getRestateMeta(target)["." + key] ??= {};
}

export function evaluate(
  target: any,
  key: string,
  descriptor?: PropertyDescriptor
) {
  if (descriptor) descriptor.enumerable = true;
  (getRestateMeta(target)["." + key] ??= {}).evaluate = true;
}

export function policy(policy: Policy<any>) {
  return function (
    target: any,
    key: string = "",
    descriptor?: PropertyDescriptor
  ) {
    if (key) {
      // Define field policy
      if (descriptor) descriptor.enumerable = true;
      (getRestateMeta(target)["." + key] ??= {}).policy = policy;
    } else {
      (getRestateMeta(target.prototype)["." + key] ??= {}).policy = policy;
    }
  };
}

export function client(target: any, key: string, i: number) {
  const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
  if (descriptor) descriptor.enumerable = true;

  (getRestateMeta(target)["." + key] ??= {}).client = i;
}
