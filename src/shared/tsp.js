/* ================================================
   RavenRoute — TSP Route Optimizer
   Nearest-Neighbor + 2-opt (supports road distance matrix)
   ================================================ */

/**
 * Haversine distance between two GPS coordinates (km)
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) { return (deg * Math.PI) / 180; }

/**
 * Nearest-neighbor heuristic
 */
function nearestNeighbor(dist, startIdx) {
  const n = dist.length;
  const visited = new Set([startIdx]);
  const path = [startIdx];
  let current = startIdx;

  while (visited.size < n) {
    let nearest = -1, nearestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited.has(j) && dist[current][j] < nearestDist) {
        nearest = j;
        nearestDist = dist[current][j];
      }
    }
    if (nearest === -1) break;
    visited.add(nearest);
    path.push(nearest);
    current = nearest;
  }
  return path;
}

/**
 * 2-opt improvement
 */
function twoOpt(path, dist, maxIter = 500) {
  const n = path.length;
  let improved = true, iter = 0;
  while (improved && iter < maxIter) {
    improved = false; iter++;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = dist[path[i - 1]][path[i]] + dist[path[j]][path[(j + 1) % n] || 0];
        const b = dist[path[i - 1]][path[j]] + dist[path[i]][path[(j + 1) % n] || 0];
        if (b < a - 0.0001) {
          let l = i, r = j;
          while (l < r) { [path[l], path[r]] = [path[r], path[l]]; l++; r--; }
          improved = true;
        }
      }
    }
  }
  return path;
}

function pathDistance(path, dist) {
  let t = 0;
  for (let i = 0; i < path.length - 1; i++) t += dist[path[i]][path[i + 1]];
  return t;
}

/**
 * Build Haversine distance matrix (fallback when OSRM unavailable)
 */
function buildHaversineMatrix(nodes) {
  const n = nodes.length;
  const d = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const v = haversineDistance(nodes[i].lat, nodes[i].lng, nodes[j].lat, nodes[j].lng);
      d[i][j] = v; d[j][i] = v;
    }
  return d;
}

/**
 * Solve TSP using Haversine distances (fallback)
 */
export function solveTSP(nodes, depot) {
  const allNodes = [{ lat: depot.lat, lng: depot.lng, _isDepot: true }, ...nodes];
  const dist = buildHaversineMatrix(allNodes);
  const naivePath = allNodes.map((_, i) => i);
  const naiveDistance = pathDistance(naivePath, dist);
  let optimizedPath = nearestNeighbor(dist, 0);
  optimizedPath = twoOpt(optimizedPath, dist);
  const totalDistance = pathDistance(optimizedPath, dist);
  const savingsPercent = ((naiveDistance - totalDistance) / naiveDistance) * 100;
  const sequence = optimizedPath.filter(i => i !== 0).map(i => nodes[i - 1]);
  return {
    sequence,
    totalDistance: Math.round(totalDistance * 100) / 100,
    naiveDistance: Math.round(naiveDistance * 100) / 100,
    savingsPercent: Math.max(0, Math.round(savingsPercent * 10) / 10)
  };
}

/**
 * Solve TSP using a pre-computed road distance matrix (from OSRM).
 * @param {number[][]} roadDistMatrix — distances in km, where index 0 = start/depot
 * @param {Array} nodes — delivery nodes (without depot)
 * @returns {{ sequence, totalDistance, naiveDistance, savingsPercent }}
 */
export function solveTSPWithMatrix(roadDistMatrix, nodes) {
  const n = roadDistMatrix.length;

  // Naive = original order (0 → 1 → 2 → ... → n-1)
  const naivePath = Array.from({ length: n }, (_, i) => i);
  const naiveDistance = pathDistance(naivePath, roadDistMatrix);

  // Nearest-neighbor from depot (index 0)
  let optimizedPath = nearestNeighbor(roadDistMatrix, 0);
  optimizedPath = twoOpt(optimizedPath, roadDistMatrix);

  const totalDistance = pathDistance(optimizedPath, roadDistMatrix);
  const savingsPercent = ((naiveDistance - totalDistance) / naiveDistance) * 100;

  // Map indices back to nodes (skip index 0 = depot)
  const sequence = optimizedPath.filter(i => i !== 0).map(i => nodes[i - 1]);

  return {
    sequence,
    totalDistance: Math.round(totalDistance * 100) / 100,
    naiveDistance: Math.round(naiveDistance * 100) / 100,
    savingsPercent: Math.max(0, Math.round(savingsPercent * 10) / 10)
  };
}
