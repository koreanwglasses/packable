import { ReportProblem } from "@mui/icons-material";
import { CircularProgress, Collapse, Tooltip } from "@mui/material";
import deepEqual from "deep-is";
import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Flex, RFlex } from "./flex";

export const FlexFormContext = createContext<{
  submit?(): Promise<void>;
  disabled?: boolean;
}>({});

export const FlexForm = ({
  children,
  action,
  allowRepeats = false,
  onSuccess,
}: React.PropsWithChildren<{
  action?: ((data: Record<string, any>) => void | Promise<void>) | false | null;
  allowRepeats?: boolean;
  onSuccess?: () => void;
}>) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  const form = useRef<HTMLFormElement>(null);
  const getData = useCallback(
    () =>
      Object.fromEntries(
        new FormData(form.current as HTMLFormElement).entries()
      ),
    []
  );

  const prevData = useRef<any>();
  useEffect(() => {
    prevData.current = getData();
  }, [getData]);

  const _lock = useRef(false);
  const submit = async () => {
    if (!action) return;

    const data = getData();
    if (!allowRepeats && deepEqual(prevData.current, data)) return;

    form
      .current!.querySelectorAll(":focus")
      .forEach((elem) => (elem as Partial<HTMLInputElement>).blur?.());

    setIsSubmitting(true);
    try {
      await action(data);
      onSuccess?.();
    } catch (e) {
      setLastError(e as Error);
    } finally {
      setIsSubmitting(false);
      _lock.current = false;
    }
  };

  return (
    <Flex
      component="form"
      position="relative"
      ref={form}
      onSubmit={async (e) => {
        e.preventDefault();
        submit();
      }}
    >
      <RFlex>
        <Collapse orientation="horizontal" in={!!lastError}>
          <Tooltip
            title={lastError?.message.split("\n")[0] ?? ""}
            componentsProps={{
              tooltip: { sx: { bgcolor: "rgba(200, 0, 0)" } },
            }}
          >
            <ReportProblem
              fontSize="inherit"
              sx={{
                mr: 0.5,
                transform: "translateY(25%)",
                color: (theme) => theme.palette.error.main,
              }}
            />
          </Tooltip>
        </Collapse>
        <Flex
          sx={{
            opacity: isSubmitting ? 0.5 : 1,
            pointerEvents: isSubmitting ? "none" : "auto",
            transition: "opacity 0.3s",
          }}
        >
          <FlexFormContext.Provider
            value={{
              submit,
              disabled: !action,
            }}
          >
            {children}
          </FlexFormContext.Provider>
        </Flex>
      </RFlex>
      <Flex
        position="absolute"
        width={1}
        height={1}
        sx={{
          opacity: isSubmitting ? 1 : 0,
          transition: "opacity 0.3s",
          display: isSubmitting ? undefined : "hidden",
          pointerEvents: "none",
        }}
      >
        <CircularProgress />
      </Flex>
    </Flex>
  );
};
