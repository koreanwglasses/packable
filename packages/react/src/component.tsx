import React, { createContext, useMemo } from "react";
import restate, {
  RestateClient,
  RestateClientOpts,
} from "@koreanwglasses/restate/client";

export const RestateContext = createContext<RestateClient | null>(null);

const RestateProvider = ({
  children,
  opts,
}: React.PropsWithChildren<{ opts?: RestateClientOpts }>) => {
  const client = useMemo(() => restate(opts), []);
  return (
    <RestateContext.Provider value={client}>{children}</RestateContext.Provider>
  );
};

export default RestateProvider;
