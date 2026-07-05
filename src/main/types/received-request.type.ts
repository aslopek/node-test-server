import { Method } from './method.type';

export type ReceivedRequest = {
  method: Method
  path: string
  headers: { [s: string]: string }
  queryParameters: { [s: string]: string }
  body?: any
}
