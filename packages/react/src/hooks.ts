import { RestateContext as RestateContext } from "./component";
import { useContext, useEffect, useRef, useState } from "react";
import deepIs from "deep-is";

export function useRestate() {
  return useContext(RestateContext)!;
}

export function useResolve<T>(path: string, ...params: any[]) {
  const restate = useContext(RestateContext)!;

  const [state, setState] = useState<{
    result?: T;
    error?: any;
    loading: boolean;
  }>({ loading: true });

  const _params = useRef<any[]>();
  if (!deepIs(_params.current, params)) {
    _params.current = params;
  }

  useEffect(() => {
    const cascade = restate.resolve<T>(path, ..._params.current!);
    cascade
      .p((result) => setState({ result, loading: false }))
      .catch((error) => setState({ error, loading: false }));
    return () => {
      cascade.close();
    };
  }, [restate, _params.current, path]);

  return state;
}
