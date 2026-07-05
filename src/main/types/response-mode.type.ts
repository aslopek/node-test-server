export const responseModes = ['ONCE', 'REPEAT'] as const;

export type ResponseMode = typeof responseModes[number];
