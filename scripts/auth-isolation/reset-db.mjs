// Drops the auth isolation database, and only that one. Takes no arguments and reads no environment
// variable: the URI is hard-coded so it can never be pointed at another database.
import mongoose from "mongoose";

const URI = "mongodb://localhost:27017/tracker_isolation";
const NAME = "tracker_isolation";

await mongoose.connect(URI);
try {
  const actual = mongoose.connection.db?.databaseName;
  if (actual !== NAME) throw new Error(`Refusing to drop database ${JSON.stringify(actual)}: only ${NAME} may be dropped`);
  await mongoose.connection.db.dropDatabase();
  console.log(`dropped ${NAME}`);
} finally {
  await mongoose.disconnect();
}
