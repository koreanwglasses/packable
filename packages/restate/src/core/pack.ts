import { Cascade } from "@koreanwglasses/cascade";
import { nanoid } from "nanoid";
import { stripUndefined } from "./lib/strip-undefined";
import { Client, Packed } from "./lib/types";
import { getKeysToPack, getPackOptions, getRestateMeta } from "./metadata";

/** @internal */
const getRefId = (target: any) =>
  (getRestateMeta(target).__ref_id ??= nanoid());

export const pack = (
  client: Client,
  target: unknown,
  refs: any = {}
): Cascade<Packed> => {
  return Cascade.$({ target })
    .$(($) => {
      if (
        $.target &&
        (typeof $.target === "object" || typeof $.target === "function")
      ) {
        // Check if client has access to object
        const { policy } = getPackOptions($.target);
        return $({ clientHasAccess: policy(client, $.target) })
          .$(($) => {
            if (!$.clientHasAccess) return $({ target: undefined });
            return $({}); // Type safety
          })
          .$({ clientHasAccess: undefined });
      }
      return $({}); // Type safety
    })
    .$(({ target }) => {
      // Recursively pack value
      if (Array.isArray(target)) {
        return target.reduce<Cascade<{ result: any[]; refs: any }>>(
          (acc, value) =>
            acc
              .$(($) => $({ packed: pack(client, value, $.refs) }))
              .$(($) =>
                $({
                  result: [...$.result, $.packed.result],
                  refs: $.packed.refs,
                })
              )
              .$({ packed: undefined }),
          Cascade.$({ result: [], refs })
        );
      } else if (
        target &&
        (typeof target === "object" || typeof target === "function")
      ) {
        const __ref_id = getRefId(target);

        // Skip packing if target is already packed
        if (__ref_id in refs)
          return {
            result: { __ref_id },
            refs,
          };

        let packed = Cascade.$({
          result: {} as any,
          refs: { ...refs, [__ref_id]: {} },
        });

        for (const key of getKeysToPack(target)) {
          const { evaluate, policy, clientParamIndex } = getPackOptions(
            target,
            key
          );

          packed = packed
            // Check permissions
            .$({ clientHasAccess: policy(client, target, key) })
            .$(($) => {
              // Get value
              if (!$.clientHasAccess) return $({ value: undefined });

              const value = (target as any)[key];

              // Compute the packed result, depending on whether
              // the field is a property, accessor, or method
              if (evaluate && typeof value === "function") {
                // Evaluate function before packing
                let args = [];
                if (typeof clientParamIndex === "number") {
                  args = new Array(clientParamIndex + 1).fill(undefined);
                  args[clientParamIndex] = client;
                }
                return $({ value: value.apply(target, args) });
              } else {
                // Field is accessor
                return $({ value });
              }
            })
            .$(($) => $({ packed: pack(client, $.value, $.refs) }))
            .$(($) =>
              $({
                result: { ...$.result, [key]: $.packed.result },
                refs: $.packed.refs,
              })
            )
            .$({
              clientHasAccess: undefined,
              value: undefined,
              packed: undefined,
            });
        }

        return packed.$(($) => ({
          result: { __ref_id },
          refs: {
            ...$.refs,
            [__ref_id]:
              typeof target === "function"
                ? {
                    __isCallable: true,
                    value: $.result,
                  }
                : $.result,
          },
        }));
      } else {
        // If value is primitive, return as is
        return { result: target, refs };
      }
    })
    .pipe(stripUndefined);
};
