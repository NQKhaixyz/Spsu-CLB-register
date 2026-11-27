export const avatarPhotoId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export const maxAvatarBytes = 256 * 1024;
export const avatarEndpoint = "/api/avatar";
export const avatarKey = (id: string) => `member-avatars/${id}.jpg`;
