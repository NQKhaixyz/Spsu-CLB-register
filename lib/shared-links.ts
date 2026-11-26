export type SharedLink = {
  id: string;
  title: string;
  url: string;
  description: string;
  updatedAt: string;
};

export function sharedLinkUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch {
    // The form reports invalid or incomplete URLs.
  }
  return null;
}
