import {afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import * as child_process from 'child_process';
import { ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { CreateMockResponsesRequest, MockResponse, NodeTestServer, ReceivedRequest } from '../main';
import { deleteRequest, getRequest, OtherParams, postRequest, verifyCorsHeaders, wait } from './test-utils';

const ENDPOINT_MOCK_RESPONSES = '/_/mock-responses';
const ENDPOINT_RECEIVED_REQUESTS = '/_/received-requests';
const ENDPOINT_RECEIVED_REQUESTS_COUNT = '/_/received-requests/count';

const waitTimeInMs = 200;

describe('node-test-server integration test', () => {
  let host: string;
  let subject: NodeTestServer;

  beforeEach(() => {
    host = 'http://localhost:8080';
    subject = new NodeTestServer();
    subject['mockResponses'] = {
      '/resources': {
        'POST': {
          mode: 'REPEAT',
          nextResponseIndex: 0,
          mockResponses: [
            (req: IncomingMessage, res: ServerResponse, requestBody) => {
              res.writeHead(201, {
                'Location': '/resources/123',
                'Content-Type': 'application/json'
              });
              res.write(JSON.stringify(requestBody));
              res.end();
            }
          ]
        }
      },
      '/resources/1': {
        'GET': {
          mode: 'REPEAT',
          nextResponseIndex: 0,
          mockResponses: [
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json'
              },
              body: {
                foo: 'bar',
                baz: 321
              }
            },
            {
              status: 404
            }
          ]
        },
        'DELETE': {
          mode: 'ONCE',
          nextResponseIndex: 0,
          mockResponses: [
            {
              status: 204
            }
          ]
        }
      },
      '/resources/2': {
        'GET': {
          mode: 'ONCE',
          nextResponseIndex: 0,
          mockResponses: [
            {
              status: 404
            }
          ]
        },
        'DELETE': {
          mode: 'ONCE',
          nextResponseIndex: 1,
          mockResponses: [
            {
              status: 204
            }
          ]
        }
      },
      '/plaintext': {
        'GET': {
          mode: 'REPEAT',
          nextResponseIndex: 0,
          mockResponses: [
            {
              status: 200,
              body: 'Hello World 123!'
            }
          ]
        }
      }
    };

    subject['receivedRequests'] = {
      '/resources/2': {
        'DELETE': [
          {
            method: 'DELETE',
            path: '/resources/2',
            headers: {
              'Content-Type': 'application/json'
            },
            queryParameters: {
              foo: 'bar'
            },
            body: {
              baz: 125
            }
          }
        ]
      }
    };

    subject.startServer();
  });

  afterEach(async () => {
    await subject.stopServer();
    await wait(waitTimeInMs);
  });

  describe('POST stop', () => {
    it('should stop the server and return the process PID', async () => {
      await subject.stopServer();
      const pathToExecutable: string = path.join(__dirname, '..', '..', 'dist', 'main', 'bin.js');
      if (!fs.existsSync(pathToExecutable)) {
        throw new Error(`File does not exist: ${pathToExecutable}`);
      }

      const childProcess: ChildProcessWithoutNullStreams = child_process.spawn('node',
        [pathToExecutable], {
          env: { ...process.env }
        });

      const promiseForChildProcess: Promise<number> = new Promise<number>(resolve => {
        childProcess.on('exit', (exitCode: number) => {
          resolve(exitCode);
        });
      });

      await wait(waitTimeInMs);

      const response: Response = await postRequest(`${host}/_/stop`);
      expect(response.status).toBe(202);
      verifyCorsHeaders(response.headers);
      expect(response.headers.get('Content-Type')).toEqual('text/plain');
      expect(await response.text()).toEqual(`${childProcess.pid}`);

      const processResult: number = await promiseForChildProcess;
      expect(processResult).toEqual(0);
    });
  });

  describe('GET heartbeat and return the process PID', () => {
    it('should return heartbeat', async () => {
      const response: Response = await getRequest(`${host}/_/heartbeat`);
      expect(subject['receivedRequests']['/_/heartbeat']).toBeUndefined();
      expect(response.status).toBe(200);
      verifyCorsHeaders(response.headers);
      expect(response.headers.get('Content-Type')).toEqual('text/plain');
      expect(await response.text()).toEqual(`${process.pid}`);
    });
  });

  describe('POST mock responses', () => {
    let requestBody: CreateMockResponsesRequest;

    beforeEach(() => {
      requestBody = {
        mockRequest: {
          path: '/',
          method: 'GET'
        },
        mockResponses: [
          {
            status: 200,
            headers: {
              'Content-Type': 'text/plain'
            },
            body: 'Hello World!'
          }
        ],
        mode: 'REPEAT'
      };
    });

    it('should create new mock responses', async () => {
      const response: Response = await postRequest(`${host}${ENDPOINT_MOCK_RESPONSES}`, { body: requestBody });
      expect(subject['receivedRequests'][ENDPOINT_MOCK_RESPONSES]).toBeUndefined();
      expect(response.status).toBe(204);
      verifyCorsHeaders(response.headers);

      const mockResponseContainer = subject['mockResponses']['/']['GET'];
      expect(mockResponseContainer).toBeDefined();
      expect(mockResponseContainer.mode).toEqual('REPEAT');
      expect(mockResponseContainer.nextResponseIndex).toBe(0);

      const mockResponses: MockResponse[] = mockResponseContainer.mockResponses;
      expect(mockResponses).toHaveLength(1);
      expect(mockResponses[0]).toEqual({
        status: 200,
        headers: {
          'Content-Type': 'text/plain'
        },
        body: 'Hello World!'
      });
    });

    it('should replace existing mock responses', async () => {
      requestBody.mockRequest.path = '/resources/1';
      const response: Response = await postRequest(`${host}${ENDPOINT_MOCK_RESPONSES}`, { body: requestBody });
      expect(subject['receivedRequests'][ENDPOINT_MOCK_RESPONSES]).toBeUndefined();
      expect(response.status).toBe(204);
      verifyCorsHeaders(response.headers);

      const mockResponseContainer = subject['mockResponses']['/resources/1']['GET'];
      expect(mockResponseContainer).toBeDefined();
      expect(mockResponseContainer.mode).toEqual('REPEAT');
      expect(mockResponseContainer.nextResponseIndex).toBe(0);

      const mockResponses: MockResponse[] = mockResponseContainer.mockResponses;
      expect(mockResponses).toHaveLength(1);
      expect(mockResponses[0]).toEqual({
        status: 200,
        headers: {
          'Content-Type': 'text/plain'
        },
        body: 'Hello World!'
      });
    });
  });

  describe('DELETE mock responses', () => {
    it('should delete all existing mock responses', async () => {
      const response: Response = await deleteRequest(`${host}${ENDPOINT_MOCK_RESPONSES}`);
      expect(subject['receivedRequests'][ENDPOINT_MOCK_RESPONSES]).toBeUndefined();
      expect(response.status).toBe(204);
      verifyCorsHeaders(response.headers);
      expect(subject['mockResponses']).toEqual({});
    });
  });

  describe('GET received requests', () => {
    it('should return existing received requests', async () => {
      const response: Response = await getRequest(`${host}${ENDPOINT_RECEIVED_REQUESTS}`, {
        query: {
          path: '/resources/2',
          method: 'DELETE'
        }
      });
      expect(subject['receivedRequests'][ENDPOINT_RECEIVED_REQUESTS]).toBeUndefined();
      expect(response.status).toBe(200);
      verifyCorsHeaders(response.headers);
      expect(response.headers.get('Content-Type')).toEqual('application/json');
      expect(await response.json()).toEqual([
        {
          method: 'DELETE',
          path: '/resources/2',
          headers: {
            'Content-Type': 'application/json'
          },
          queryParameters: {
            foo: 'bar'
          },
          body: {
            baz: 125
          }
        }
      ]);
    });

    it('should return empty array when no requests were received', async () => {
      const response: Response = await getRequest(`${host}${ENDPOINT_RECEIVED_REQUESTS}`, {
        query: {
          path: '/resources/1',
          method: 'GET'
        }
      });
      expect(subject['receivedRequests'][ENDPOINT_RECEIVED_REQUESTS]).toBeUndefined();
      expect(response.status).toBe(200);
      verifyCorsHeaders(response.headers);
      expect(response.headers.get('Content-Type')).toEqual('application/json');
      expect(await response.json()).toEqual([]);
    });
  });

  describe('DELETE received requests', () => {
    it('should delete all existing received requests', async () => {
      const response: Response = await deleteRequest(`${host}${ENDPOINT_RECEIVED_REQUESTS}`);
      expect(subject['receivedRequests'][ENDPOINT_RECEIVED_REQUESTS]).toBeUndefined();
      expect(response.status).toBe(204);
      verifyCorsHeaders(response.headers);
      expect(subject['receivedRequests']).toEqual({});
    });
  });

  describe('GET received requests', () => {
    const threeReceivedRequests = {
      '/resources/1': {
        'GET': [
          {
            method: 'GET',
            path: '/resources/1',
            headers: {},
            queryParameters: {}
          },
          {
            method: 'GET',
            path: '/resources/1',
            headers: {},
            queryParameters: {}
          }
        ]
      },
      '/resources/2': {
        'DELETE': [
          {
            method: 'DELETE',
            path: '/resources/2',
            headers: {
              'Content-Type': 'application/json'
            },
            queryParameters: {
              foo: 'bar'
            },
            body: {
              baz: 125
            }
          }
        ]
      }
    };
    const fiveReceivedRequests = {
      ...threeReceivedRequests,
      '/': {
        'POST': [
          {
            method: 'POST',
            path: '/',
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              foo: 'bar'
            }
          },
          {
            method: 'POST',
            path: '/',
            headers: {
              'Content-Type': 'text/plain'
            },
            body: 'Hello World!'
          }
        ]
      }
    };

    it.each([
      [{}, 0],
      [undefined, 1],
      [threeReceivedRequests, 3],
      [fiveReceivedRequests, 5]
    ])('should calculate and return number of received requests correctly (%d)',
      async (receivedRequests, expectedCount) => {
        if (receivedRequests !== undefined) {
          subject['receivedRequests'] = receivedRequests as {
            [path: string]: {
              [method: string]: ReceivedRequest[]
            }
          };
        }

        const response: Response = await getRequest(`${host}${ENDPOINT_RECEIVED_REQUESTS_COUNT}`);
        expect(subject['receivedRequests'][ENDPOINT_RECEIVED_REQUESTS_COUNT]).toBeUndefined();
        expect(response.status).toBe(200);
        verifyCorsHeaders(response.headers);
        expect(response.headers.get('Content-Type')).toEqual('text/plain');
        expect(await response.text()).toEqual(`${expectedCount}`);
      });
  });

  describe('Verify if requests are captured and answered correctly', () => {
    it('should not send plaintext response bodies as JSON', async () => {
      const response: Response = await getRequest(`${host}/plaintext`);

      expect(response.status).toBe(200);
      expect(await response.text()).toEqual('Hello World 123!');

      const receivedRequests: ReceivedRequest[] = subject['receivedRequests']['/plaintext']['GET'];
      expect(receivedRequests).toBeDefined();
      expect(receivedRequests).toHaveLength(1);
      expect(receivedRequests[0].path).toEqual('/plaintext');
      expect(receivedRequests[0].method).toEqual('GET');
    });


    it('should send correct answer when dynamic mock response is defined', async () => {
      const otherParams: OtherParams = {
        query: {
          q1: 'test',
          q2: '123'
        },
        headers: {
          'X-MyHeader': 'MyValue'
        },
        body: {
          foo: 'bar',
          baz: 122
        }
      };

      // send first request
      let response: Response = await postRequest(`${host}/resources`, otherParams);

      // verify if the correct mock response was sent correctly
      expect(response.status).toBe(201);
      expect(response.headers.get('Location')).toEqual('/resources/123');
      expect(response.headers.get('Content-Type')).toEqual('application/json');
      expect(await response.json()).toEqual(otherParams.body); // mock response echoes the request body

      // verify if request was captured correctly
      let receivedRequests: ReceivedRequest[] = subject['receivedRequests']['/resources']['POST'];
      expect(receivedRequests).toBeDefined();
      expect(receivedRequests).toHaveLength(1);
      let request: ReceivedRequest = receivedRequests[0];
      expect(request.path).toEqual('/resources');
      expect(request.method).toEqual('POST');
      expect(request.headers['x-myheader']).toEqual('MyValue');
      expect(request.queryParameters).toEqual(otherParams.query!);
      expect(request.body).toEqual(otherParams.body);

      // send second request
      otherParams.body = {
        hello: 'world',
        some: {
          values: [123, 456, 789]
        }
      };
      delete otherParams.headers;
      delete otherParams.query;
      response = await postRequest(`${host}/resources`, otherParams);

      // verify if the mock response was sent correctly
      expect(response.status).toBe(201);
      expect(response.headers.get('Location')).toEqual('/resources/123');
      expect(response.headers.get('Content-Type')).toEqual('application/json');
      expect(await response.json()).toEqual(otherParams.body); // mock response echoes the request body

      // verify if request was captured correctly
      receivedRequests = subject['receivedRequests']['/resources']['POST'];
      expect(receivedRequests).toBeDefined();
      expect(receivedRequests).toHaveLength(2);
      expect(receivedRequests[0]).toEqual(request);
      request = receivedRequests[1];
      expect(request.path).toEqual('/resources');
      expect(request.method).toEqual('POST');
      expect(request.headers['x-myheader']).toBeUndefined();
      expect(request.queryParameters).toEqual({});
    });

    it('should send correct answer when multiple static mock responses are defined', async () => {
      const otherParams: OtherParams = {
        query: {
          hello: 'world',
          test: '123'
        },
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'jest integration test'
        }
      };

      let response: Response;
      let receivedRequests: ReceivedRequest[];
      let request: ReceivedRequest;
      let isOkResponse: boolean; // response codes 202 and 404 are alternating

      for (let i: number = 1; i <= 10; i++) {
        isOkResponse = i % 2 === 1;
        response = await getRequest(`${host}/resources/1`, otherParams);

        // verify if the mock response was sent correctly
        if (isOkResponse) {
          expect(response.status).toBe(200);
          expect(response.headers.get('Content-Type')).toEqual('application/json');
          expect(await response.json()).toEqual({
            foo: 'bar',
            baz: 321
          });
        } else {
          expect(response.status).toBe(404);
          expect(response.headers.get('Content-Type')).toBeNull();
          expect(await response.text()).toEqual('');
        }

        // verify if request was captured correctly
        receivedRequests = subject['receivedRequests']['/resources/1']['GET'];
        expect(receivedRequests).toBeDefined();
        expect(receivedRequests).toHaveLength(i);

        for (let k: number = 0; k < i; k++) {
          request = receivedRequests[k];
          expect(request.path).toEqual('/resources/1');
          expect(request.method).toEqual('GET');
          expect(request.headers['accept']).toEqual('application/json');
          expect(request.headers['user-agent']).toEqual('jest integration test');
          expect(request.queryParameters).toEqual({
            hello: 'world',
            test: '123'
          });
        }
      }
    });

    it(
      'should capture the request and respond with 500 INTERNAL SERVER ERROR, when all mock responses have been sent and mode is ONCE',
      async () => {
        const otherParams: OtherParams = {
          query: {
            hello: 'world',
            test: '123'
          },
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'jest integration test'
          }
        };
        const response: Response = await deleteRequest(`${host}/resources/2`, otherParams);
        expect(response.status).toBe(500);

        // verify if request was captured correctly
        const receivedRequests: ReceivedRequest[] = subject['receivedRequests']['/resources/2']['DELETE'];
        expect(receivedRequests).toBeDefined();
        expect(receivedRequests).toHaveLength(2);
        // first received request (from arranged test data)
        expect(receivedRequests[0]).toEqual({
          method: 'DELETE',
          path: '/resources/2',
          headers: {
            'Content-Type': 'application/json'
          },
          queryParameters: {
            foo: 'bar'
          },
          body: {
            baz: 125
          }
        });
        // second received request from this test
        const request: ReceivedRequest = receivedRequests[1];
        expect(request.path).toEqual('/resources/2');
        expect(request.method).toEqual('DELETE');
        expect(request.headers['accept']).toEqual('application/json');
        expect(request.headers['user-agent']).toEqual('jest integration test');
        expect(request.queryParameters).toEqual({
          hello: 'world',
          test: '123'
        });
      });

    it(
      'should capture the request and respond with 500 INTERNAL SERVER ERROR, when no mock response is provided for the path/method combination',
      async () => {
        const otherParams: OtherParams = {
          query: {
            hello: 'world',
            test: '123'
          },
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'jest integration test'
          }
        };
        const response: Response = await getRequest(`${host}/resources`, otherParams);
        expect(response.status).toBe(500);

        // verify if request was captured correctly
        const receivedRequests: ReceivedRequest[] = subject['receivedRequests']['/resources']['GET'];
        expect(receivedRequests).toBeDefined();
        expect(receivedRequests).toHaveLength(1);
        // second received request from this test
        const request: ReceivedRequest = receivedRequests[0];
        expect(request.path).toEqual('/resources');
        expect(request.method).toEqual('GET');
        expect(request.headers['accept']).toEqual('application/json');
        expect(request.headers['user-agent']).toEqual('jest integration test');
        expect(request.queryParameters).toEqual({
          hello: 'world',
          test: '123'
        });
      });
  });
});


