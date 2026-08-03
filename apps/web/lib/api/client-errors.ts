export async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } } | undefined;
    return body?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}
