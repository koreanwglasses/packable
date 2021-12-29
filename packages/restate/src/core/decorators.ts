import { Policy } from ".";
import { getRestateMeta } from "./metadata";

export function include(
  target: any,
  key: string,
  descriptor?: PropertyDescriptor
) {
  if (descriptor) descriptor.enumerable = true;

  const properties = (getRestateMeta(target).properties ??= {});
  properties[key] ??= {};
}

export function policy(policy: Policy<any>) {
  return function (
    target: any,
    key?: string,
    descriptor?: PropertyDescriptor
  ) {
    if (key) {
      // Define field policy
      if (descriptor) descriptor.enumerable = true;

      const properties = (getRestateMeta(target).properties ??= {});
      const options = (properties[key] ??= {});
      options.policy = policy;
    } else {
      getRestateMeta(target.prototype).policy = policy;
    }
  };
}

export function getter(
  target: any,
  key: string,
  descriptor?: PropertyDescriptor
) {
  if (descriptor) descriptor.enumerable = true;

  const properties = (getRestateMeta(target).properties ??= {});
  const options = properties[key] ??= {};
  options.isGetter = true;
}

export function action(
  target: any,
  key: string,
  descriptor?: PropertyDescriptor
) {
  if (descriptor) descriptor.enumerable = true;

  const properties = (getRestateMeta(target).properties ??= {});
  const options = properties[key] ??= {};
  options.isAction = true;
}

export function clientIn(target: any, key: string, i: number) {
  const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
  if (descriptor) descriptor.enumerable = true;

  const properties = (getRestateMeta(target).properties ??= {});
  const options = (properties[key] ??= {});
  options.clientIn = i;
}
