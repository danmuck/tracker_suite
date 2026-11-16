"use client";

import { Input } from "@/components/ui/input";

export const EXERCISE_DATALIST_ID = "figure-exercise-names";

/** Renders the shared <datalist> once per page so exercise inputs can autocomplete */
export function ExerciseNameDatalist({ names }: { names: string[] }) {
  return (
    <datalist id={EXERCISE_DATALIST_ID}>
      {names.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  );
}

export function ExerciseNameInput(props: React.ComponentProps<typeof Input>) {
  return <Input list={EXERCISE_DATALIST_ID} autoComplete="off" placeholder="Exercise" {...props} />;
}
