import mongoose, { Schema, Document, Model } from "mongoose";

export interface IScratchpad extends Document {
  projectId: mongoose.Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const ScratchpadSchema = new Schema<IScratchpad>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, unique: true },
    content: { type: String, default: "" },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.Scratchpad) {
  delete mongoose.models.Scratchpad;
}

const Scratchpad: Model<IScratchpad> =
  mongoose.models.Scratchpad || mongoose.model<IScratchpad>("Scratchpad", ScratchpadSchema);

export default Scratchpad;
