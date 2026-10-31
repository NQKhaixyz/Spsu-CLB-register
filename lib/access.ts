export function canInitializeClub(
  ownerEmail: string | undefined,
  visitorEmail: string,
) {
  const owner = ownerEmail?.trim().toLowerCase();
  return !!owner && owner === visitorEmail.trim().toLowerCase();
}
