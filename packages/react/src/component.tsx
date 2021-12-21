import React, { createContext, useMemo } from "react";
import restate, { RestateClient } from "@koreanwglasses/restate/client";

export const RestateContext = createContext<RestateClient | null>(null);

const RestateProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const client = useMemo(() => restate(), []);
  return (
    <RestateContext.Provider value={client}>{children}</RestateContext.Provider>
  );
};

export default RestateProvider;
