import mongoose, { Schema, Document, Model } from "mongoose";

export interface IProject extends Document {
  name: string;
  description?: string;
  status: "active" | "archived" | "completed";
  repositoryUrl?: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["active", "archived", "completed"],
      default: "active",
    },
    repositoryUrl: { type: String, trim: true },
    color: { type: String, default: "#3b82f6" },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.Project) {
  delete mongoose.models.Project;
}

const Project: Model<IProject> =
  mongoose.models.Project || mongoose.model<IProject>("Project", ProjectSchema);

export default Project;
