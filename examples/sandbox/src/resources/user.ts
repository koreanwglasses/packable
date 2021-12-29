import { Cascade } from "@koreanwglasses/cascade";
import { Client, action } from "@koreanwglasses/restate";
import mongoose from "mongoose";
import { model, MongoRestate } from "./lib/mongo-helper";
import { Session } from "./session";

type UserData = {
  id: string;
  roomId: string | null;
  lastDisconnect: number | null;
  username: string | null;
};

const schema = new mongoose.Schema<UserData>({
  id: String,
  roomId: String,
  lastDisconnect: Number,
  username: String,
});

const DISCONNECT_TIMEOUT = 1000 * 30;

function ALLOW_SELF() {}

function ROOM_ONLY() {}

@model("User", schema)
export class User extends MongoRestate<UserData> {
  ////////////////
  // DATA MODEL //
  ////////////////

  declare static _model: mongoose.Model<UserData>;

  /**
   * These represent the fields of the data in the database,
   * and will forward any changes when this._data.invalidate()
   * is called
   */

  _roomId = this._data.pipe((data) => data?.roomId);
  _lastDisconnect = this._data.pipe((data) => data?.lastDisconnect);

  username = this._data.pipe((data) => data?.username);

  /////////////////////
  // MANAGED QUERIES //
  /////////////////////

  /**
   * These queries can be invalidated directly to propagate any changes
   */

  static _usersInRoomMemo: Record<string, Cascade<User[]>> = {};
  static _getUsersInRoom(roomId: string) {
    return (this._usersInRoomMemo[roomId] ??= new Cascade(async () =>
      (
        await User._model
          .find({
            roomId,
          })
          .distinct("_id")
          .exec()
      ).map((id) => new User(String(id)))
    ));
  }

  static _getCurrentUser(client: Client) {
    const session = new Session(client.sid);
    return session._session.pipe(async ({ userId }) => {
      if (!userId) {
        const user = await User._init();
        await session._update({ userId: user._id });
        return user;
      }

      return new User(userId);
    });
  }

  /////////////////////
  // DYNAMIC QUERIES //
  /////////////////////

  /**
   * These queries are composed of base queries and should not be invalidated
   * directly
   */

  get isConnected() {
    return this._lastDisconnect.pipe((lastDisconnect) => !lastDisconnect);
  }

  //////////////////
  // BASE ACTIONS //
  //////////////////

  /**
   * These actions explicitly invalidate any fields or base queries that may be affected
   */

  static async _init() {
    const user = new User._model();
    await user.save();

    return new User(String(user._id));
  }

  async _setRoom(roomId: string | null) {
    const { roomId: prevRoomId } = (await User._model
      .findByIdAndUpdate(this._id, { roomId })
      .exec())!;

    this._data.invalidate();
    if (roomId) User._getUsersInRoom(roomId).invalidate();
    if (prevRoomId) User._getUsersInRoom(prevRoomId).invalidate();
  }

  async _reconnect() {
    await User._model
      .findByIdAndUpdate(this._id, {
        lastDisconnect: null,
      })
      .exec();
    this._data.invalidate();
  }

  async _disconnect(lastDisconnect: number) {
    await User._model
      .findByIdAndUpdate(this._id, {
        lastDisconnect,
      })
      .exec();
    this._data.invalidate();

    // Follow-up and disconnect from room/game if timed out
    setTimeout(async () => {
      const lastDisconnect = await this._lastDisconnect.get();
      if (lastDisconnect && lastDisconnect + DISCONNECT_TIMEOUT <= Date.now()) {
        this.leaveRoom();
      }
    }, DISCONNECT_TIMEOUT + lastDisconnect - Date.now());
  }

  @action
  async setUsername(username: string) {
    await User._model
      .findByIdAndUpdate(this._id, {
        username,
      })
      .exec();
    this._data.invalidate();
  }

  @action
  async leaveRoom() {
    await User._model
      .findByIdAndUpdate(this._id, {
        roomId: null,
      })
      .exec();
    this._data.invalidate();
  }
}
