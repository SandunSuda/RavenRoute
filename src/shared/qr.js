/* ================================================
   RavenRoute — QR Code Utilities
   Canvas-based QR code generation (no external lib)
   ================================================ */

/**
 * Generate a simple visual QR-style pattern on a canvas.
 * This creates a deterministic grid pattern based on the data string,
 * styled to look like a branded QR code.
 */
export function generateQRCode(container, data, size = 200) {
  container.innerHTML = '';

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.style.borderRadius = '12px';
  const ctx = canvas.getContext('2d');

  const gridSize = 21;
  const cellSize = size / gridSize;

  // Hash the data string into a seed
  let seed = 0;
  for (let i = 0; i < data.length; i++) {
    seed = ((seed << 5) - seed + data.charCodeAt(i)) | 0;
  }

  // Seeded PRNG
  function seededRandom() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed & 0x7fffffff) / 2147483647;
  }

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Draw cells
  ctx.fillStyle = '#0a0a0f';
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      // Finder patterns (top-left, top-right, bottom-left)
      if (isFinderPattern(row, col, gridSize)) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        continue;
      }
      // Finder pattern inner white
      if (isFinderInner(row, col, gridSize)) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        ctx.fillStyle = '#0a0a0f';
        continue;
      }
      // Finder pattern core
      if (isFinderCore(row, col, gridSize)) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        continue;
      }
      // Data cells
      if (seededRandom() > 0.45) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  }

  // Brand accent — small purple square in center
  const centerSize = cellSize * 3;
  const centerPos = (size - centerSize) / 2;
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath();
  ctx.roundRect(centerPos, centerPos, centerSize, centerSize, 3);
  ctx.fill();

  // Raven icon in center
  ctx.fillStyle = '#ffffff';
  ctx.font = `${cellSize * 1.8}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🐦', size / 2, size / 2);

  container.appendChild(canvas);

  // Canvas centered without extra text overflow

  return canvas;
}

function isFinderPattern(row, col, gridSize) {
  // Top-left 7x7
  if (row < 7 && col < 7) {
    if (row === 0 || row === 6 || col === 0 || col === 6) return true;
  }
  // Top-right 7x7
  if (row < 7 && col >= gridSize - 7) {
    const c = col - (gridSize - 7);
    if (row === 0 || row === 6 || c === 0 || c === 6) return true;
  }
  // Bottom-left 7x7
  if (row >= gridSize - 7 && col < 7) {
    const r = row - (gridSize - 7);
    if (r === 0 || r === 6 || col === 0 || col === 6) return true;
  }
  return false;
}

function isFinderInner(row, col, gridSize) {
  // Inner ring (white) of finder patterns
  function checkInner(r, c) {
    return (r === 1 || r === 5) && c >= 1 && c <= 5 ||
           (c === 1 || c === 5) && r >= 1 && r <= 5;
  }
  if (row < 7 && col < 7) return checkInner(row, col);
  if (row < 7 && col >= gridSize - 7) return checkInner(row, col - (gridSize - 7));
  if (row >= gridSize - 7 && col < 7) return checkInner(row - (gridSize - 7), col);
  return false;
}

function isFinderCore(row, col, gridSize) {
  function checkCore(r, c) {
    return r >= 2 && r <= 4 && c >= 2 && c <= 4;
  }
  if (row < 7 && col < 7) return checkCore(row, col);
  if (row < 7 && col >= gridSize - 7) return checkCore(row, col - (gridSize - 7));
  if (row >= gridSize - 7 && col < 7) return checkCore(row - (gridSize - 7), col);
  return false;
}

/**
 * Create delivery proof data string
 */
export function createDeliveryProof(orderId) {
  const timestamp = new Date().toISOString();
  return `RAVEN|${orderId}|${timestamp}|DELIVERED`;
}
