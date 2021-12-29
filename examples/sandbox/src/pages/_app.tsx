import type { AppProps } from "next/app";
import React from "react";
import { createTheme, ThemeProvider } from "@mui/material";
import CssBaseline from "@mui/material/CssBaseline";
import RestateProvider from "@koreanwglasses/restate-react";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#0097a7",
    },
    secondary: {
      main: "#e91e63",
    },
  },
});

function App({ Component, pageProps }: AppProps) {
  return (
    <RestateProvider opts={{ dev: true }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Component {...pageProps} />
      </ThemeProvider>
    </RestateProvider>
  );
}

export default App;
