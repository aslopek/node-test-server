import fs from 'fs';
import * as http from 'http';
import { IncomingMessage, RequestListener, Server, ServerResponse } from 'http';
import * as https from 'https';
import * as querystring from 'querystring';
import { MgmtEndpoint, mgmtEndpoints, NodeTestServerMgmt } from './node-test-server-mgmt';
import { BulkRequest } from './types/bulk-request';
import { Method } from './types/method.type';
import { MockRequest } from './types/mock-request.type';
import { MockResponse } from './types/mock-response.type';
import { NodeTestServerConfig } from './types/node-test-server-config.type';
import { ReceivedRequest } from './types/received-request.type';
import { ResponseMode } from './types/response-mode.type';

type MockResponseContainer = {
  mode: ResponseMode
  nextResponseIndex: number
  mockResponses: MockResponse[]
}

const DEFAULT_PORT = 8080;
export const MAX_REQUEST_BODY_SIZE_BYTES = 10 * 1024 * 1024;

export class NodeTestServer {

  private mockResponses: {
    [path: string]: {
      [method: string]: MockResponseContainer
    }
  };

  private receivedRequests: {
    [path: string]: {
      [method: string]: ReceivedRequest[]
    }
  };

  private server: http.Server | https.Server | null;

  private management: NodeTestServerMgmt | null;

  private exitProcessOnStop: boolean;

  private readonly requestListener: RequestListener;

  constructor() {
    this.mockResponses = {};
    this.receivedRequests = {};
    this.server = null;
    this.management = null;
    this.exitProcessOnStop = false;

    this.requestListener = (req: IncomingMessage, res: ServerResponse) => {
      let body: any = undefined;
      let bodySize = 0;
      let bodyRejected = false;

      req.on('error', (error: Error) => {
        console.error(`node-test-server: request error - ${error.message}`);
      });
      res.on('error', (error: Error) => {
        console.error(`node-test-server: response error - ${error.message}`);
      });

      req.on('data', (chunk: Buffer) => {
        if (bodyRejected) {
          return;
        }

        bodySize += chunk.length;
        if (bodySize > MAX_REQUEST_BODY_SIZE_BYTES) {
          bodyRejected = true;
          res.writeHead(413);
          res.end();
          req.destroy();
          return;
        }

        body ??= '';
        body += chunk;
      });

      req.on('end', () => {
        if (bodyRejected) {
          return;
        }

        const contentType: string | string[] | undefined = req.headers['content-type'];
        if (contentType === 'application/json') {
          try {
            body = JSON.parse(body ?? '');
          } catch (error) {
            res.writeHead(400);
            res.end();
            return;
          }
        }
        this.handleRequest(req, res, body);
      });
    };
  }

  shouldExitProcessOnStop(): boolean {
    return this.exitProcessOnStop;
  }

  getReceivedRequests(path: string, method: Method, remove: boolean = false): ReceivedRequest[] {
    const requests: ReceivedRequest[] = this.receivedRequests[path]?.[method] ?? [];
    if (remove) {
      this.resetReceivedRequests(path, method);
    }
    return requests;
  }

  getNumberOfReceivedRequests(): number {
    let sum = 0;
    Object.entries(this.receivedRequests).forEach(([, value]) => {
      Object.entries(value).forEach(([, receivedRequests]) => {
        sum += receivedRequests.length;
      });
    });
    return sum;
  }

  resetMockResponses(path?: string, method?: Method): void {
    if (path != null) {
      if (method != null) {
        if (this.mockResponses[path] != null) {
          delete this.mockResponses[path][method];
        }
      } else {
        delete this.mockResponses[path];
      }
    } else {
      this.mockResponses = {};
    }
  }

  resetReceivedRequests(path?: string, method?: Method): void {
    if (path != null) {
      if (method != null) {
        if (this.receivedRequests[path] != null) {
          delete this.receivedRequests[path][method];
        }
      } else {
        delete this.receivedRequests[path];
      }
    } else {
      this.receivedRequests = {};
    }
  }

  setMockResponses(mockRequest: MockRequest, mockResponses: MockResponse[], mode: ResponseMode): void {
    this.mockResponses[mockRequest.path] ??= {};
    this.mockResponses[mockRequest.path][mockRequest.method] = {
      mode,
      nextResponseIndex: 0,
      mockResponses
    };
  }

