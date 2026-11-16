"use client";

import { Suspense, useState } from "react";
import { CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, Dumbbell, NotebookPen, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ExerciseNameDatalist } from "@/components/figure/exercise-name-input";
import { WorkoutCard } from "@/components/figure/workout-card";
import { WorkoutForm } from "@/components/figure/workout-form";
import { WorkoutLogCard } from "@/components/figure/workout-log-card";
import { WorkoutLogEditor } from "@/components/figure/workout-log-editor";
import { useTabParam } from "@/hooks/figure/use-tab-param";
import { createWorkout, deleteWorkout, updateWorkout, useWorkouts } from "@/hooks/figure/use-workouts";
import {
  createWorkoutLog,
  deleteWorkoutLog,
  updateWorkoutLog,
  useExerciseNames,
  useWorkoutLogs,
} from "@/hooks/figure/use-workout-logs";
import { formatDay, fromDay, toDay, todayDay } from "@/lib/figure/format";
import { addDays } from "date-fns";
import { useSWRConfig } from "swr";
import type { Workout, WorkoutFormData, WorkoutLog, WorkoutLogFormData } from "@/types/figure/fitness";

const TABS = ["log", "workouts"] as const;

export default function FitnessPage() {
  return (
    <Suspense fallback={<LoadingState variant="cards" />}>
      <FitnessContent />
    </Suspense>
  );
}

/** Prefill a log from a workout definition: one row per target set */
function logFromWorkout(w: Workout, date: string): WorkoutLogFormData {
  return {
    date,
    workoutId: w._id,
    name: w.name,
    exercises: w.exercises.map((e) => ({
      name: e.name,
      sets: Array.from({ length: e.targetSets }, () => ({
        reps: e.targetReps,
        weight: e.targetWeight ?? 0,
        done: true,
      })),
    })),
  };
}

type EditorState = { initial: WorkoutLogFormData; logId?: string } | null;

