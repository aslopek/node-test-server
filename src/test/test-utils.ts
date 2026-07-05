import {expect} from '@jest/globals';

export type OtherParams = {
  headers?: { [s: string]: string },
  query?: { [s: string]: string },
  body?: any
};

export function verifyCorsHeaders(headers: Headers): void {
  expect(headers.get('Access-Control-Allow-Origin')).toEqual('*');
  expect(headers.get('Access-Control-Allow-Credentials')).toEqual('true');
}

export async function getRequest(url: string, otherParams?: Omit<OtherParams, 'body'>): Promise<Response> {
  const options: RequestInit = requestOptions(otherParams);
  options.method = 'GET';
  return fetch(urlWithQueryParams(url, otherParams?.query), options);
}

export async function deleteRequest(url: string, otherParams?: OtherParams): Promise<Response> {
  const options: RequestInit = requestOptions(otherParams);
  options.method = 'DELETE';
  return fetch(urlWithQueryParams(url, otherParams?.query), options);
}

export async function postRequest(url: string, otherParams?: OtherParams): Promise<Response> {
  const options: RequestInit = requestOptions(otherParams);
  options.method = 'POST';
  return fetch(urlWithQueryParams(url, otherParams?.query), options);
}

function urlWithQueryParams(url: string, queryParams?: { [s: string]: string }): string {
  if (queryParams !== undefined) {
    return `${url}?` + new URLSearchParams(queryParams);
  } else {
    return url;
  }
}

function requestOptions(otherParams?: OtherParams): RequestInit {
  const headers: Record<string, string> = {
    ...otherParams?.headers ?? {}
  };

  const options: RequestInit = {
    headers: headers,
  };

  if (otherParams?.body != null) {
    if (typeof otherParams.body === 'object') {
      options.body = JSON.stringify(otherParams.body);
      headers['Content-Type'] = 'application/json';
    } else {
      options.body = otherParams.body;
    }
  }
  return options;
}

export async function wait(milliseconds: number): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(() => resolve(), milliseconds);
  });
}
