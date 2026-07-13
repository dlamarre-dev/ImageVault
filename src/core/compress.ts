/**
 * Opportunistic gzip compression using the platform streams API
 * (CompressionStream / DecompressionStream), available in modern browsers and
 * Node ≥ 18. The wire format is gzip (RFC 1952) so the Python reference decoder
 * can inflate with its standard library.
 */

async function pipeThrough(
  data: Uint8Array,
  stream: GenericTransformStream,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(data);
  void writer.close();
  const buf = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buf);
}

export function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(data, new CompressionStream('gzip'));
}

export function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(data, new DecompressionStream('gzip'));
}

/**
 * Compress `data`, but only keep the result if it is actually smaller.
 * Returns whether compression was applied so the caller can record a flag.
 */
export async function compressOpportunistic(
  data: Uint8Array,
): Promise<{ data: Uint8Array; compressed: boolean }> {
  const gz = await gzipCompress(data);
  return gz.length < data.length ? { data: gz, compressed: true } : { data, compressed: false };
}
