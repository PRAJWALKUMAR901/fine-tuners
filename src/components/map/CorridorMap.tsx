import { useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { MobilityState } from '../../types/mobility';
import { interpolateAlongStops, shortestPath } from '../../services/graphRouter';

interface CorridorMapProps {
  state: MobilityState;
  focusVillageId?: string;
  focusCollegeId?: string;
  compact?: boolean;
}

interface Point {
  x: number;
  y: number;
}

export function CorridorMap({ state, focusVillageId, focusCollegeId, compact }: CorridorMapProps) {
  const [selectedNode, setSelectedNode] = useState<string>(focusVillageId ?? state.stops[0].id);

  const nodePoints = useMemo(() => {
    const map = new Map<string, Point>();
    state.stops.forEach((stop) => map.set(stop.id, { x: stop.x, y: stop.y }));
    state.colleges.forEach((college) => map.set(college.id, { x: college.x, y: college.y }));
    return map;
  }, [state.stops, state.colleges]);

  const waitingByVillage = useMemo(() => {
    const counts: Record<string, number> = {};
    state.pings
      .filter((ping) => ping.status === 'waiting' || ping.status === 'clustered' || ping.status === 'matched' || ping.status === 'reserved')
      .forEach((ping) => {
        counts[ping.villageId] = (counts[ping.villageId] ?? 0) + 1;
      });
    return counts;
  }, [state.pings]);

  const selected =
    state.stops.find((stop) => stop.id === selectedNode) ??
    state.colleges.find((college) => college.id === selectedNode);

  const selectedIsVillage = Boolean(state.stops.find((stop) => stop.id === selectedNode));
  const selectedRoutes = state.busRoutes.filter((route) => route.stopIds.includes(selectedNode));

  const focusPath = useMemo(() => {
    if (!focusVillageId || !focusCollegeId) return null;
    return shortestPath(state.edges, focusVillageId, focusCollegeId, { monsoon: state.monsoon });
  }, [state.edges, state.monsoon, focusVillageId, focusCollegeId]);

  const focusEdgeIds = new Set(focusPath?.edgeIds ?? []);

  const busPositions = state.buses.map((bus) => {
    const route = state.busRoutes.find((candidate) => candidate.id === bus.routeId);
    if (!route) return { bus, point: { x: 0, y: 0 } };
    const points = route.stopIds
      .map((id) => nodePoints.get(id))
      .filter((point): point is Point => Boolean(point));
    const collegePoint = nodePoints.get(route.destinationCollegeId);
    if (collegePoint) points.push(collegePoint);
    const overall = Math.min(
      1,
      Math.max(0, (bus.currentStopIndex + bus.progress) / Math.max(1, points.length - 1)),
    );
    return { bus, point: interpolateAlongStops(points, overall) };
  });

  const activeTrips = state.dispatches.filter((trip) => trip.status === 'dispatched');
  const tripPositions = activeTrips.map((trip) => {
    const village = nodePoints.get(trip.villageId);
    const college = nodePoints.get(trip.destinationCollegeId);
    const path = shortestPath(state.edges, trip.villageId, trip.destinationCollegeId, {
      monsoon: state.monsoon,
    });
    const points =
      path?.nodes
        .map((node) => nodePoints.get(node))
        .filter((point): point is Point => Boolean(point)) ?? [];
    if (points.length === 0 && village && college) points.push(village, college);
    const progress =
      trip.etaMinutes <= 0 ? 1 : Math.min(1, Math.max(0, 1 - trip.etaRemaining / trip.etaMinutes));
    return { trip, point: interpolateAlongStops(points, progress) };
  });

  const handleKeySelect = (id: string, event: React.KeyboardEvent<SVGGElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setSelectedNode(id);
    }
  };

  return (
    <section className="card overflow-hidden" aria-labelledby="corridor-map-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-forest-100 px-4 py-3">
        <div>
          <h2 id="corridor-map-heading" className="panel-title flex items-center gap-2">
            <MapPin size={16} className="text-forest-600" aria-hidden="true" />
            Corridor map
          </h2>
          <p className="text-xs text-forest-600">
            {state.monsoon ? 'Monsoon travel times active (×1.4). ' : 'Dry-weather travel times. '}
            Live simulated demand and vehicles.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-forest-600">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded bg-forest-400" /> road
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded bg-red-500" /> closed
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded bg-clay-400" /> demand
          </span>
        </div>
      </div>

      <div className="relative bg-[#f3f1e7]">
        <svg
          viewBox="0 0 800 540"
          className={`h-auto w-full ${compact ? 'max-h-[320px]' : 'max-h-[520px]'}`}
          role="img"
          aria-label="Interactive map of village stops, colleges, government bus routes, community vehicles and road closures"
        >
          <defs>
            <pattern id="fields" width="32" height="32" patternUnits="userSpaceOnUse">
              <rect width="32" height="32" fill="#f3f1e7" />
              <path d="M0 16h32M16 0v32" stroke="#e7e3d4" strokeWidth="1" />
            </pattern>
            <filter id="mapShadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#14211b" floodOpacity="0.16" />
            </filter>
          </defs>
          <rect width="800" height="540" fill="url(#fields)" />
          <path d="M40 500 C 170 440, 210 360, 300 330 S 520 300, 640 210" fill="none" stroke="#dfe8de" strokeWidth="26" strokeLinecap="round" opacity="0.55" />
          <path d="M70 90 C 220 150, 360 100, 500 210 S 700 320, 760 470" fill="none" stroke="#e8e2cf" strokeWidth="18" strokeLinecap="round" opacity="0.6" />

          {state.edges.map((edge) => {
            const from = nodePoints.get(edge.from);
            const to = nodePoints.get(edge.to);
            if (!from || !to) return null;
            const closed = edge.status !== 'open';
            const isFocus = focusEdgeIds.has(edge.id);
            return (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={closed ? '#dc2626' : isFocus ? '#1f4130' : '#7ca189'}
                strokeWidth={closed ? 4 : edge.roadType === 'highway' ? 4 : 2.5}
                strokeDasharray={closed ? '7 5' : undefined}
                strokeLinecap="round"
                opacity={isFocus ? 0.95 : closed ? 0.9 : 0.62}
              >
                <title>
                  {`${edge.from} to ${edge.to} · ${edge.distanceKm.toFixed(1)} km · ${edge.roadType} · ${edge.status}`}
                </title>
              </line>
            );
          })}

          {focusPath ? (
            <polyline
              points={focusPath.nodes
                .map((node) => nodePoints.get(node))
                .filter((point): point is Point => Boolean(point))
                .map((point) => `${point.x},${point.y}`)
                .join(' ')}
              fill="none"
              stroke="#b45309"
              strokeWidth="5"
              strokeLinecap="round"
              opacity="0.8"
              strokeDasharray="1 7"
            />
          ) : focusVillageId && focusCollegeId ? (
            <text x="400" y="30" textAnchor="middle" className="fill-red-700 text-[13px] font-bold">
              No valid route is currently available
            </text>
          ) : null}

          {state.busRoutes.map((route) => {
            const points = [...route.stopIds, route.destinationCollegeId]
              .map((id) => nodePoints.get(id))
              .filter((point): point is Point => Boolean(point));
            if (points.length < 2) return null;
            const broken = route.status !== 'running';
            return (
              <polyline
                key={`route-${route.id}`}
                points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="none"
                stroke={broken ? '#b91c1c' : '#2f6645'}
                strokeWidth={broken ? 3 : 2}
                strokeDasharray="9 5"
                opacity="0.55"
              >
                <title>{`Route ${route.code}: ${route.name} · ${route.status}`}</title>
              </polyline>
            );
          })}

          {state.stops.map((stop) => {
            const count = waitingByVillage[stop.id] ?? 0;
            const radius = 12 + Math.min(28, count * 3.4);
            return (
              <g key={`heat-${stop.id}`}>
                <circle cx={stop.x} cy={stop.y} r={radius} fill="#c17c3e" opacity="0.12" />
                <circle cx={stop.x} cy={stop.y} r={radius * 0.72} fill="#c17c3e" opacity="0.16" />
              </g>
            );
          })}

          {tripPositions.map(({ trip, point }) => (
            <g key={`trip-${trip.id}`} filter="url(#mapShadow)">
              <circle cx={point.x} cy={point.y} r="11" fill="#b45309" stroke="#fff" strokeWidth="2" />
              <text x={point.x} y={point.y + 4} textAnchor="middle" className="fill-white text-[9px] font-black">
                ●
              </text>
              <text x={point.x} y={point.y - 15} textAnchor="middle" className="fill-clay-900 text-[9px] font-bold">
                {trip.safetyCode}
              </text>
            </g>
          ))}

          {busPositions.map(({ bus, point }) => {
            const route = state.busRoutes.find((candidate) => candidate.id === bus.routeId);
            if (!route) return null;
            return (
              <g key={`bus-${bus.id}`}>
                <rect
                  x={point.x - 10}
                  y={point.y - 8}
                  width="20"
                  height="16"
                  rx="4"
                  fill={bus.status === 'running' ? '#1f4130' : '#b91c1c'}
                  stroke="#fff"
                  strokeWidth="1.5"
                />
                <text x={point.x} y={point.y + 3.5} textAnchor="middle" className="fill-white text-[9px] font-black">
                  {route.code}
                </text>
              </g>
            );
          })}

          {state.vehicles.map((vehicle) => {
            const point = nodePoints.get(vehicle.currentStopId);
            if (!point) return null;
            const active = activeTrips.some((trip) => trip.vehicleIds.includes(vehicle.id));
            if (active) return null;
            return (
              <g key={`veh-${vehicle.id}`}>
                <circle cx={point.x + 13} cy={point.y + 13} r="7" fill="#f7f6f1" stroke="#8a4d2b" strokeWidth="2" />
                <circle cx={point.x + 13} cy={point.y + 13} r="2.5" fill="#8a4d2b" />
              </g>
            );
          })}

          {state.stops.map((stop) => {
            const count = waitingByVillage[stop.id] ?? 0;
            const isSelected = selectedNode === stop.id;
            const isFocus = focusVillageId === stop.id;
            return (
              <g
                key={stop.id}
                role="button"
                tabIndex={0}
                aria-label={`${stop.name}, ${count} students waiting. Select for details.`}
                aria-pressed={isSelected}
                onClick={() => setSelectedNode(stop.id)}
                onKeyDown={(event) => handleKeySelect(stop.id, event)}
                className="cursor-pointer"
              >
                <circle
                  cx={stop.x}
                  cy={stop.y}
                  r={isSelected || isFocus ? 9 : 6.5}
                  fill={isSelected ? '#1f4130' : '#fff'}
                  stroke={isFocus ? '#b45309' : '#1f4130'}
                  strokeWidth={isSelected || isFocus ? 3 : 2}
                />
                <text
                  x={stop.x}
                  y={stop.y - 13}
                  textAnchor="middle"
                  className="pointer-events-none fill-forest-950 text-[10px] font-bold"
                  paintOrder="stroke"
                  stroke="#f3f1e7"
                  strokeWidth="3"
                >
                  {stop.name}
                </text>
                <text
                  x={stop.x}
                  y={stop.y + 22}
                  textAnchor="middle"
                  className="pointer-events-none fill-clay-800 text-[9px] font-bold"
                >
                  {count > 0 ? `${count} waiting` : 'no ping'}
                </text>
              </g>
            );
          })}

          {state.colleges.map((college) => {
            const isSelected = selectedNode === college.id;
            const isFocus = focusCollegeId === college.id;
            return (
              <g
                key={college.id}
                role="button"
                tabIndex={0}
                aria-label={`${college.name}. Select for details.`}
                aria-pressed={isSelected}
                onClick={() => setSelectedNode(college.id)}
                onKeyDown={(event) => handleKeySelect(college.id, event)}
                className="cursor-pointer"
              >
                <rect
                  x={college.x - 9}
                  y={college.y - 9}
                  width="18"
                  height="18"
                  rx="4"
                  transform={`rotate(45 ${college.x} ${college.y})`}
                  fill={isSelected ? '#b45309' : '#fff7ed'}
                  stroke={isFocus ? '#1f4130' : '#b45309'}
                  strokeWidth={isFocus ? 3 : 2}
                />
                <text
                  x={college.x}
                  y={college.y + 27}
                  textAnchor="middle"
                  className="pointer-events-none fill-forest-900 text-[10px] font-bold"
                  paintOrder="stroke"
                  stroke="#f3f1e7"
                  strokeWidth="3"
                >
                  {college.shortName}
                </text>
              </g>
            );
          })}

          {focusVillageId ? (
            <g>
              <circle
                cx={nodePoints.get(focusVillageId)?.x ?? 0}
                cy={nodePoints.get(focusVillageId)?.y ?? 0}
                r="22"
                fill="none"
                stroke="#b45309"
                strokeWidth="2"
                strokeDasharray="3 4"
                className="motion-safe:animate-pulseSoft"
              />
            </g>
          ) : null}
        </svg>

        <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-semibold text-forest-700 shadow-sm">
          Simulated corridor · not to scale
        </div>
      </div>

      <div className="border-t border-forest-100 bg-white px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-forest-950">{selected?.name}</div>
            <div className="text-xs text-forest-600">
              {selectedIsVillage
                ? `${waitingByVillage[selectedNode] ?? 0} active student pings · ${selectedRoutes.map((route) => `Route ${route.code}`).join(', ') || 'no direct route'}`
                : `${state.colleges.find((college) => college.id === selectedNode)?.students ?? 0} enrolled students · ${state.colleges.find((college) => college.id === selectedNode)?.villageId ?? ''}`}
            </div>
          </div>
          {selectedIsVillage ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedRoutes.map((route) => (
                <span
                  key={`${route.id}-chip`}
                  className={`chip ${
                    route.status === 'running'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  Route {route.code} · {Math.max(0, route.capacity - route.occupancy)} seats · {route.status}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {focusPath ? (
          <p className="mt-2 text-[11px] text-forest-600">
            Focused route: {focusPath.nodes.join(' → ')} · {focusPath.distanceKm.toFixed(1)} km ·{' '}
            {Math.round(focusPath.minutes)} min estimated travel from graph edges.
          </p>
        ) : null}
      </div>
    </section>
  );
}
