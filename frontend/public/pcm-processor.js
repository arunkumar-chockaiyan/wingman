class PcmProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.framesCount = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const inputChannel = input[0];

            for (let i = 0; i < inputChannel.length; i++) {
                this.buffer[this.framesCount++] = inputChannel[i];

                if (this.framesCount >= this.bufferSize) {
                    const pcmData = new Int16Array(this.bufferSize);
                    for (let j = 0; j < this.bufferSize; j++) {
                        const s = Math.max(-1, Math.min(1, this.buffer[j]));
                        pcmData[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }
                    this.port.postMessage(pcmData.buffer, [pcmData.buffer]);

                    // Reset buffer
                    this.buffer = new Float32Array(this.bufferSize);
                    this.framesCount = 0;
                }
            }
        }
        return true;
    }
}

registerProcessor("pcm-processor", PcmProcessor);
