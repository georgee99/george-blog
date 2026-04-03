import { Pool } from 'pg';

// Reuse the pool across warm Lambda invocations
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1, // Lambda: keep connection count low
    });
  }
  return pool;
}

export interface CreatedComment {
  id: string;
  post_slug: string;
  author_name: string;
  body: string;
  created_at: Date;
}

export async function insertComment(
  postSlug: string,
  authorName: string,
  body: string,
): Promise<CreatedComment> {
  const result = await getPool().query<CreatedComment>(
    `INSERT INTO comments (id, post_slug, author_name, body, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, NOW())
     RETURNING id, post_slug, author_name, body, created_at`,
    [postSlug, authorName, body],
  );
  return result.rows[0];
}
