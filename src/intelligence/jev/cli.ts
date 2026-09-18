import { readFileSync } from "node:fs";
import { appendTelemetry } from "./telemetry.js";
import { evaluateEditRequest } from "./client.js";
import type { EditRequestState, JevMode } from "./decisions.js";
import { JEV_EVALUATION_DATASET } from "./evaluations.js";

const example = JEV_EVALUATION_DATASET[0].state;

function modeFromArgs(): JevMode {
  if (process.argv.includes("--assisted")) return "assisted";
  if (process.argv.includes("--selective-autonomy")) return "selective-autonomy";
  return "shadow";
}

function stateFromArgs(): EditRequestState {
  const inputIndex = process.argv.indexOf("--input");
  if (inputIndex >= 0 && process.argv[inputIndex + 1]) {
    return JSON.parse(readFileSync(process.argv[inputIndex + 1], "utf8")) as EditRequestState;
  }
  return example;
}

const decision = await evaluateEditRequest(stateFromArgs(), { mode: modeFromArgs() });
const logIndex = process.argv.indexOf("--telemetry");
if (logIndex >= 0 && process.argv[logIndex + 1]) appendTelemetry(process.argv[logIndex + 1], decision);
process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
