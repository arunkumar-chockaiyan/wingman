/**
 * PCM Audio Processor Worklet
 * 
 * Accepts audio at ANY sample rate from the browser's AudioContext,
 * downsamples it to 16kHz (required by Vosk), converts Float32 → Int16 PCM,
 * and posts the resulting buffer to the main thread via postMessage.
 */
class PcmProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.framesCount = 0;

        // The browser's actual sample rate (e.g., 44100 or 48000)
        // sampleRate is a global property available inside AudioWorkletGlobalScope
        this.nativeSampleRate = sampleRate;
        this.targetSampleRate = 16000;
        this.resampleRatio = this.nativeSampleRate / this.targetSampleRate;

        // Listen for a flush command from the main thread so remaining
        // samples are sent before the worklet is disconnected.
        this.port.onmessage = (event) => {
            if (event.data === 'flush') {
                this._flushRemaining();
            }
        };

        console.log(`[pcm-processor] Native sample rate: ${this.nativeSampleRate}, target: ${this.targetSampleRate}, ratio: ${this.resampleRatio.toFixed(2)}`);
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const inputChannel = input[0]; // mono channel

            // Downsample: pick every Nth sample where N = resampleRatio
            // Use linear interpolation for smoother quality
            const ratio = this.resampleRatio;

            if (ratio <= 1) {
                // No downsampling needed (context is already at or below 16kHz)
                for (let i = 0; i < inputChannel.length; i++) {
                    this.buffer[this.framesCount++] = inputChannel[i];
                    this._flushIfFull();
                }
            } else {
                // Downsample from native rate to 16kHz
                // Calculate how many output samples this input block produces
                const inputLen = inputChannel.length;
                for (let outIdx = 0; outIdx < inputLen / ratio; outIdx++) {
                    const srcIdx = outIdx * ratio;
                    const srcIdxFloor = Math.floor(srcIdx);
                    const srcIdxCeil = Math.min(srcIdxFloor + 1, inputLen - 1);
                    const frac = srcIdx - srcIdxFloor;

                    // Linear interpolation between two nearest samples
                    const sample = inputChannel[srcIdxFloor] * (1 - frac) + inputChannel[srcIdxCeil] * frac;
                    this.buffer[this.framesCount++] = sample;
                    this._flushIfFull();
                }
            }
        }
        return true;
    }

    _flushIfFull() {
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

    /** Flush any remaining samples in the buffer (< bufferSize). */
    _flushRemaining() {
        if (this.framesCount > 0) {
            const pcmData = new Int16Array(this.framesCount);
            for (let j = 0; j < this.framesCount; j++) {
                const s = Math.max(-1, Math.min(1, this.buffer[j]));
                pcmData[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            this.port.postMessage(pcmData.buffer, [pcmData.buffer]);
            this.framesCount = 0;
        }
    }
}

registerProcessor("pcm-processor", PcmProcessor);
