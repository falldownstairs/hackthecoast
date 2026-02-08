import sharp from "sharp";

/**
 * Compute a perceptual hash (pHash) for an image buffer.
 *
 * Steps:
 * 1. Resize to 32×32 greyscale
 * 2. Compute a simplified DCT (top-left 8×8 coefficients)
 * 3. Calculate the median of those 64 values
 * 4. Generate a 64-bit hash string where each bit is 1 if the coefficient >= median
 */
export async function computeHash(imageBuffer: Buffer): Promise<string> {
  // Resize to 32x32 greyscale
  const { data, info } = await sharp(imageBuffer)
    .resize(32, 32, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const size = info.width; // 32
  const pixels: number[] = Array.from(data);

  // Compute simplified DCT for the top-left 8×8 block
  const dctSize = 8;
  const dctValues: number[] = [];

  for (let u = 0; u < dctSize; u++) {
    for (let v = 0; v < dctSize; v++) {
      let sum = 0;
      for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
          sum +=
            pixels[x * size + y] *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size));
        }
      }
      dctValues.push(sum);
    }
  }

  // Exclude the DC component (index 0) for median calculation
  const dctWithoutDC = dctValues.slice(1);
  const sorted = [...dctWithoutDC].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;

  // Build the hash: 1 if value >= median, else 0
  const hashBits = dctValues.map((val) => (val >= median ? "1" : "0")).join("");
  return hashBits;
}

/**
 * Calculate the Hamming distance between two hash strings.
 * Each position where the characters differ counts as 1.
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error("Hashes must be the same length");
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++;
    }
  }
  return distance;
}

/**
 * Compare two image buffers and return the Hamming distance.
 */
export async function compareHashes(
  imageBuffer1: Buffer,
  imageBuffer2: Buffer
): Promise<number> {
  const [hash1, hash2] = await Promise.all([
    computeHash(imageBuffer1),
    computeHash(imageBuffer2),
  ]);
  return hammingDistance(hash1, hash2);
}
