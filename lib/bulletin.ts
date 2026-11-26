export const bulletinTitleLimit = 120;
export const bulletinContentLimit = 8000;

export type BulletinPost = {
  id: string;
  title: string;
  content: string;
  revision: number;
};
