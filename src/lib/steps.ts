// Step looks for tools built from src/components/Step.astro. Purely visual: every step stays usable.

export type StepState = "now" | "later" | "done";

/** Move to step n (1-based): earlier steps are done, step n is now, later ones wait. Past the last step, all are done. */
export function stepTo(root: ParentNode, n: number) {
  root.querySelectorAll<HTMLElement>(".step[data-step]").forEach((s) => {
    const i = Number(s.dataset.step);
    s.dataset.state = i < n ? "done" : i === n ? "now" : "later";
  });
}

/** Set one step's look. */
export function setStep(root: ParentNode, n: number, state: StepState) {
  const s = root.querySelector<HTMLElement>(`.step[data-step="${n}"]`);
  if (s) s.dataset.state = state;
}
