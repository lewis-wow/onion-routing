export class Utils {
  static async fetchData<T = unknown>(
    url: string,
    init?: RequestInit,
  ): Promise<{
    response: Response | null;
    data: T | null;
  }> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      return {
        response: null,
        data: null,
      };
    }

    const body = await response.text();

    let data: T;

    try {
      data = JSON.parse(body) as T;
    } catch {
      data = body as T;
    }

    return {
      response,
      data,
    };
  }

  static createURLFromNodeName(nodeName: string, ...pathname: string[]) {
    return `http://${nodeName}/${pathname.join('/')}`;
  }
}
