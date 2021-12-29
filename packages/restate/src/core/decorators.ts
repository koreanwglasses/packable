import { Policy } from ".";
import { getOwnRestateMetadata } from "./metadata";

export function pack(target: any, key: string) {
  const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
  if (descriptor) descriptor.enumerable = true;

  getOwnRestateMetadata(target, key).pack = true;
}

export function policy(policy: Policy<any>) {
  return function (target: any, key?: string) {
    if (key) {
      pack(target, key);
      getOwnRestateMetadata(target, key).policy = policy;
    } else {
      getOwnRestateMetadata(target.prototype).policy = policy;
    }
  };
}

export function view(target: any, key: string) {
  pack(target, key);
  getOwnRestateMetadata(target, key).isView = true;
}

export function action(target: any, key: string) {
  pack(target, key);
  getOwnRestateMetadata(target, key).isAction = true;
}

export function clientIn(target: any, key: string, i: number) {
  pack(target, key);
  getOwnRestateMetadata(target, key).clientIn = i;
}
