import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";

export default defineEval({
  description: "Keeps the same durable session across a follow-up turn.",
  tags: ["live", "durability"],
  async test(t) {
    // The first turn writes into /workspace and the second reads it back, so
    // the assertion covers both halves of durability: the same session id, and
    // a sandbox filesystem that survived the turn boundary.
    const first = await t.send(
      "Use run_python to write the text 8.8 into /workspace/marker.txt, then print it.",
    );
    first.calledTool("run_python");

    const second = await t.send(
      "Use run_python again to read /workspace/marker.txt and tell me what it says.",
    );
    await t.require(second.sessionId, equals(first.sessionId));
    second.calledTool("run_python");
    second.messageIncludes("8.8");
    t.succeeded();
  },
});
