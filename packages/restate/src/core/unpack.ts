import { isPackedCallable, isPackedRef, Packed, Unpacked } from ".";
import { join } from "./lib/join";

export const unpack = <T = any>(
  path: string,
  packed: Packed,
  remote: (path: string, params: any[], opts: { subscribe: boolean }) => any
) => {
  const link = (
    path: string,
    result: unknown
  ): { value: unknown; lazy: boolean } => {
    if (isPackedRef(result)) {
      return {
        get value() {
          return link(path, packed.refs[result.__ref_id]).value;
        },
        lazy: true,
      };
    }
    if (isPackedCallable(result)) {
      return {
        get value() {
          return Object.assign(
            (...params: any[]) =>
              remote(path, params, { subscribe: !result.__isAction }),
            link(path, result.properties).value
          );
        },
        lazy: true,
      };
    }
    if (Array.isArray(result)) {
      const linked = result.map((value, i) => link(join(path, i), value));
      if (linked.find(({ lazy }) => lazy)) {
        return {
          get value() {
            return linked.map(({ value }) => value);
          },
          lazy: true,
        };
      } else {
        return {
          value: linked.map(({ value }) => value),
          lazy: false,
        };
      }
    }
    if (result && typeof result === "object") {
      const value = {} as any;
      for (const key in result) {
        const linked = link(join(path, key), (result as any)[key]);
        if (linked.lazy) {
          Object.defineProperty(value, key, {
            get() {
              return linked.value;
            },
            enumerable: true,
          });
        } else {
          value[key] = linked.value;
        }
      }
      return { value, lazy: false };
    }
    return { value: result, lazy: false };
  };

  return link(path, packed.result).value as Unpacked<T>;
};
