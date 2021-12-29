import {
  Button,
  ButtonBase,
  CircularProgress,
  Divider,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Layout } from "../components/layout";
import { Flex, RFlex } from "../components/flex";
import { FlexForm } from "../components/flex-form";
import SwipeableView from "react-swipeable-views";
import {
  ContentCopy,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  Star,
  PlayArrow,
} from "@mui/icons-material";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Room } from "../resources/room";
import { EditableText } from "../components/editable-text";
import copy from "copy-to-clipboard";
import { Refresh } from "../components/refresh";
import { useRouter } from "next/dist/client/router";
import { AppState } from "../resources/app";
import { Unpacked } from "@koreanwglasses/restate";
import { useResolve, useRestate } from "@koreanwglasses/restate-react";

const IndexContext = createContext<{
  setIndex: React.Dispatch<React.SetStateAction<number>>;
  state: Unpacked<AppState>;
} | null>(null);

const Loader = () => {
  const resolveState = useResolve<AppState>("/api/app/state");

  const router = useRouter();
  useEffect(() => {
    if (resolveState.result?.game) router.push("/game");
  }, [resolveState.result?.game, router]);

  return (
    <Layout>
      <Paper elevation={6}>
        <Flex sx={{ width: 400, minHeight: 200, position: "relative" }}>
          {resolveState.loading && <CircularProgress />}
          {!resolveState.loading && resolveState.result && (
            <HomePage state={resolveState.result} />
          )}
        </Flex>
      </Paper>
    </Layout>
  );
};

export default Loader;

const HomePage = ({ state }: { state: Unpacked<AppState> }) => {
  const [index, setIndex] = useState(
    state.room?.players ? 2 : state.user?.username ? 1 : 0
  );

  return (
    <IndexContext.Provider value={{ setIndex, state }}>
      <SwipeableView disabled index={index} animateHeight>
        <SetUsername />
        <SelectRoom />
        <RoomLobby />
      </SwipeableView>
    </IndexContext.Provider>
  );
};

const SetUsername = () => {
  const { state, setIndex } = useContext(IndexContext)!;
  return (
    <FlexForm
      action={({ username }) => state.user?.setUsername(username)}
      onSuccess={() => setIndex(1)}
    >
      <Flex gap={1}>
        <Typography>Enter a name</Typography>
        <TextField
          variant="standard"
          name="username"
          defaultValue={state.user?.username ?? ""}
        />
        <Button type="submit">
          Next <KeyboardArrowRight />
        </Button>
      </Flex>
    </FlexForm>
  );
};

const SelectRoom = () => {
  const { state, setIndex } = useContext(IndexContext)!;
  const restate = useRestate();
  return (
    <Flex sx={{ p: 2 }} gap={1}>
      <Typography>Welcome, {state.user?.username}</Typography>
      <Typography>Have a room code? Join a room!</Typography>
      <FlexForm
        action={({ joinCode }) =>
          restate.resolve("/api/room/join", joinCode).get({ keepAlive: false })
        }
        onSuccess={() => setIndex(2)}
        allowRepeats
      >
        <RFlex gap={1}>
          <TextField
            label="Room Code"
            name="joinCode"
            variant="standard"
            defaultValue={state.room?.joinCode ?? ""}
          />
          <Button variant="outlined" type="submit">
            Join
          </Button>
        </RFlex>
      </FlexForm>
      <Typography>Or create a new one!</Typography>
      <FlexForm
        action={() =>
          restate.resolve("/api/room/create").get({ keepAlive: false })
        }
        onSuccess={() => setIndex(2)}
        allowRepeats
      >
        <Button variant="outlined" type="submit">
          New Room
        </Button>
      </FlexForm>
      <Button onClick={() => setIndex(0)}>
        <KeyboardArrowLeft />
        Back
      </Button>
    </Flex>
  );
};

const RoomLobby = () => {
  const { setIndex, state } = useContext(IndexContext)!;
  return (
    <Flex sx={{ p: 2, height: 600 }} gap={1}>
      <FlexForm action={({ name }) => state.room?.setName(name)}>
        <Typography variant="h6">
          <EditableText remoteValue={state.room?.name} name="name" />
        </Typography>
      </FlexForm>
      <Divider flexItem variant="middle" sx={{ mb: 1 }}>
        <Typography variant="body2" sx={{ position: "relative", top: 10 }}>
          JOIN CODE
        </Typography>
      </Divider>
      {state.room && <JoinCode room={state.room} />}
      <Divider flexItem variant="middle" sx={{ mt: -1.5, mb: 1 }}>
        <Typography variant="body2" sx={{ position: "relative", top: 10 }}>
          {state.room?.players.length} PLAYERS
        </Typography>
      </Divider>
      {state.room?.players?.map((player, i) => (
        <Player key={i} player={player} />
      ))}
      <Divider flexItem sx={{ mt: 0.5 }} />
      <RFlex gap={1}>
        <Button
          onClick={() => {
            state.user?.leaveRoom();
            setIndex(1);
          }}
        >
          <KeyboardArrowLeft />
          Leave
        </Button>
        {state.room?.startGame && (
          <FlexForm action={state.room.startGame} allowRepeats>
            <Button variant="outlined" type="submit">
              Start
              <PlayArrow />
            </Button>
          </FlexForm>
        )}
      </RFlex>
    </Flex>
  );
};

function Player({
  player,
}: {
  player?: Unpacked<ReturnType<Room["players"]>>[number];
}): JSX.Element {
  return (
    <RFlex gap={1} sx={{ opacity: player?.user?.isConnected ? 1.0 : 0.5 }}>
      {player?.isHost && <Star fontSize="inherit" />}
      <FlexForm
        action={
          player?.isSelf &&
          (({ username }) => player?.user?.setUsername(username))
        }
      >
        <EditableText
          remoteValue={player?.user?.username ?? "[Your Name]"}
          name="username"
        />
      </FlexForm>
      {!player?.user?.isConnected && (
        <CircularProgress size={12} sx={{ color: "white" }} />
      )}
    </RFlex>
  );
}

function JoinCode({ room }: { room: Unpacked<AppState>["room"] }) {
  return (
    <RFlex>
      <Tooltip title="Click to copy" followCursor>
        <ButtonBase
          sx={{
            bgcolor: "rgba(0,0,0,0.3)",
            borderRadius: 2,
            px: 1,
            py: 0.5,
            color: ({ palette }) => palette.secondary.main,
          }}
          onClick={() => {
            if (room?.joinCode) copy(room?.joinCode);
          }}
        >
          <code>{room?.joinCode}</code>
          <ContentCopy fontSize="inherit" sx={{ ml: 1 }} />
        </ButtonBase>
      </Tooltip>
      {room?.newCode && (
        <Tooltip title="Regenerate Code" followCursor>
          <Refresh action={room.newCode} size="small" sx={{ opacity: 0.5 }} />
        </Tooltip>
      )}
    </RFlex>
  );
}
