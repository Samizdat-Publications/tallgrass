// One attempt at a challenge: the stateful check from src/challenges.ts plus the intervention budget.
// The UI owns this so main.ts only has to ask "may I apply a tool?" before it sends one to the sim.
import type { Challenge, ChallengeStatus } from '../challenges';

export class ChallengeRun {
  /** Interventions used so far. */
  toolsUsed = 0;
  /** Latest status while running; the final one once the attempt has ended. */
  status: ChallengeStatus = { state: 'running', progress: '' };
  /** Set once, when the attempt is won or lost. */
  result: ChallengeStatus | null = null;
  /** Valley years (fractional) at the moment it ended. */
  endedYear = 0;
  private check: ReturnType<Challenge['makeCheck']>;

  constructor(readonly challenge: Challenge) {
    this.check = challenge.makeCheck();
  }

  get finished(): boolean {
    return this.result !== null;
  }

  /** Interventions left, or null when the challenge has no limit. */
  get left(): number | null {
    return this.challenge.maxTools === null ? null : Math.max(0, this.challenge.maxTools - this.toolsUsed);
  }

  /** True while the budget is spent and the attempt is still on. */
  get exhausted(): boolean {
    return !this.finished && this.left === 0;
  }

  /** Counts one tool when allowed. After the attempt has ended tools are free again. */
  tryUse(): boolean {
    if (this.finished) return true;
    if (this.left === 0) return false;
    this.toolsUsed++;
    return true;
  }

  /** Run the check for this frame. Returns true on the frame the attempt ends. */
  evaluate(year: number, pop: number[], packs: number): boolean {
    if (this.result) return false;
    const st = this.check({ year, pop, packs, toolsUsed: this.toolsUsed });
    this.status = st;
    if (st.state !== 'running') {
      this.result = st;
      this.endedYear = year;
      return true;
    }
    return false;
  }
}
