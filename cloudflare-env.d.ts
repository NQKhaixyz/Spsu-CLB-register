declare namespace Cloudflare {
  interface Env {
    CLUB_OWNER_EMAIL?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
