export interface Insight {
    id?: string;
    agentId?: string;
    category?: string;
    type: string; // Action, Positive, Negative, Info
    content: string;
    timestamp?: number;
}

export interface TranscriptChunk {
    transcript: string;
    timestamp: number;
    speaker?: string;
}
