import { generateSlug } from "random-word-slugs";
import { User } from "./user";
import { Cascade } from "@koreanwglasses/cascade";
import mongoose from "mongoose";
import { model, MongoRestate } from "./lib/mongo-helper";
import { action, Client, clientIn, view } from "@koreanwglasses/restate";

type RoomData = {
  hostId: string;
  gameId: string;
  name: string;
  joinCode: string;
};

const schema = new mongoose.Schema({
  hostId: String,
  gameId: String,
  name: String,
  joinCode: String,
});

function MEMBERS_ONLY() {}

function HOST_ONLY() {}

@model("Room", schema)
export class Room extends MongoRestate<RoomData> {
  ////////////////
  // DATA MODEL //
  ////////////////

  declare static _model: mongoose.Model<RoomData>;

  _hostId = this._data.pipe((data) => data.hostId);
  _gameId = this._data.pipe((data) => data.gameId);
  joinCode = this._data.pipe((data) => data.joinCode);
  name = this._data.pipe((data) => data.name);

  /////////////////////
  // DYNAMIC QUERIES //
  /////////////////////

  /**
   * These queries are composed of base queries and should not be invalidated
   * directly
   */

  @view
  players(client: Client) {
    return Cascade.all([
      User._getCurrentUser(client),
      User._getUsersInRoom(this._id),
      this._hostId,
    ] as const).pipe(([currentUser, users, hostId]) =>
      users.map((user) => ({
        user,
        isSelf: user._id === currentUser._id,
        isHost: user._id === hostId,
      }))
    );
  }

  //////////////////
  // BASE ACTIONS //
  //////////////////

  /**
   * These actions explicitly invalidate any fields or base queries that may be affected
   */

  @action
  static async _init() {
    const room = new Room._model({ joinCode: await generateRoomCode() });
    await room.save();
    return new Room(String(room._id));
  }

  @action
  async _setHost(hostId?: string) {
    await Room._model.findByIdAndUpdate(this._id, { hostId }).exec();
    this._data.invalidate();
  }

  @action
  async setName(name: string) {
    await Room._model.findByIdAndUpdate(this._id, { name }).exec();
    this._data.invalidate();
  }

  @action
  async newCode() {
    await Room._model
      .findByIdAndUpdate(this._id, { joinCode: await generateRoomCode() })
      .exec();
    this._data.invalidate();
  }

  //////////////////////
  // COMPOSED ACTIONS //
  //////////////////////

  /**
   * These actions are composed of base actions which
   * already invalidate any relevant data, and thus
   * these actions don't need to
   */

  @action
  static async join(joinCode: string, @clientIn client?: Client) {
    const user = await User._getCurrentUser(client!);
    const [roomId] = await Room._model
      .findOne({ joinCode })
      .distinct("_id")
      .exec();

    await user._setRoom(roomId);
  }

  @action
  static async create(@clientIn client?: Client) {
    const user = await User._getCurrentUser(client!);
    const room = await Room._init();

    await room._setHost(user._id);
    await user._setRoom(room._id);
  }

  @action
  startGame() {}
}

/////////////
// HELPERS //
/////////////

async function generateRoomCode() {
  let joinCode: string;
  let maxTries = 5;
  do {
    joinCode = generateSlug();
    if (!(await Room._model.exists({ joinCode }))) return joinCode;

    maxTries--;
    if (maxTries <= 0) throw new Error("Failed to generate a group code");
  } while (true);
}