function FitnessContent() {
  const [tab, setTab] = useTabParam(TABS, "log");
  const [day, setDay] = useState(todayDay);
  const [dayOpen, setDayOpen] = useState(false);

  const { workouts, isLoading: workoutsLoading, mutate: mutateWorkouts } = useWorkouts();
  const { logs: dayLogs, isLoading: dayLoading } = useWorkoutLogs({ date: day });
  const { logs: recentLogs, isLoading: recentLoading } = useWorkoutLogs({ limit: 15 });
  const exerciseNames = useExerciseNames();
  const { mutate } = useSWRConfig();

  const [editor, setEditor] = useState<EditorState>(null);
  const [deletingLog, setDeletingLog] = useState<WorkoutLog | null>(null);
  const [workoutFormOpen, setWorkoutFormOpen] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [deletingWorkout, setDeletingWorkout] = useState<Workout | null>(null);

  /** Revalidate every log list + "last time" + autocomplete after a change */
  const refreshLogs = () =>
    mutate((key) => typeof key === "string" && key.startsWith("/api/figure/"));

  function startLog(w: Workout | null) {
    setEditor({
      initial: w ? logFromWorkout(w, day) : { date: day, name: "Workout", exercises: [] },
    });
    if (tab !== "log") setTab("log");
  }

  async function saveLog(data: WorkoutLogFormData) {
    if (editor?.logId) {
      await updateWorkoutLog(editor.logId, data);
      toast.success("Workout updated");
    } else {
      await createWorkoutLog(data);
      toast.success("Workout logged");
    }
    setDay(data.date);
    setEditor(null);
    refreshLogs();
  }

  async function handleDeleteLog() {
    if (!deletingLog) return;
    await deleteWorkoutLog(deletingLog._id);
    toast.success("Log deleted");
    refreshLogs();
  }

  async function saveWorkout(data: WorkoutFormData) {
    if (editingWorkout) {
      await updateWorkout(editingWorkout._id, data);
      setEditingWorkout(null);
    } else {
      await createWorkout(data);
      setWorkoutFormOpen(false);
    }
    mutateWorkouts();
    mutate("/api/figure/exercises/names");
  }

  async function handleDeleteWorkout() {
    if (!deletingWorkout) return;
    await deleteWorkout(deletingWorkout._id);
    mutateWorkouts();
  }

  const editLog = (log: WorkoutLog) =>
    setEditor({
      logId: log._id,
      initial: {
        date: log.date,
        workoutId: log.workoutId,
        name: log.name,
        notes: log.notes,
        exercises: log.exercises,
      },
    });

  const logMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Log workout
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {workouts.map((w) => (
          <DropdownMenuItem key={w._id} onClick={() => startLog(w)}>
            <Dumbbell className="mr-2 h-4 w-4" />
            {w.name}
          </DropdownMenuItem>
        ))}
        {workouts.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={() => startLog(null)}>
          <NotebookPen className="mr-2 h-4 w-4" />
          Blank workout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const earlierLogs = recentLogs.filter((l) => l.date !== day);

  return (
    <div className="space-y-6">
      <ExerciseNameDatalist names={exerciseNames} />
      <PageHeader
        title="Fitness"
        description="Plan reusable workouts and log what you lift"
        action={
          tab === "log" ? (
            logMenu
          ) : (
            <Button onClick={() => setWorkoutFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New workout
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="log" className="flex-none">
            Log
          </TabsTrigger>
          <TabsTrigger value="workouts" className="flex-none">
            Workouts ({workouts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="space-y-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setDay(toDay(addDays(fromDay(day), -1)))} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover open={dayOpen} onOpenChange={setDayOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-48 justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {day === todayDay() ? "Today" : formatDay(day, "EEE, MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fromDay(day)}
                  defaultMonth={fromDay(day)}
                  onSelect={(d) => {
                    if (d) {
                      setDay(toDay(d));
                      setDayOpen(false);
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" onClick={() => setDay(toDay(addDays(fromDay(day), 1)))} aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {day !== todayDay() && (
              <Button variant="ghost" size="sm" onClick={() => setDay(todayDay())}>
                Today
              </Button>
            )}
          </div>

          {dayLoading ? (
            <LoadingState variant="cards" />
          ) : dayLogs.length === 0 ? (
            <div className="rounded-lg border border-dashed">
              <EmptyState
                icon={Dumbbell}
                title={`Nothing logged ${day === todayDay() ? "today" : "on " + formatDay(day)}`}
                description={
                  workouts.length
                    ? "Pick one of your workouts from “Log workout”, or start a blank one."
                    : "Start a blank workout, or define reusable ones in the Workouts tab."
                }
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {dayLogs.map((log) => (
                <WorkoutLogCard key={log._id} log={log} showDate={false} onEdit={editLog} onDelete={setDeletingLog} />
              ))}
            </div>
          )}

          {!recentLoading && earlierLogs.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Recent</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {earlierLogs.map((log) => (
                  <WorkoutLogCard key={log._id} log={log} onEdit={editLog} onDelete={setDeletingLog} />
                ))}
              </div>
            </section>
          )}
        </TabsContent>

        <TabsContent value="workouts">
          {workoutsLoading ? (
            <LoadingState variant="cards" />
          ) : workouts.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="No workouts yet"
              description="Define a reusable workout, like “Push Day”, with target sets, reps and weight."
              action={{ label: "New workout", onClick: () => setWorkoutFormOpen(true) }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workouts.map((w) => (
                <WorkoutCard
                  key={w._id}
                  workout={w}
                  onLog={startLog}
                  onEdit={setEditingWorkout}
                  onDelete={setDeletingWorkout}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Log editor */}
      <Dialog open={!!editor} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editor?.logId ? "Edit workout log" : "Log workout"}</DialogTitle>
          </DialogHeader>
          {editor && (
            <WorkoutLogEditor
              initial={editor.initial}
              logId={editor.logId}
              onSubmit={saveLog}
              onCancel={() => setEditor(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Workout definition form */}
      <Dialog
        open={workoutFormOpen || !!editingWorkout}
        onOpenChange={(o) => {
          if (!o) {
            setWorkoutFormOpen(false);
            setEditingWorkout(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingWorkout ? "Edit workout" : "New workout"}</DialogTitle>
          </DialogHeader>
          <WorkoutForm
            key={editingWorkout?._id ?? "new"}
            defaultValues={editingWorkout ?? undefined}
            onSubmit={saveWorkout}
            onCancel={() => {
              setWorkoutFormOpen(false);
              setEditingWorkout(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deletingLog}
        onOpenChange={(o) => !o && setDeletingLog(null)}
        onConfirm={handleDeleteLog}
        title="Delete workout log"
        description="This removes the logged sets for this session. This action cannot be undone."
      />
      <DeleteConfirmDialog
        open={!!deletingWorkout}
        onOpenChange={(o) => !o && setDeletingWorkout(null)}
        onConfirm={handleDeleteWorkout}
        title="Delete workout"
        description="Past logs made from this workout are kept. This action cannot be undone."
      />
    </div>
  );
}
