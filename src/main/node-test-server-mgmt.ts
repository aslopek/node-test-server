import { ServerResponse } from 'http';
import { NodeTestServer } from './node-test-server';
import { CreateMockResponsesRequest } from './types/create-mock-responses-request.type';
import { Method, methods } from './types/method.type';
import { StaticMockResponse } from './types/mock-response.type';
import { ReceivedRequest } from './types/received-request.type';
import { responseModes } from './types/response-mode.type';

export const mgmtEndpoints = [
  '/_/stop',
  '/_/heartbeat',
  '/_/mock-responses',
  '/_/received-requests',
  '/_/received-requests/count'
] as const;

export type MgmtEndpoint = typeof mgmtEndpoints[number];

const corsHeader = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true'
} as const;

export class NodeTestServerMgmt {

  constructor(private nodeMockServer: NodeTestServer) {
  }

  async handleMgmtRequest(req: ReceivedRequest, res: ServerResponse): Promise<void> {
    if (!mgmtEndpoints.includes(req.path as MgmtEndpoint)) {
      return new Promise<void>(resolve => {
        res.writeHead(500, corsHeader);
        res.end(() => resolve());
      });
    }
    const path: MgmtEndpoint = req.path as MgmtEndpoint;
    const method: Method = req.method;

    if (path === '/_/stop' && method === 'POST') {
      const force: boolean = req.queryParameters.force === 'true';
      await this.stopServer(res, force);
      return;
    }

    if (path === '/_/heartbeat' && method === 'GET') {
      return this.getHeartbeat(res);
    }

    if (path === '/_/mock-responses' && method === 'POST') {
      return this.postMockResponses(req, res);
    }

    if (path === '/_/mock-responses' && method === 'DELETE') {
      return this.deleteMockResponses(res);
    }

    if (path === '/_/received-requests' && method === 'GET') {
      return this.getReceivedRequests(req, res);
    }

    if (path === '/_/received-requests' && method === 'DELETE') {
      return this.deleteReceivedRequests(res);
    }

    if (path === '/_/received-requests/count' && method === 'GET') {
      return this.getReceivedRequestsCount(res);
    }

    return new Promise<void>(resolve => {
      res.writeHead(405, corsHeader);
      res.end(() => resolve());
    });
  }

  private async stopServer(res: ServerResponse, force: boolean): Promise<void> {
    return new Promise<void>(resolve => {
      res.writeHead(202, {
        ...corsHeader,
        'Content-Type': 'text/plain'
      });
      res.write(`${process.pid}`);
      res.end(async () => {
        const exitProcess: boolean = this.nodeMockServer.shouldExitProcessOnStop();
        if (!force || !exitProcess) {
          await this.nodeMockServer.stopServer();
        }
        if (exitProcess) {
          process.exit(0);
        }
        resolve();
      });
    });
  }

  private async getHeartbeat(res: ServerResponse): Promise<void> {
    return new Promise<void>(resolve => {
      res.writeHead(200, {
        ...corsHeader,
        'Content-Type': 'text/plain'
      });
      res.write(`${process.pid}`);
      res.end(() => resolve());
    });
  }

  private async postMockResponses(req: ReceivedRequest, res: ServerResponse): Promise<void> {
    return new Promise<void>(resolve => {
      if (!isValidCreateMockResponsesRequest(req.body)) {
        res.writeHead(400, corsHeader);
        res.end(() => resolve());
        return;
      }

      const request: CreateMockResponsesRequest = req.body;
      this.nodeMockServer.setMockResponses(request.mockRequest, request.mockResponses, request.mode);
      res.writeHead(204, corsHeader);
      res.end(() => resolve());
    });
  }

  private async deleteMockResponses(res: ServerResponse): Promise<void> {
    return new Promise<void>(resolve => {
      this.nodeMockServer.resetMockResponses();
      res.writeHead(204, corsHeader);
      res.end(() => resolve());
    });
  }

  private async getReceivedRequests(req: ReceivedRequest, res: ServerResponse): Promise<void> {
    return new Promise<void>(resolve => {
      const queryPath: string = req.queryParameters.path;
      const queryMethod: Method = req.queryParameters.method as Method;
      const receivedRequests: ReceivedRequest[] = this.nodeMockServer.getReceivedRequests(queryPath, queryMethod,
        false);
      res.writeHead(200, {
        ...corsHeader,
        'Content-Type': 'application/json'
      });
      res.write(JSON.stringify(receivedRequests));
      res.end(() => resolve());
    });
  }

  private async deleteReceivedRequests(res: ServerResponse): Promise<void> {
    return new Promise<void>(resolve => {
      this.nodeMockServer.resetReceivedRequests();
      res.writeHead(204, corsHeader);
      res.end(() => resolve());
    });
  }

  private async getReceivedRequestsCount(res: ServerResponse): Promise<void> {
    return new Promise<void>(resolve => {
      res.writeHead(200, {
        ...corsHeader,
        'Content-Type': 'text/plain'
      });
      res.write(`${this.nodeMockServer.getNumberOfReceivedRequests()}`);
      res.end(() => resolve());
    });
  }
}

function isValidCreateMockResponsesRequest(body: unknown): body is CreateMockResponsesRequest {
  if (body == null || typeof body !== 'object') {
    return false;
  }

  const { mockRequest, mockResponses, mode } = body as CreateMockResponsesRequest;

  if (mockRequest == null || typeof mockRequest !== 'object') {
    return false;
  }
  if (typeof mockRequest.path !== 'string' || mockRequest.path.length === 0) {
    return false;
  }
  if (!methods.includes(mockRequest.method)) {
    return false;
  }

  if (!Array.isArray(mockResponses) || mockResponses.length === 0) {
    return false;
  }
  const allMockResponsesValid: boolean = mockResponses.every(mockResponse =>
    mockResponse != null && typeof mockResponse === 'object'
    && typeof (mockResponse as StaticMockResponse).status === 'number');
  if (!allMockResponsesValid) {
    return false;
  }

  return responseModes.includes(mode);
}