type Database = {
  prepare(sql: string): {
    bind(...values: (string | number | null)[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
    };
  };
};
type Row = {
  key: string;
  size: number;
  content_type: string;
  captured_at: string;
  chunks: number;
};
const CHUNK_SIZE = 128 * 1024;
const MAX_SIZE = 4 * 1024 * 1024;
const validKey = (key: string) =>
  /^(?:workspace|guest:[a-f0-9]{64})\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|webm|mp4)$/.test(
    key,
  );
function metadata(row: Row) {
  return {
    size: row.size,
    httpMetadata: { contentType: row.content_type },
    customMetadata: { capturedAt: row.captured_at },
  };
}
export class DatabaseMedia {
  constructor(private readonly database: Database) {}

  private async row(key: string) {
    if (!validKey(key)) throw new Error('Invalid evidence path.');
    return this.database
      .prepare('SELECT * FROM desk_media_objects WHERE key = ? AND ready = 1')
      .bind(key)
      .first<Row>();
  }

  async head(key: string) {
    const row = await this.row(key);
    return row ? metadata(row) : null;
  }

  async put(
    key: string,
    bytes: Uint8Array,
    options: {
      httpMetadata: { contentType: string };
      customMetadata: { capturedAt: string };
    },
  ) {
    if (
      !validKey(key) ||
      !bytes.length ||
      bytes.length > MAX_SIZE ||
      !['image/jpeg', 'video/webm', 'video/mp4'].includes(
        options.httpMetadata.contentType,
      ) ||
      !/^\d{13}$/.test(options.customMetadata.capturedAt)
    )
      throw new Error('Invalid camera evidence.');
    const chunks = Math.ceil(bytes.length / CHUNK_SIZE);
    await this.database
      .prepare(
        'INSERT INTO desk_media_objects (key,size,content_type,captured_at,chunks,ready,created_at) VALUES (?,?,?,?,?,0,?)',
      )
      .bind(
        key,
        bytes.length,
        options.httpMetadata.contentType,
        options.customMetadata.capturedAt,
        chunks,
        Date.now(),
      )
      .run();
    for (let sequence = 0; sequence < chunks; sequence++) {
      const data = Buffer.from(
        bytes.subarray(sequence * CHUNK_SIZE, (sequence + 1) * CHUNK_SIZE),
      ).toString('base64');
      await this.database
        .prepare(
          'INSERT INTO desk_media_chunks (object_key,sequence,data) VALUES (?,?,?)',
        )
        .bind(key, sequence, data)
        .run();
    }
    await this.database
      .prepare(
        'UPDATE desk_media_objects SET ready = 1 WHERE key = ? AND chunks = (SELECT COUNT(*) FROM desk_media_chunks WHERE object_key = ?)',
      )
      .bind(key, key)
      .run();
  }

  async get(key: string) {
    const row = await this.row(key);
    if (!row) return null;
    let sequence = 0;
    let consumed = 0;
    const database = this.database;
    return {
      ...metadata(row),
      body: new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (sequence === row.chunks) {
            if (consumed !== row.size)
              controller.error(new Error('Incomplete camera evidence.'));
            else controller.close();
            return;
          }
          const chunk = await database
            .prepare(
              'SELECT data FROM desk_media_chunks WHERE object_key = ? AND sequence = ?',
            )
            .bind(key, sequence++)
            .first<{ data: string }>();
          if (!chunk) {
            controller.error(new Error('Incomplete camera evidence.'));
            return;
          }
          const bytes = Buffer.from(chunk.data, 'base64');
          consumed += bytes.length;
          if (consumed > row.size) {
            controller.error(new Error('Invalid camera evidence length.'));
            return;
          }
          controller.enqueue(bytes);
        },
      }),
    };
  }
}
