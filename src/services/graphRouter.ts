import type { RoadEdge } from '../types/mobility';

export interface GraphPath {
  nodes: string[];
  edgeIds: string[];
  distanceKm: number;
  minutes: number;
}

export interface RouteGraph {
  adjacency: Map<string, { to: string; edge: RoadEdge; minutes: number }[]>;
}

export interface GraphOptions {
  monsoon: boolean;
}

export const MONSOON_TIME_FACTOR = 1.4;

export function isEdgeUsable(edge: RoadEdge): boolean {
  return edge.status === 'open';
}

export function edgeTravelMinutes(edge: RoadEdge, options: GraphOptions): number {
  const monsoonFactor = options.monsoon ? MONSOON_TIME_FACTOR : 1;
  return edge.baseMinutes * edge.multiplier * monsoonFactor;
}

/**
 * Builds the active routing graph. Closed and flooded roads are physically
 * removed so no route can ever traverse them.
 */
export function buildGraph(edges: RoadEdge[], options: GraphOptions): RouteGraph {
  const adjacency = new Map<string, { to: string; edge: RoadEdge; minutes: number }[]>();
  const add = (from: string, to: string, edge: RoadEdge): void => {
    const list = adjacency.get(from) ?? [];
    list.push({ to, edge, minutes: edgeTravelMinutes(edge, options) });
    adjacency.set(from, list);
  };
  for (const edge of edges) {
    if (!isEdgeUsable(edge)) continue;
    add(edge.from, edge.to, edge);
    add(edge.to, edge.from, edge);
  }
  // Deterministic neighbour order keeps tie-breaking reproducible.
  adjacency.forEach((list) => {
    list.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  });
  return { adjacency };
}

interface DijkstraEntry {
  node: string;
  minutes: number;
}

/**
 * Dijkstra shortest path by travel time (not straight-line distance).
 * Returns null when no feasible path exists in the active graph.
 */
export function shortestPath(
  edges: RoadEdge[],
  from: string,
  to: string,
  options: GraphOptions,
): GraphPath | null {
  if (from === to) {
    return { nodes: [from], edgeIds: [], distanceKm: 0, minutes: 0 };
  }
  const graph = buildGraph(edges, options);
  if (!graph.adjacency.has(from) || !graph.adjacency.has(to)) return null;

  const best = new Map<string, number>();
  const previous = new Map<string, { node: string; edgeId: string; distanceKm: number }>();
  const visited = new Set<string>();
  best.set(from, 0);
  const queue: DijkstraEntry[] = [{ node: from, minutes: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.minutes - b.minutes || (a.node < b.node ? -1 : a.node > b.node ? 1 : 0));
    const current = queue.shift();
    if (!current) break;
    if (visited.has(current.node)) continue;
    visited.add(current.node);
    if (current.node === to) break;

    const neighbours = graph.adjacency.get(current.node) ?? [];
    for (const neighbour of neighbours) {
      if (visited.has(neighbour.to)) continue;
      const candidate = current.minutes + neighbour.minutes;
      const existing = best.get(neighbour.to);
      if (existing === undefined || candidate < existing - 1e-9) {
        best.set(neighbour.to, candidate);
        previous.set(neighbour.to, {
          node: current.node,
          edgeId: neighbour.edge.id,
          distanceKm: neighbour.edge.distanceKm,
        });
        queue.push({ node: neighbour.to, minutes: candidate });
      }
    }
  }

  const total = best.get(to);
  if (total === undefined) return null;

  const nodes: string[] = [to];
  const edgeIds: string[] = [];
  let distanceKm = 0;
  let cursor = to;
  while (cursor !== from) {
    const step = previous.get(cursor);
    if (!step) return null;
    nodes.unshift(step.node);
    edgeIds.unshift(step.edgeId);
    distanceKm += step.distanceKm;
    cursor = step.node;
  }
  return { nodes, edgeIds, distanceKm, minutes: total };
}

/** All-pairs distances from a node, useful for detour and reachability checks. */
export function distancesFrom(
  edges: RoadEdge[],
  from: string,
  options: GraphOptions,
): Map<string, GraphPath> {
  const result = new Map<string, GraphPath>();
  const nodes = new Set<string>();
  edges.forEach((edge) => {
    nodes.add(edge.from);
    nodes.add(edge.to);
  });
  nodes.forEach((node) => {
    const path = shortestPath(edges, from, node, options);
    if (path) result.set(node, path);
  });
  return result;
}

/** Distance-weighted position along a route's stop sequence for SVG rendering. */
export function interpolateAlongStops(
  points: { x: number; y: number }[],
  progress: number,
): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const clamped = Math.min(1, Math.max(0, progress));
  const legs = points.length - 1;
  const scaled = clamped * legs;
  const index = Math.min(legs - 1, Math.floor(scaled));
  const fraction = scaled - index;
  const a = points[index];
  const b = points[index + 1];
  return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
}
