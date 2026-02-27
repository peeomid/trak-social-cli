#!/usr/bin/env node
import { buildProgram } from "./cli/program.js";

const program = buildProgram();

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
