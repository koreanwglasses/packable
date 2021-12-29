import mongoose from "mongoose";

const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const name = process.env.DB_NAME;
const host = process.env.DB_HOST;
const port = process.env.DB_PORT;
export const uri = `mongodb://${user}:${password}@${host}:${port}/${name}`;

export const connect = async () => {
  return await mongoose.connect(uri);
};
