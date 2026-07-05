export type HttpsConfig = {
  crt: string,
  key: string
}

export type NodeTestServerConfig = {
  port?: number
  https?: HttpsConfig
  // When true, POST /_/stop calls process.exit after stopping; only bin.js (CLI) should set this
  exitProcessOnStop?: boolean
}
