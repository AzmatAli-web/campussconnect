import mongoose from 'mongoose';
export async function connectDatabase(config) {
  if (!config.mongoUri) return false;
  await mongoose.connect(config.mongoUri,{serverSelectionTimeoutMS:8000,autoIndex:config.nodeEnv!=='production'});
  return true;
}
export function databaseReady() { return mongoose.connection.readyState===1; }