  setMockResponsesBulk(bulk: BulkRequest[]): void {
    bulk.forEach(([mockRequest, mockResponses, mode]) => {
      this.setMockResponses(mockRequest, mockResponses, mode);
    });
  }

  startServer(config?: NodeTestServerConfig): void {
    if (this.server != null) {
      throw new Error('NodeTestServer already running');
    }

    if (config?.https !== undefined) {
      if (!fs.existsSync(config.https.key) || !fs.existsSync(config.https.crt)) {
        throw new Error(
          `Key or path are missing, check configuration - key: ${config.https.key}, cert: ${config.https.crt}`);
      }

      const options: https.ServerOptions = {
        cert: fs.readFileSync(config.https.crt),
        key: fs.readFileSync(config.https.key)
      };
      this.server = https.createServer(options, this.requestListener);
    } else {
      this.server = http.createServer(this.requestListener);
    }

    this.management = new NodeTestServerMgmt(this);
    this.exitProcessOnStop = config?.exitProcessOnStop ?? false;
    const port: number = config?.port ?? DEFAULT_PORT;
    console.log(`node-test-server listening on ${config?.https === undefined ? 'http' : 'https'} port ${port}`);
    this.server.listen(port);
  }

  async stopServer(): Promise<void> {
    if (this.server != null) {
      const _server: Server = this.server;
      return new Promise<void>(resolve => {
        _server.closeAllConnections();
        _server.close(() => {
          this.server = null;
          this.management = null;
          resolve();
        });
      });
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse, requestBody: any): Promise<void> {
    const [path, ...rest] = (req.url ?? '').split('?');
    const method: Method = req.method as Method;
    const query: string = rest.join('&');
    const receivedRequest: ReceivedRequest = {
      method: method,
      path: path,
      headers: req.headers as { [s: string]: string },
      queryParameters: querystring.parse(query) as { [s: string]: string },
      body: requestBody
    };

    console.log(`RECEIVED REQUEST ${method} ${path}`);
    if (mgmtEndpoints.includes(receivedRequest.path as MgmtEndpoint)) {
      return this.management!.handleMgmtRequest(receivedRequest, res);
    }
    this.receivedRequests[path] ??= {};
    this.receivedRequests[path][method] ??= [];
    this.receivedRequests[path][method].push(receivedRequest);

    const mockResponseContainer: MockResponseContainer | undefined = this.mockResponses[receivedRequest.path]?.[receivedRequest.method];

    // There is no mock response defined for the given path/method combination
    if (mockResponseContainer === undefined || mockResponseContainer.mockResponses.length === 0) {
      res.writeHead(500);
      res.end();
      return;
    }

    // Mode is ONCE and all available mock responses have been sent => no more mock responses available
    const mockResponses: MockResponse[] = mockResponseContainer.mockResponses;
    const nextResponseIndex: number = mockResponseContainer.nextResponseIndex;
    if (mockResponseContainer.mode === 'ONCE' && nextResponseIndex >= mockResponses.length) {
      res.writeHead(500);
      res.end();
      return;
    }

    const mockResponse: MockResponse = mockResponses[nextResponseIndex];
    const isLastResponseObject: boolean = nextResponseIndex === mockResponses.length - 1;
    if (isLastResponseObject && mockResponseContainer.mode === 'REPEAT') {
      // Restart from the beginning if mode is REPEAT and last response will be sent now
      mockResponseContainer.nextResponseIndex = 0;
    } else {
      // In all other cases, increase index by one
      mockResponseContainer.nextResponseIndex++;
    }

    if (typeof mockResponse === 'function') {
      await mockResponse(req, res, requestBody);
    } else {
      res.writeHead(mockResponse.status, { ...mockResponse.headers });
      await new Promise<void>(resolve => {
        if (mockResponse.body != null) {
          if (typeof mockResponse.body === 'string') {
            res.write(mockResponse.body);
          } else {
            res.write(JSON.stringify(mockResponse.body));
          }
        }
        res.end(() => resolve());
      });
    }
  }
}
