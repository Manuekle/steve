import { defineDynamic } from "eve/skills";
import {
  INBOX_NOTE,
  INTAKE,
  MARKETING_NOTE,
  NO_INVENTION,
  PIPELINE_NOTE,
  PLAIN_LANGUAGE,
  SANDBOX_NOTE,
  operatorSkill,
} from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner asks a question about their own numbers that needs actual " +
          "arithmetic: totals, averages, comparisons between periods, per-source or " +
          "per-month breakdowns, or anything where getting the sum wrong would matter.",
        `# Answer a question with arithmetic

For a question where the answer is a number the owner will act on, do the
arithmetic in the sandbox rather than in my head. A model adding forty deal
values in prose gets it wrong often enough to matter, and quietly.

## When to use

- "cuánto vendí en agosto contra julio".
- "cuál es mi ticket promedio por canal".
- "cuántos de los que consultan terminan comprando".

## When NOT to use

- A number one tool already returns. The pipeline summary computes totals, win
  rate and averages; running Python to recompute them adds a step and a way to
  be wrong.
- A question about what people said. That is language, not arithmetic — use
  the inbox skills.

${INTAKE}

${SANDBOX_NOTE}

${PIPELINE_NOTE}

${INBOX_NOTE}

${MARKETING_NOTE}

## Steps

1. **Say the question back as a calculation.** "Ventas de agosto contra julio"
   means won deals whose close date falls in each month, summed per currency.
   If two readings are possible — deals created or deals closed — ask that one
   question. Answering the wrong one precisely is worse than asking.
2. **Fetch the data with the tools**, filtered as narrowly as the question
   allows, and note the totalMatched each returns. If a limit cut the rows, say
   so before computing anything; a total from a truncated list is wrong, not
   approximate.
3. **Write the program** with the rows as literal values. Then, in the same
   program:
   - Print the input count first, so the output proves what it read.
   - Group per currency, always. Adding pesos to dollars produces a number
     that looks fine and means nothing.
   - Print the intermediate steps, not just the answer. An output the owner
     cannot check is an assertion.
4. **Read the output before reporting it.** If stderr is non-empty or the exit
   code is not zero, fix the program and run it again — never report a number
   from a run that partly failed.
5. **Report** the answer in one sentence, then how it was arrived at, then
   what it excludes.

## Rules

- Every number that reaches the owner came out of a program run on this turn,
  or out of a tool. Nothing is estimated in prose.
- Round only at the end, and say the unit.
- Never write a customer's name, phone number or email into the program.
  Compute over ids and amounts; put the names back afterwards from what the
  tool returned. The sandbox is isolated, and there is still no reason to copy
  personal details into a program to add up money.
- Never claim a trend from two points, or a rate from a handful of cases. Say
  the sample size next to the number, always.
- If the data cannot answer the question, say which piece is missing. "No lo
  puedo calcular porque los negocios ganados no tienen fecha de cierre" is a
  real answer and points at a fix.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
