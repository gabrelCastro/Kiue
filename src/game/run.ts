import { Simulation } from '../sim/engine';
import type { Graph } from '../sim/types';
import { evaluateRun, type RunResult } from './goals';
import type { Level } from './level-types';

export function createSimulation(level: Level, graph: Graph): Simulation {
  return new Simulation(graph, level.sim);
}

export function solutionGraph(level: Level): Graph {
  return structuredClone(level.solution);
}

/** Roda a fase até o fim, sem render, e avalia. */
export function runLevel(level: Level, graph: Graph): { sim: Simulation; result: RunResult } {
  const sim = createSimulation(level, graph);
  sim.runToEnd();
  return { sim, result: evaluateRun(level.goals, level.stars, sim, graph) };
}
