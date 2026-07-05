import { IncomingMessage, ServerResponse } from 'http';

export type MockResponse = StaticMockResponse | DynamicMockResponse;

export type StaticMockResponse = {
  status: number
  body?: any
  headers?: { [s: string]: string | string[] | undefined }
};

export type DynamicMockResponse = (req: IncomingMessage, res: ServerResponse, requestBody?: any) => void | Promise<void>
