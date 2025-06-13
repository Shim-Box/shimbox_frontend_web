export function saveTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
}
export function getAccessToken(): string | null {
  return localStorage.getItem("accessToken");
}
