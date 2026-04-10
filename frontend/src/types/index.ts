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
    /** True while the utterance is still in progress; false/absent once Vosk finalises it. */
    partial?: boolean;
    /**
     * 0 = first speaker (left), 1 = second speaker (right).
     * Inferred from silence gaps between utterances (WebRTC VAD heuristic).
     * Undefined for simulator chunks — those use the speaker field instead.
     */
    speakerIndex?: number;
}
