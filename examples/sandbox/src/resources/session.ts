import mongoose from "mongoose";
import { model, MongoRestate } from "./lib/mongo-helper";

type SessionData = {
  _id: string;
  session: {
    userId: string;
  };
};

const schema = new mongoose.Schema<SessionData>({
  _id: String,
  session: {
    userId: String,
  },
});

@model("Session", schema)
export class Session extends MongoRestate<SessionData> {
  ////////////////
  // DATA MODEL //
  ////////////////

  declare static _model: mongoose.Model<SessionData>;

  /**
   * These represent the fields of the data in the database,
   * and will forward any changes when this._data.invalidate()
   * is called
   */

  _session = this._data.pipe((data) => data.session);

  //////////////////
  // BASE ACTIONS //
  //////////////////

  /**
   * These actions explicitly invalidate any fields or base queries that may be affected
   */

  async _update(session: Partial<SessionData["session"]>) {
    await Session._model.findByIdAndUpdate(this._id, { session }).exec();
    this._data.invalidate();
  }
}
