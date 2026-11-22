import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITask extends Document {
  projectId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  status: "backlog" | "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  order: number;
  dueDate?: Date;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["backlog", "todo", "in_progress", "in_review", "done"],
      default: "todo",
    },
    priority: {
      type: String,
      required: true,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    order: { type: Number, default: 0 },
    dueDate: { type: Date },
    tags: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

TaskSchema.index({ projectId: 1, status: 1, order: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Task) {
  delete mongoose.models.Task;
}

const Task: Model<ITask> =
  mongoose.models.Task || mongoose.model<ITask>("Task", TaskSchema);

export default Task;
