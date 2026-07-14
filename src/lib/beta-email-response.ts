export type BetaEmailResponse = {
  ok?: boolean;
  sent?: boolean;
};

/** A beta request is a UI success only when the API confirms delivery. */
export function betaInviteWasSent(
  responseOk: boolean,
  data: BetaEmailResponse,
): boolean {
  return responseOk && data.ok === true && data.sent === true;
}
