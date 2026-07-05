import { beforeEach, describe, expect, it } from '@jest/globals';
import { IncomingMessage, ServerResponse } from 'http';
import {
  DynamicMockResponse,
  Method,
  MockRequest,
  MockResponse,
  NodeTestServer,
  ReceivedRequest,
  StaticMockResponse
} from '../main';

describe('node-test-server', () => {
  let subject: NodeTestServer;

  beforeEach(() => {
    subject = new NodeTestServer();

    const notFound: DynamicMockResponse = (req: IncomingMessage, res: ServerResponse): void => {
      res.writeHead(404);
      res.end();
    };

    const methodNotAllowed: StaticMockResponse = {
      status: 405
    };

    let nextResourceId: number = 2;
    const postResource: DynamicMockResponse = (req: IncomingMessage, res: ServerResponse): void => {
      let body: string = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        res.writeHead(201, {
          'Location': `resources/${nextResourceId};`
        });
        nextResourceId++;
        res.write(body);
        res.end();
      });
    };

    subject['mockResponses'] = {
      '/resources': {
        'POST': {
          mode: 'REPEAT',
          nextResponseIndex: 0,
          mockResponses: [postResource]
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
                name: 'Resource 1',
                content: 'foo',
                value: 123
              }
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
        },
        'PUT': {
          mode: 'REPEAT',
          nextResponseIndex: 0,
          mockResponses: [methodNotAllowed]
        },
        'PATCH': {
          mode: 'REPEAT',
          nextResponseIndex: 0,
          mockResponses: [methodNotAllowed]
        }
      },
      '/resources/2': {
        'GET': {
          mode: 'REPEAT',
          nextResponseIndex: 0,
          mockResponses: [notFound]
        },
        'DELETE': {
          mode: 'REPEAT',
          nextResponseIndex: 0,
          mockResponses: [notFound]
        },
        'PUT': {
          mode: 'REPEAT',
          nextResponseIndex: 0,
          mockResponses: [methodNotAllowed]
        },
        'PATCH': {
          mode: 'REPEAT',
          nextResponseIndex: 0,
          mockResponses: [methodNotAllowed]
        }
      }
    };

    subject['receivedRequests'] = {
      '/resources': {
        'POST': [
          {
            method: 'POST',
            path: '/resources',
            headers: {
              'Content-Type': 'application/json'
            },
            queryParameters: {},
            body: {
              name: 'Resource 1',
              content: 'foo',
              value: 123
            }
          }
        ]
      },
      '/resources/1': {
        'DELETE': [
          {
            method: 'DELETE',
            path: '/resources/1',
            headers: {},
            queryParameters: {}
          }
        ]
      },
      '/otherResources/1': {
        'GET': [
          {
            method: 'GET',
            path: '/otherResources/1',
            headers: {},
            queryParameters: {}
          } as ReceivedRequest,
          {
            method: 'GET',
            path: '/otherResources/1',
            headers: {},
            queryParameters: {}
          } as ReceivedRequest
        ],
        'PUT': [
          {
            method: 'PUT',
            path: '/otherResources/1',
            headers: {
              'Content-Type': 'application/json'
            },
            queryParameters: {},
            body: {
              foo: 'bar',
              baz: 123
            }
          }
        ]
      }
    };
  });

  describe('get received requests', () => {
    it('should return the received requests', () => {
      const result: ReceivedRequest[] = subject.getReceivedRequests('/resources/1', 'DELETE');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        method: 'DELETE',
        path: '/resources/1',
        headers: {},
        queryParameters: {}
      });
    });

    it('should return empty array when no requests were received', () => {
      let result: ReceivedRequest[] = subject.getReceivedRequests('/resources/1', 'GET');
      expect(result).toEqual([]);

      result = subject.getReceivedRequests('/resources/1', 'PATCH');
      expect(result).toEqual([]);

      result = subject.getReceivedRequests('/resources/2', 'DELETE');
      expect(result).toEqual([]);

      result = subject.getReceivedRequests('/some/other/endpoint', 'PUT');
      expect(result).toEqual([]);
    });
  });

  describe('get number of received requests', () => {
    it('should calculate number of received requests correctly', () => {
      const result: number = subject.getNumberOfReceivedRequests();
      expect(result).toBe(5);
    });
  });

  describe('reset mock responses', () => {
    it('should reset all mock responses', () => {
      subject.resetMockResponses();
      expect(subject['mockResponses']).toEqual({});
    });

    it('should reset mock responses for all methods of a given path without removing the others', () => {
      subject.resetMockResponses('/resources/1');
      expect(subject['mockResponses']['/resources/1']).toBeUndefined();

      let mockResponses: { [s: string]: unknown } = subject['mockResponses']['/resources'];
      let methods: string[] = Object.keys(mockResponses);
      expect(methods).toHaveLength(1);
      expect(methods).toContain('POST');

      mockResponses = subject['mockResponses']['/resources/2'];
      methods = Object.keys(mockResponses);
      expect(methods).toHaveLength(4);
      expect(methods).toContain('GET');
      expect(methods).toContain('DELETE');
      expect(methods).toContain('PUT');
      expect(methods).toContain('PATCH');
    });

    it('should reset mock responses for a given path/method combination without removing the others', () => {
      subject.resetMockResponses('/resources/1', 'PUT');

      let mockResponses: { [s: string]: unknown } = subject['mockResponses']['/resources/1'];
      let methods: string[] = Object.keys(mockResponses);
      expect(methods).toHaveLength(3);
      expect(methods).toContain('GET');
      expect(methods).toContain('DELETE');
      expect(methods).toContain('PATCH');

      mockResponses = subject['mockResponses']['/resources'];
      methods = Object.keys(mockResponses);
      expect(methods).toHaveLength(1);
      expect(methods).toContain('POST');

      mockResponses = subject['mockResponses']['/resources/2'];
      methods = Object.keys(mockResponses);
      expect(methods).toHaveLength(4);
      expect(methods).toContain('GET');
      expect(methods).toContain('DELETE');
      expect(methods).toContain('PUT');
      expect(methods).toContain('PATCH');
    });

    it('should not remove mock responses of sub paths', () => {
      subject.resetMockResponses('/resources');
      expect(subject['mockResponses']['/resources']).toBeUndefined();
      expect(subject['mockResponses']['/resources/1']).toBeDefined();
      expect(subject['mockResponses']['/resources/2']).toBeDefined();
    });

    it.each([
      ['/foo/bar', undefined],
      ['/foo/bar', 'GET'],
      ['/resources', 'GET']
    ])('should not fail when resetting non-existing mock responses for combination %s %s',
      (path, method) => {
        subject.resetMockResponses(path as string, method as (Method | undefined));
        const mockResponses: { [s: string]: unknown } = subject['mockResponses'];
        expect(mockResponses['/resources']).toBeDefined();
        expect(mockResponses['/resources/1']).toBeDefined();
        expect(mockResponses['/resources/2']).toBeDefined();
      });
  });

  describe('reset received requests', () => {
    it('should reset all received requests', () => {
      subject.resetReceivedRequests();
      expect(subject['receivedRequests']).toEqual({});
    });

    it('should reset received requests for all methods of a given path without removing the others', () => {
      subject.resetReceivedRequests('/otherResources/1');
      expect(subject['receivedRequests']).toEqual({
        '/resources': {
          'POST': [
            {
              method: 'POST',
              path: '/resources',
              headers: {
                'Content-Type': 'application/json'
              },
              queryParameters: {},
              body: {
                name: 'Resource 1',
                content: 'foo',
                value: 123
              }
            }
          ]
        },
        '/resources/1': {
          'DELETE': [
            {
              method: 'DELETE',
              path: '/resources/1',
              headers: {},
              queryParameters: {}
            }
          ]
        }
      });
    });

    it('should reset received requests for a given path/method combination without removing the others', () => {
      subject.resetReceivedRequests('/otherResources/1', 'GET');
      expect(subject['receivedRequests']).toEqual({
        '/resources': {
          'POST': [
            {
              method: 'POST',
              path: '/resources',
              headers: {
                'Content-Type': 'application/json'
              },
              queryParameters: {},
              body: {
                name: 'Resource 1',
                content: 'foo',
                value: 123
              }
            }
          ]
        },
        '/resources/1': {
          'DELETE': [
            {
              method: 'DELETE',
              path: '/resources/1',
              headers: {},
              queryParameters: {}
            }
          ]
        },
        '/otherResources/1': {
          'PUT': [
            {
              method: 'PUT',
              path: '/otherResources/1',
              headers: {
                'Content-Type': 'application/json'
              },
              queryParameters: {},
              body: {
                foo: 'bar',
                baz: 123
              }
            }
          ]
        }
      });
    });

    it('should not remove received requests for sub paths', () => {
      subject.resetReceivedRequests('/resources');
      expect(subject['receivedRequests']).toEqual({
        '/resources/1': {
          'DELETE': [
            {
              method: 'DELETE',
              path: '/resources/1',
              headers: {},
              queryParameters: {}
            }
          ]
        },
        '/otherResources/1': {
          'GET': [
            {
              method: 'GET',
              path: '/otherResources/1',
              headers: {},
              queryParameters: {}
            } as ReceivedRequest,
            {
              method: 'GET',
              path: '/otherResources/1',
              headers: {},
              queryParameters: {}
            } as ReceivedRequest
          ],
          'PUT': [
            {
              method: 'PUT',
              path: '/otherResources/1',
              headers: {
                'Content-Type': 'application/json'
              },
              queryParameters: {},
              body: {
                foo: 'bar',
                baz: 123
              }
            }
          ]
        }
      });
    });

    it.each([
      ['/foo/bar', undefined],
      ['/foo/bar', 'GET'],
      ['/resources', 'GET']
    ])('should not fail when resetting non-existing received requests for combination %s %s', (path, method) => {
      subject.resetReceivedRequests(path as string, method as (Method | undefined));
      expect(subject['receivedRequests']).toEqual({
        '/resources': {
          'POST': [
            {
              method: 'POST',
              path: '/resources',
              headers: {
                'Content-Type': 'application/json'
              },
              queryParameters: {},
              body: {
                name: 'Resource 1',
                content: 'foo',
                value: 123
              }
            }
          ]
        },
        '/resources/1': {
          'DELETE': [
            {
              method: 'DELETE',
              path: '/resources/1',
              headers: {},
              queryParameters: {}
            }
          ]
        },
        '/otherResources/1': {
          'GET': [
            {
              method: 'GET',
              path: '/otherResources/1',
              headers: {},
              queryParameters: {}
            } as ReceivedRequest,
            {
              method: 'GET',
              path: '/otherResources/1',
              headers: {},
              queryParameters: {}
            } as ReceivedRequest
          ],
          'PUT': [
            {
              method: 'PUT',
              path: '/otherResources/1',
              headers: {
                'Content-Type': 'application/json'
              },
              queryParameters: {},
              body: {
                foo: 'bar',
                baz: 123
              }
            }
          ]
        }
      });
    });
  });

  describe('set mock responses', () => {
    it('should add new mock responses', () => {
      const mockRequest: MockRequest = {
        path: '/new/endpoint',
        method: 'GET'
      };
      const mockResponses: MockResponse[] = [
        {
          status: 404
        },
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            foo: 'bar',
            baz: 456
          }
        }
      ];

      subject.setMockResponses(mockRequest, mockResponses, 'ONCE');

      expect(subject['mockResponses']['/new/endpoint']['GET']).toEqual({
        mode: 'ONCE',
        nextResponseIndex: 0,
        mockResponses: mockResponses
      });
    });

    it('should add mock responses in bulk and override existing mock respones', () => {
      const bulk: [MockRequest, MockResponse[], 'ONCE' | 'REPEAT'][] = [];
      bulk.push([{ path: '/a', method: 'POST' }, [{ status: 201, headers: { 'Location': '/a/10' } }], 'REPEAT']);
      bulk.push([{ path: '/a/1', method: 'GET' }, [{ status: 200, body: { foo: 'bar' } }], 'REPEAT']);
      bulk.push([{ path: '/a/1', method: 'DELETE' }, [{ status: 204 }], 'ONCE']);
      bulk.push([{ path: '/resources', method: 'POST' }, [{ status: 400 }], 'REPEAT']);

      subject.setMockResponsesBulk(bulk);

      expect(subject['mockResponses']['/a']['POST']).toEqual({
        mode: 'REPEAT',
        nextResponseIndex: 0,
        mockResponses: [{ status: 201, headers: { 'Location': '/a/10' } }]
      });

      expect(subject['mockResponses']['/a/1']['GET']).toEqual({
        mode: 'REPEAT',
        nextResponseIndex: 0,
        mockResponses: [{ status: 200, body: { foo: 'bar' } }]
      });

      expect(subject['mockResponses']['/a/1']['DELETE']).toEqual({
        mode: 'ONCE',
        nextResponseIndex: 0,
        mockResponses: [{ status: 204 }]
      });

      expect(subject['mockResponses']['/resources']['POST']).toEqual({
        mode: 'REPEAT',
        nextResponseIndex: 0,
        mockResponses: [{ status: 400 }]
      });
    });

    it('should replace existing mock responses', () => {
      const mockRequest: MockRequest = {
        path: '/resources/1',
        method: 'GET'
      };
      const mockResponses: MockResponse[] = [
        {
          status: 404
        },
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            foo: 'bar',
            baz: 456
          }
        }
      ];

      subject.setMockResponses(mockRequest, mockResponses, 'ONCE');

      expect(subject['mockResponses']['/resources/1']['GET']).toEqual({
        mode: 'ONCE',
        nextResponseIndex: 0,
        mockResponses: mockResponses
      });
    });
  });
});