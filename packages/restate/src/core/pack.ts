import { Cascade } from "@koreanwglasses/cascade";
import { stripUndefined } from "./lib/strip-undefined";
import { Client, Packed, Ref } from "./types";
import { getKeysToPack, getRefId, getRestateMetadata } from "./metadata";

type Refs = Record<string, Ref>;

/** @internal */
export const pack = (
  client: Client,
  target: any,
  _refs: Refs = {} // Internal, used for keeping track of refs when recursing
): Cascade<Packed> => {
  return Cascade.resolve(target)
    .pipe((target) => {
      if (
        target &&
        (typeof target === "object" || typeof target === "function")
      ) {
        // Check if client has access to object
        const { policy } = getRestateMetadata(target);
        return Cascade.resolve(policy(client, target)).pipe((clientHasAccess) =>
          clientHasAccess ? target : undefined
        );
      } else {
        return target;
      }
    })
    .pipe((target) => {
      // Recursively pack value
      if (Array.isArray(target)) {
        return target
          .reduce<Cascade<[result: unknown[], refs: Refs]>>(
            (acc, value) =>
              acc
                .pipeAll(
                  ([result, refs]) =>
                    [result, pack(client, value, refs)] as const
                )
                .pipeAll(([result, packed]) => [
                  [...result, packed.result],
                  packed.refs,
                ]),
            Cascade.all([[], _refs])
          )
          .pipe(([result, refs]) => ({ result, refs }));
      } else if (
        target &&
        (typeof target === "object" || typeof target === "function")
      ) {
        const __ref_id = getRefId(target);

        // Skip packing if target is already packed
        if (__ref_id in _refs)
          return {
            result: { __ref_id },
            refs: _refs,
          };

        let packed = Cascade.all([{}, { ..._refs, [__ref_id]: {} }] as const);

        for (const key of getKeysToPack(target)) {
          const { policy, isView } = getRestateMetadata(target, key);

          packed = packed
            .pipeAll(
              ([result, refs]) =>
                // Check permissions
                [result, refs, policy(client, target, key)] as const
            )
            .pipeAll(([result, refs, clientHasAccess]) => {
              if (!clientHasAccess) return [result, refs, undefined];

              return [result, refs, isView ? target[key](client) : target[key]];
            })
            .pipeAll(
              ([result, refs, value]) =>
                [result, pack(client, value, refs)] as const
            )
            .pipeAll(([result, packed]) => [
              { ...result, [key]: packed.result },
              packed.refs,
            ]);
        }

        return packed.pipe(([result, refs]) => ({
          result: { __ref_id },
          refs: {
            ...refs,
            [__ref_id]: {
              isCallable: typeof target === "function",
              properties: result,
            },
          },
        }));
      } else {
        // If value is primitive, return as is
        return { result: target, refs: _refs };
      }
    })
    .pipe(stripUndefined);
};
