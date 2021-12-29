import { RestateContext as RestateContext } from "./component";
import { useContext, useEffect, useRef, useState } from "react";
import deepIs from "deep-is";
import { Unpacked } from "@koreanwglasses/restate";

export function useRestate() {
  return useContext(RestateContext)!;
}

export type ResolveState<T> = {
  result?: Unpacked<T>;
  error?: any;
  loading: boolean;
};

export function useResolve<T>(path: string, ...params: any[]): ResolveState<T> {
  const restate = useContext(RestateContext)!;
  const [state, setState] = useState<ResolveState<T>>({ loading: true });
  let dependencies: unknown[] = [];

  const _params = useRef<any[]>(params);
  if (!deepIs(_params.current, params)) {
    _params.current = params;
  }

  useEffect(() => {
    const cascade = restate.resolve(path, ..._params.current);
    cascade
      .pipe((result) => setState({ result, loading: false }))
      .catch((error) => setState({ error, loading: false }));
    return () => {
      cascade.close();
    };
  }, [restate, _params.current, ...dependencies]);

  return state;
}
