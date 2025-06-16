export class Utils {
  static async fetchData<T = unknown>(
    url: string,
    init?: RequestInit,
  ): Promise<T | null> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      return null;
    }

    const body = await response.text();

    try {
      return JSON.parse(body) as T;
    } catch {
      return body as T;
    }
  }
}
