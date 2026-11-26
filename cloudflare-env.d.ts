declare namespace Cloudflare {
  interface Env {
    INITIAL_ADMIN_PASSWORD?: string;
    INITIAL_MEMBER_PASSWORD?: string;
    CLUB_OWNER_EMAIL?: string;
    YOUTUBE_API_KEY?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
